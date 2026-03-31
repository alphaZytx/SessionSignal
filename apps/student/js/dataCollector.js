export class DataCollector {
    constructor(intervalMs = 5000) {
        this.intervalMs = intervalMs;
        this.frameBuffer = [];
        this.intervalStartTime = Date.now();
        
        // Session memory
        this.totalIntervals = 0;
        this.totalFrames = 0;
        this.sumAttentionScores = 0;
        this.attentionTimeline = [];
        this.emotionTimeline = [];
        this.alertCounts = {};
        
        // Cumulative state tracking
        this.totalFocusedTime = 0;
        this.totalDistractedTime = 0;
        this.totalAwayTime = 0;
        this.peakAttention = { start: null, end: null, score: 0 };
        this.lowestAttention = { start: null, end: null, score: 100 };
    }

    addFrame(metrics) {
        // Deep clone or extract only needed numeric/string fields cleanly
        this.frameBuffer.push({ ...metrics, timestamp: Date.now() });
        this.totalFrames++;
    }

    // Helper: calculate statistical values
    _calcStats(arr) {
        if (!arr || arr.length === 0) return { mean: 0, min: 0, max: 0, stdDev: 0, trend: 0 };
        
        let sum = 0, min = Infinity, max = -Infinity;
        arr.forEach(val => {
            sum += val;
            if (val < min) min = val;
            if (val > max) max = val;
        });
        const mean = sum / arr.length;
        
        let sumSqDiff = 0;
        arr.forEach(val => sumSqDiff += Math.pow(val - mean, 2));
        const stdDev = Math.sqrt(sumSqDiff / arr.length);

        // Trend: simple linear regression slope over last N items (e.g. 12)
        const trendLen = Math.min(arr.length, 12);
        const trendArr = arr.slice(-trendLen);
        let trend = 0;
        if (trendLen > 1) {
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for (let i = 0; i < trendLen; i++) {
                sumX += i;
                sumY += trendArr[i];
                sumXY += i * trendArr[i];
                sumX2 += i * i;
            }
            const slope = (trendLen * sumXY - sumX * sumY) / (trendLen * sumX2 - sumX * sumX);
            // Ignore tiny slopes
            trend = Math.abs(slope) < 0.1 ? 0 : slope; 
        }

        return {
            mean: parseFloat(mean.toFixed(2)),
            min: parseFloat(min.toFixed(2)),
            max: parseFloat(max.toFixed(2)),
            stdDev: parseFloat(stdDev.toFixed(2)),
            trend: parseFloat(trend.toFixed(2))
        };
    }

    // Helper: Mode calculation
    _calcMode(arr) {
        if (!arr || arr.length === 0) return null;
        const counts = {};
        let maxCount = 0;
        let mode = arr[0];
        arr.forEach(val => {
            counts[val] = (counts[val] || 0) + 1;
            if (counts[val] > maxCount) {
                maxCount = counts[val];
                mode = val;
            }
        });
        return mode;
    }

    flush() {
        const intervalEndTime = Date.now();
        const duration = intervalEndTime - this.intervalStartTime;
        const frames = this.frameBuffer;
        
        if (frames.length === 0) {
            this.intervalStartTime = intervalEndTime;
            return null; // Nothing to flush
        }

        const count = frames.length;

        // Extract arrays
        // Extract arrays
        const faceConfs = frames.map(f => f.faceConfidence || 0.99);
        const attScores = frames.map(f => f.attentionScore || 0);
        const gazeDevs = frames.map(f => f.gazeDeviation || 0);
        const gazeXs = frames.map(f => f.gazeX || 0);
        const gazeYs = frames.map(f => f.gazeY || 0);
        const pitch = frames.map(f => f.headPosePitch || 0);
        const yaw = frames.map(f => f.headPoseYaw || 0);
        const roll = frames.map(f => f.headPoseRoll || 0);
        const eyeL = frames.map(f => f.eyeOpennessLeft || 0);
        const eyeR = frames.map(f => f.eyeOpennessRight || 0);
        const blinkRates = frames.map(f => f.blinkRate || 0);
        const mouthOps = frames.map(f => f.mouthOpenness || 0);
        const drowsyMs = frames.map(f => f.drowsinessScore || 0);

        // Numeric stats calculation
        const statFaceConf = this._calcStats(faceConfs);
        const statAttention = this._calcStats(attScores);
        const statGazeDev = this._calcStats(gazeDevs);
        const statGazeX = this._calcStats(gazeXs);
        const statGazeY = this._calcStats(gazeYs);
        const statPitch = this._calcStats(pitch);
        const statYaw = this._calcStats(yaw);
        const statRoll = this._calcStats(roll);
        const statEyeL = this._calcStats(eyeL);
        const statEyeR = this._calcStats(eyeR);
        const statBlink = this._calcStats(blinkRates);
        const statMouth = this._calcStats(mouthOps);
        const statDrowsy = this._calcStats(drowsyMs);

        // Booleans (% true)
        const pctFace = (frames.filter(f => f.faceDetected).length / count) * 100;
        const pctGaze = (frames.filter(f => f.gazeOnScreen).length / count) * 100;
        const pctEyesClosed = (frames.filter(f => f.eyesClosed).length / count) * 100;
        const yawnDetected = frames.some(f => f.yawnDetected);

        // Categoricals (mode)
        const headModes = frames.map(f => f.headPoseCategory || 'forward');
        const attModes = frames.map(f => f.attentionCategory || 'neutral');
        const emoModes = frames.map(f => f.emotion || 'neutral');
        
        const modeHeadPose = this._calcMode(headModes);
        const modeAttention = this._calcMode(attModes);
        const modeEmotion = this._calcMode(emoModes);

        // Emotion Distribution
        const emotionDist = { focused: 0, confused: 0, bored: 0, engaged: 0, distracted: 0, drowsy: 0, neutral: 0 };
        frames.forEach(f => {
            const e = f.emotion || 'neutral';
            if (emotionDist[e] !== undefined) emotionDist[e]++;
        });
        for (const k in emotionDist) emotionDist[k] = parseFloat(((emotionDist[k] / count) * 100).toFixed(1));

        // Derived interval metrics
        const intervalAttentionScore = Math.round(statAttention.mean);
        let attentionTrendLabel = 'stable';
        if (statAttention.trend > 0.5) attentionTrendLabel = 'improving';
        else if (statAttention.trend < -0.5) attentionTrendLabel = 'declining';
        
        let alertFlags = [];
        if (pctGaze < 40 && pctFace > 0) alertFlags.push("GAZE_OFF");
        if (modeHeadPose !== 'forward') alertFlags.push("HEAD_TURNED");
        if (statDrowsy.mean > 0.5) alertFlags.push("DROWSY");
        if (yawnDetected) alertFlags.push("YAWNING");
        if (intervalAttentionScore < 35) alertFlags.push("HIGH_DISTRACTION");
        if (statBlink.mean < 8 && intervalAttentionScore < 60) alertFlags.push("LOW_BLINK"); // Add condition to prevent flagging deep focus as an alert
        if (pctEyesClosed > 20) alertFlags.push("EYES_CLOSED");

        // Aggregated payload
        const aggregatedPayload = {
            timing: {
                frameCount: count,
                intervalDurationMs: duration,
                intervalStartTime: this.intervalStartTime,
                intervalEndTime: intervalEndTime
            },
            faceConfidence: { mean: statFaceConf.mean },
            attentionScore: statAttention,
            gazeDeviation: { mean: statGazeDev.mean, max: statGazeDev.max },
            gazeX: { mean: statGazeX.mean },
            gazeY: { mean: statGazeY.mean },
            headPosePitch: { mean: statPitch.mean, stdDev: statPitch.stdDev },
            headPoseYaw: { mean: statYaw.mean, stdDev: statYaw.stdDev },
            headPoseRoll: { mean: statRoll.mean },
            eyeOpennessLeft: { mean: statEyeL.mean, min: statEyeL.min },
            eyeOpennessRight: { mean: statEyeR.mean, min: statEyeR.min },
            blinkRate: { mean: statBlink.mean },
            mouthOpenness: { mean: statMouth.mean },
            drowsinessScore: { mean: statDrowsy.mean },
            
            percentages: {
                gazeOnScreen: parseFloat(pctGaze.toFixed(1)),
                faceDetected: parseFloat(pctFace.toFixed(1)),
                eyesClosed: parseFloat(pctEyesClosed.toFixed(1))
            },
            
            modes: {
                headPoseCategory: modeHeadPose,
                attentionCategory: modeAttention,
                emotion: modeEmotion
            },
            
            eventFlags: {
                yawnDetected
            },
            
            emotionDistribution: emotionDist,
            
            computed: {
                intervalAttentionScore,
                attentionTrend: attentionTrendLabel,
                alertFlags
            }
        };

        // --- Update Session Summary ---
        this.totalIntervals++;
        this.sumAttentionScores += intervalAttentionScore;
        this.attentionTimeline.push({ timestamp: intervalEndTime, score: intervalAttentionScore });
        this.emotionTimeline.push({ timestamp: intervalEndTime, emotion: modeEmotion });
        
        alertFlags.forEach(flag => {
            this.alertCounts[flag] = (this.alertCounts[flag] || 0) + 1;
        });

        // Time tracking sum (based purely on frames to avoid clock drift)
        // Assume 5 seconds total; apportion based on percentages.
        const durationSec = duration / 1000;
        this.totalAwayTime += durationSec * ((100 - pctFace) / 100);
        const presentSec = durationSec * (pctFace / 100);
        
        if (intervalAttentionScore >= 60) {
            this.totalFocusedTime += presentSec;
            if (intervalAttentionScore > this.peakAttention.score) {
                this.peakAttention = { start: this.intervalStartTime, end: intervalEndTime, score: intervalAttentionScore };
            }
        } else if (intervalAttentionScore < 40) {
            this.totalDistractedTime += presentSec;
            if (intervalAttentionScore < this.lowestAttention.score) {
                this.lowestAttention = { start: this.intervalStartTime, end: intervalEndTime, score: intervalAttentionScore };
            }
        }

        // Reset
        this.frameBuffer = [];
        this.intervalStartTime = intervalEndTime;

        return aggregatedPayload;
    }

    getSessionSummary() {
        const totalSessionTime = (this.totalFocusedTime + this.totalDistractedTime + this.totalAwayTime) || 1;
        return {
            totalIntervals: this.totalIntervals,
            totalFrames: this.totalFrames,
            overallAttentionScore: this.totalIntervals > 0 ? parseFloat((this.sumAttentionScores / this.totalIntervals).toFixed(1)) : 0,
            attentionTimeline: this.attentionTimeline,
            emotionTimeline: this.emotionTimeline,
            totalAlerts: this.alertCounts,
            focusPercentage: parseFloat(((this.totalFocusedTime / totalSessionTime) * 100).toFixed(1)),
            distractedPercentage: parseFloat(((this.totalDistractedTime / totalSessionTime) * 100).toFixed(1)),
            awayPercentage: parseFloat(((this.totalAwayTime / totalSessionTime) * 100).toFixed(1)),
            peakAttentionPeriod: this.peakAttention,
            lowestAttentionPeriod: this.lowestAttention
        };
    }
}
