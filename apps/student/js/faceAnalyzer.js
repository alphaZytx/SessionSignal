export class FaceAnalyzer {
    constructor(videoElement, canvasElement, onDataCallback, options = {}) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.canvasCtx = canvasElement.getContext('2d');
        this.onDataCallback = onDataCallback;

        // Initialize MediaPipe FaceMesh
        const assetBase = options.assetBase || globalThis.SESSIONSIGNAL_MEDIAPIPE_ASSET_BASE || 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/';
        this.faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `${assetBase}${file}`;
            }
        });

        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true, // Enables iris tracking (468-477)
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.faceMesh.onResults(this.onResults.bind(this));

        // State & Buffers
        this.earBufferLeft = [];
        this.earBufferRight = [];
        this.blinkCount = 0;
        this.yawnCount = 0;
        this.yawnFrames = 0; // tracking duration of yawn
        this.distractionFrames = 0; // tracking duration of distraction
        
        // Time tracking
        this.sessionStartTime = Date.now();
        this.lastFrameTime = Date.now();
        this.totalFramesAnalyzed = 0;
        this.focusedTimeSeconds = 0;
        this.distractedTimeSeconds = 0;
        this.awayTimeSeconds = 0;
        
        this.focusStreak = 0;
        this.longestFocusStreak = 0;
        this.distractionCount = 0;
        this.wasDistracted = false;
        this.distractionStartTime = 0;
        this.recoveryTimes = [];

        this.currentMetrics = { faceDetected: false };
    }

    async start() {
        // Initialize Camera using Camera Utils
        // Requires: <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                await this.faceMesh.send({ image: this.videoElement });
            },
            width: 640,
            height: 480
        });
        
        // Start the camera
        await this.camera.start();
        this.sessionStartTime = Date.now();
        this.lastFrameTime = Date.now();
    }

    stop() {
        if (this.camera) {
            this.camera.stop();
        }
        const stream = this.videoElement?.srcObject;
        if (stream?.getTracks) stream.getTracks().forEach(track => track.stop());
        if (this.videoElement) this.videoElement.srcObject = null;
        this.currentMetrics = { faceDetected: false, attentionScore: null, attentionCategory: 'unavailable' };
    }

    onResults(results) {
        this.totalFramesAnalyzed++;
        const now = Date.now();
        const deltaTimeMs = now - this.lastFrameTime;
        const deltaTimeSec = deltaTimeMs / 1000;
        this.lastFrameTime = now;

        const canvas = this.canvasElement;
        const ctx = this.canvasCtx;
        
        // Clear canvas
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Map dimensions
        const width = canvas.width;
        const height = canvas.height;

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];

            // ==========================================
            // GROUP 1: PRESENCE
            // ==========================================
            const faceDetected = true;
            // MediaPipe Face Mesh does not expose a trustworthy per-frame detection
            // confidence here. Keep it unavailable instead of fabricating a value.
            const faceConfidence = null;
            
            // Calculate bounding box
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            for (const lm of landmarks) {
                if (lm.x < minX) minX = lm.x;
                if (lm.y < minY) minY = lm.y;
                if (lm.x > maxX) maxX = lm.x;
                if (lm.y > maxY) maxY = lm.y;
            }
            const faceBoundingBox = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY
            };

            // ==========================================
            // GROUP 2: GAZE & EYE DIRECTION
            // ==========================================
            // Iris landmarks: Left (468-472), Right (473-477)
            // Center of left iris is approx 468, center of right iris is approx 473
            // Eye corners: Left (33, 133), Right (362, 263)
            
            const leftIris = landmarks[468];
            const rightIris = landmarks[473];
            
            const leftEyeInner = landmarks[133];
            const leftEyeOuter = landmarks[33];
            const rightEyeInner = landmarks[362];
            const rightEyeOuter = landmarks[263];

            // Normalize iris position relative to eye width
            const leftEyeWidth = Math.abs(leftEyeInner.x - leftEyeOuter.x);
            const rightEyeWidth = Math.abs(rightEyeInner.x - rightEyeOuter.x);
            
            // X position relative to eye corners (0 to 1)
            const leftIrisRelX = leftEyeWidth > 0 ? Math.abs(leftIris.x - leftEyeOuter.x) / leftEyeWidth : 0.5;
            const rightIrisRelX = rightEyeWidth > 0 ? Math.abs(rightIris.x - rightEyeInner.x) / rightEyeWidth : 0.5;
            
            // Average gaze directions (-1 to 1)
            const avgIrisRelX = (leftIrisRelX + rightIrisRelX) / 2;
            const gazeX = (avgIrisRelX - 0.5) * 2; 

            // Y position (simplified heuristic using distance from top of eye 159 to bottom 145)
            const leftEyeHeight = Math.abs(landmarks[159].y - landmarks[145].y);
            const leftIrisRelY = leftEyeHeight > 0 ? Math.abs(leftIris.y - landmarks[159].y) / leftEyeHeight : 0.5;
            const gazeY = (leftIrisRelY - 0.5) * 2;

            const gazeDeviation = Math.sqrt(gazeX * gazeX + gazeY * gazeY);
            
            // Rule: relative X between 0.35 and 0.65 is roughly straight ahead 
            // (tightened from 0.25-0.75 for realism, based on standard webcams)
            const gazeOnScreen = (avgIrisRelX > 0.35 && avgIrisRelX < 0.65 && Math.abs(gazeY) < 0.4);

            // ==========================================
            // GROUP 3: HEAD POSE
            // ==========================================
            // Pseudo-pose estimation using face landmarks
            const noseTip = landmarks[1];
            const chin = landmarks[152];
            const leftMouth = landmarks[61];
            const rightMouth = landmarks[291];

            // Yaw: difference in length between left side and right side of face
            const dLeft = Math.abs(noseTip.x - leftEyeOuter.x);
            const dRight = Math.abs(rightEyeOuter.x - noseTip.x);
            // normal yaw is 0. looking left (negative), looking right (positive)
            const headPoseYaw = ((dRight - dLeft) / (dRight + dLeft)) * 90;

            // Pitch: relationship between nose, eyes, and chin
            const eyeAvgY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
            const noseToEyeY = noseTip.y - eyeAvgY;
            const chinToNoseY = chin.y - noseTip.y;
            // Negative = looking down, Positive = looking up
            const headPosePitch = ((chinToNoseY - noseToEyeY) / (chinToNoseY + noseToEyeY)) * -90 + 30; // offset calibration

            // Roll: angle of eyes
            const headPoseRoll = Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x) * (180 / Math.PI);

            let headPoseCategory = 'forward';
            if (Math.abs(headPoseYaw) < 15 && Math.abs(headPosePitch) < 15) headPoseCategory = 'forward';
            else if (headPosePitch < -20) headPoseCategory = 'looking_down';
            else if (headPoseYaw > 20) headPoseCategory = 'looking_right';
            else if (headPoseYaw < -20) headPoseCategory = 'looking_left';
            else if (Math.abs(headPoseRoll) > 20) headPoseCategory = 'tilted';
            else if (headPosePitch > 15) headPoseCategory = 'looking_up';

            // ==========================================
            // GROUP 4: EYE STATE & EAR
            // ==========================================
            // EAR = (|P2-P6| + |P3-P5|) / (2 * |P1-P4|)
            const calcEAR = (p1, p2, p3, p4, p5, p6) => {
                const dist = (a, b) => Math.sqrt(Math.pow(landmarks[a].x - landmarks[b].x, 2) + Math.pow(landmarks[a].y - landmarks[b].y, 2));
                return (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4));
            };

            const earLeft = calcEAR(33, 160, 159, 133, 145, 144);
            const earRight = calcEAR(362, 385, 386, 263, 374, 373);
            
            // Normalize slightly (typical EAR is 0.2 to 0.4)
            const eyeOpennessLeft = Math.min(1.0, Math.max(0, (earLeft - 0.1) / 0.25));
            const eyeOpennessRight = Math.min(1.0, Math.max(0, (earRight - 0.1) / 0.25));
            const eyeOpennessAvg = (eyeOpennessLeft + eyeOpennessRight) / 2;
            const eyesClosed = (earLeft < 0.2 && earRight < 0.2);

            // Ring buffer for Blink Detection
            this.earBufferLeft.push(earLeft);
            this.earBufferRight.push(earRight);
            if (this.earBufferLeft.length > 10) this.earBufferLeft.shift();
            if (this.earBufferRight.length > 10) this.earBufferRight.shift();

            // Simple blink detection: check if previous EARs had a drop
            let blinkDetected = false;
            if (this.earBufferLeft.length === 10) {
                const prevEarL = this.earBufferLeft[5];
                const currEarL = this.earBufferLeft[9];
                if (prevEarL < 0.15 && currEarL > 0.25) {
                    blinkDetected = true;
                    this.blinkCount++;
                }
            }

            // Blink Rate (per minute)
            const sessionDurationMins = (Date.now() - this.sessionStartTime) / 60000;
            const blinkRate = sessionDurationMins > 0 ? this.blinkCount / sessionDurationMins : 0;

            let blinkRateCategory = 'normal';
            if (blinkRate > 25) blinkRateCategory = 'high_stress';
            else if (blinkRate < 8 && sessionDurationMins > 1) blinkRateCategory = 'deep_focus';

            // Drowsiness: eyes closed or very low EAR for extended periods
            let drowsinessScore = eyesClosed ? 1.0 : (Math.max(0, 0.4 - eyeOpennessAvg) * 2.5);

            // ==========================================
            // GROUP 5: MOUTH STATE & MAR
            // ==========================================
            // MAR = vertical / horizontal
            const distLms = (a, b) => Math.sqrt(Math.pow(landmarks[a].x - landmarks[b].x, 2) + Math.pow(landmarks[a].y - landmarks[b].y, 2));
            const mouthVert = distLms(13, 14);
            const mouthHoriz = distLms(61, 291);
            const mar = mouthHoriz > 0 ? mouthVert / mouthHoriz : 0;
            
            const mouthOpenness = Math.min(1.0, mar * 1.5); // Normalize roughly
            
            let yawnDetected = false;
            if (mar > 0.5) {
                this.yawnFrames += deltaTimeSec;
                if (this.yawnFrames > 1.5) {
                    yawnDetected = true;
                    this.yawnCount++;
                    this.yawnFrames = 0; // reset
                }
            } else {
                this.yawnFrames = 0;
            }

            let mouthCategory = 'closed';
            if (yawnDetected || mar > 0.6) mouthCategory = 'yawning';
            else if (mar > 0.25) mouthCategory = 'talking';
            else if (mar > 0.1) mouthCategory = 'slightly_open';

            // ==========================================
            // GROUP 6: EMOTION CLASSIFICATION
            // ==========================================
            // Furrowed brow approximation (distance between 107 and 336)
            const browDist = distLms(107, 336);
            const browFurrowed = (browDist < 0.35); // Requires calibration, simple dummy logic

            let emotionScores = {
                focused: (gazeOnScreen ? 0.6 : 0) + (headPoseCategory === 'forward' ? 0.3 : 0) + (eyeOpennessAvg > 0.5 ? 0.1 : 0),
                confused: (browFurrowed ? 0.5 : 0) + (Math.abs(headPoseRoll) > 10 ? 0.5 : 0),
                bored: (eyeOpennessAvg < 0.4 ? 0.3 : 0) + (blinkRateCategory === 'high_stress' ? 0.2 : 0) + (mouthCategory === 'yawning' ? 0.5 : 0),
                engaged: (headPoseCategory === 'forward' && gazeOnScreen && mouthCategory !== 'yawning' ? 1.0 : 0),
                distracted: (!gazeOnScreen ? 0.5 : 0) + (headPoseCategory !== 'forward' ? 0.5 : 0),
                drowsy: drowsinessScore
            };

            // Enhance distraction if looking away for long
            if (!gazeOnScreen || headPoseCategory !== 'forward') {
                this.distractionFrames += deltaTimeSec;
                if (this.distractionFrames > 3) emotionScores.distracted += 0.5;
            } else {
                this.distractionFrames = 0;
            }

            // Find highest score
            let primaryEmotion = 'neutral';
            let maxScore = 0.1; // Base threshold
            
            for (const [emo, score] of Object.entries(emotionScores)) {
                if (score > maxScore) {
                    maxScore = score;
                    primaryEmotion = emo;
                }
            }
            
            // Normalize scores
            if (maxScore > 0) {
                for (const emo of Object.keys(emotionScores)) {
                    emotionScores[emo] = Math.min(1.0, emotionScores[emo] / maxScore);
                }
            }
            
            // ==========================================
            // GROUP 7: ATTENTION SCORE
            // ==========================================
            const isPosEmotion = primaryEmotion === 'focused' || primaryEmotion === 'engaged';
            
            let attentionRaw = (
                (gazeOnScreen ? 1 : 0) * 35 +
                (headPoseCategory === 'forward' ? 1 : 0) * 25 +
                (1 - drowsinessScore) * 20 +
                (1 - Math.min(1, gazeDeviation)) * 10 +
                (isPosEmotion ? 1 : 0) * 10
            );
            
            const attentionScore = Math.max(0, Math.min(100, Math.round(attentionRaw)));
            
            let attentionCategory = 'disengaged';
            if (attentionScore >= 80) attentionCategory = 'highly_focused';
            else if (attentionScore >= 60) attentionCategory = 'focused';
            else if (attentionScore >= 40) attentionCategory = 'neutral';
            else if (attentionScore >= 20) attentionCategory = 'distracted';

            // ==========================================
            // GROUP 8: SESSION METRICS (Cumulative)
            // ==========================================
            if (attentionScore >= 60) {
                this.focusedTimeSeconds += deltaTimeSec;
                this.focusStreak += deltaTimeSec;
                
                if (this.focusStreak > this.longestFocusStreak) {
                    this.longestFocusStreak = Math.round(this.focusStreak);
                }
                
                if (this.wasDistracted) {
                    const recTime = (Date.now() - this.distractionStartTime) / 1000;
                    this.recoveryTimes.push(recTime);
                    this.wasDistracted = false;
                }
            } else if (attentionScore < 40) {
                this.distractedTimeSeconds += deltaTimeSec;
                this.focusStreak = 0;
                
                if (!this.wasDistracted) {
                    this.wasDistracted = true;
                    this.distractionCount++;
                    this.distractionStartTime = Date.now();
                }
            } else {
                // Neutral zone breaks streak but doesn't count as full distraction
                this.focusStreak = 0;
            }

            const avgRecoveryTime = this.recoveryTimes.length > 0 
                ? this.recoveryTimes.reduce((a,b)=>a+b, 0) / this.recoveryTimes.length 
                : 0;

            // ==========================================
            // STATE UPDATE
            // ==========================================
            this.currentMetrics = {
                // 1. Presence
                faceDetected,
                faceConfidence,
                faceBoundingBox,
                
                // 2. Gaze
                gazeOnScreen,
                gazeX,
                gazeY,
                gazeDeviation,
                leftIrisPosition: { x: leftIris.x, y: leftIris.y },
                rightIrisPosition: { x: rightIris.x, y: rightIris.y },
                
                // 3. Head Pose
                headPosePitch,
                headPoseYaw,
                headPoseRoll,
                headPoseCategory,
                
                // 4. Eye State
                eyeOpennessLeft,
                eyeOpennessRight,
                eyeOpennessAvg,
                eyesClosed,
                drowsinessScore,
                blinkDetected,
                blinkCount: this.blinkCount,
                blinkRate,
                blinkRateCategory,
                
                // 5. Mouth State
                mouthOpenness,
                yawnDetected,
                yawnCount: this.yawnCount,
                mouthCategory,
                
                // 6. Emotion
                emotion: primaryEmotion,
                emotionScores,
                emotionConfidence: maxScore,
                
                // 7. Attention
                attentionScore,
                attentionCategory,
                
                // 8. Session Metrics
                totalFramesAnalyzed: this.totalFramesAnalyzed,
                focusedTimeSeconds: this.focusedTimeSeconds,
                distractedTimeSeconds: this.distractedTimeSeconds,
                awayTimeSeconds: this.awayTimeSeconds,
                focusStreak: Math.round(this.focusStreak),
                longestFocusStreak: this.longestFocusStreak,
                distractionCount: this.distractionCount,
                recoveryTime: avgRecoveryTime
            };

            // ==========================================
            // CANVAS OVERLAY
            // ==========================================
            // Draw face mesh landmarks (tiny green dots)
            ctx.fillStyle = "rgba(0, 255, 0, 0.6)";
            for (const lm of landmarks) {
                ctx.beginPath();
                ctx.arc(lm.x * width, lm.y * height, 1, 0, 2 * Math.PI);
                ctx.fill();
            }

            // Draw iris (cyan)
            ctx.fillStyle = "cyan";
            ctx.beginPath();
            ctx.arc(leftIris.x * width, leftIris.y * height, 3, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(rightIris.x * width, rightIris.y * height, 3, 0, 2 * Math.PI);
            ctx.fill();

            // Bounding box color
            let boxColor = 'red';
            if (attentionScore > 60) boxColor = 'green';
            else if (attentionScore > 40) boxColor = 'orange';

            // Draw bounded box
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2;
            const bx = faceBoundingBox.x * width;
            const by = faceBoundingBox.y * height;
            const bw = faceBoundingBox.width * width;
            const bh = faceBoundingBox.height * height;
            ctx.strokeRect(bx, by, bw, bh);

            // Draw attention score text above box
            ctx.fillStyle = boxColor;
            ctx.font = '16px Arial';
            ctx.fillText(`Att: ${attentionScore}`, bx, by - 10);

            // Draw Head pose direction arrow from nose point
            ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            const startX = noseTip.x * width;
            const startY = noseTip.y * height;
            // Map yaw/pitch roughly to line destination
            const endX = startX + (headPoseYaw * 2);
            const endY = startY + (headPosePitch * -2); // invert pitch for canvas coords
            
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

        } else {
            // NO FACE DETECTED
            this.awayTimeSeconds += deltaTimeSec;
            this.focusStreak = 0;
            
            this.currentMetrics = {
                faceDetected: false,
                attentionScore: null,
                attentionCategory: 'unavailable',
                emotion: 'neutral',
                awayTimeSeconds: this.awayTimeSeconds,
                focusedTimeSeconds: this.focusedTimeSeconds,
                distractedTimeSeconds: this.distractedTimeSeconds,
                focusStreak: 0,
                longestFocusStreak: this.longestFocusStreak,
                distractionCount: this.distractionCount
            };
            
            ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
            ctx.font = '24px Arial';
            ctx.fillText("FACE NOT DETECTED", 20, 40);
        }

        ctx.restore();

        // Call callback every frame
        if (this.onDataCallback) {
            this.onDataCallback(this.currentMetrics);
        }
    }
}

/**
 * Helper function to build the final telemetry payload for WebSockets
 */
export function buildPayload(metrics, studentId, studentName, sessionId) {
    // If no face detected, return a minimal payload
    if (!metrics.faceDetected) {
        return {
            studentId,
            studentName,
            sessionId,
            timestamp: Date.now(),
            payloadVersion: "1.0",
            faceDetected: false,
            attentionScore: null,
            engagementScore: null,
            signalState: 'unavailable',
            emotion: 'neutral',
            awayTimeSeconds: metrics.awayTimeSeconds || 0,
            focusStreakSeconds: 0,
            distractionCount: metrics.distractionCount || 0
        };
    }

    // Return the full clean JSON payload mapping metrics logically
    return {
        studentId,
        studentName,
        sessionId,
        timestamp: Date.now(),
        payloadVersion: "1.0",
        
        faceDetected: true,
        faceConfidence: null,
        signalState: 'observable',
        
        // Key routing stats expected by the server
        attentionScore: metrics.attentionScore,
        engagementScore: Math.min(100, Math.round((metrics.attentionScore * 0.7) + (metrics.focusStreak * 2))),
        emotion: metrics.emotion,
        gazeOnScreen: metrics.gazeOnScreen,
        gazeX: parseFloat(metrics.gazeX.toFixed(3)),
        gazeY: parseFloat(metrics.gazeY.toFixed(3)),
        gazeDeviation: parseFloat(metrics.gazeDeviation.toFixed(3)),
        headPosePitch: Math.round(metrics.headPosePitch),
        headPoseYaw: Math.round(metrics.headPoseYaw),
        headPoseRoll: Math.round(metrics.headPoseRoll),
        eyeOpennessLeft: parseFloat(metrics.eyeOpennessLeft.toFixed(2)),
        eyeOpennessRight: parseFloat(metrics.eyeOpennessRight.toFixed(2)),
        eyesClosed: metrics.eyesClosed,
        mouthOpenness: parseFloat(metrics.mouthOpenness.toFixed(2)),
        yawnDetected: metrics.yawnDetected,
        yawnCount: metrics.yawnCount,
        distractionCount: metrics.distractionCount,
        focusStreakSeconds: metrics.focusStreak,
        awayTimeSeconds: Math.round(metrics.awayTimeSeconds),
        
        // Detailed AI states for potential future use or debugging
        blinkRate: Math.round(metrics.blinkRate),
        drowsinessScore: parseFloat(metrics.drowsinessScore.toFixed(2)),
        headPoseCategory: metrics.headPoseCategory
    };
}
