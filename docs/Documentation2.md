# Student Attention Monitoring System — Detailed Explanation (Part 2 of 3)

## Student Client: Computer Vision Pipeline, Data Collection & Socket Communication

---

## 7. Student App Overview (`apps/student/`)

```
apps/student/
├── index.html          ← Join page (name + session code form)
├── monitor.html        ← Main monitoring page (camera + metrics + charts)
├── css/student.css     ← All styles for both pages
└── js/
    ├── faceAnalyzer.js   ← MediaPipe FaceMesh CV pipeline (560 lines)
    ├── dataCollector.js  ← 5-second interval aggregator (267 lines)
    └── socketClient.js   ← WebSocket communication layer (148 lines)
```

The student app has two pages and three JavaScript modules. This separation follows **Single Responsibility Principle** — each module does one thing.

---

## 8. Join Page (`index.html`)

A simple form with two fields: Student Name and Session Code.

**Key behavior:**
```javascript
// Clear stale session data so monitor.html always redirects back here
localStorage.removeItem('studentName');
localStorage.removeItem('sessionId');

document.getElementById('joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('studentName').value.trim();
    const code = document.getElementById('sessionCode').value.trim();
    if (name && code) {
        localStorage.setItem('studentName', name);
        localStorage.setItem('sessionId', code);
        window.location.href = 'monitor.html';
    }
});
```

**Why `localStorage`?** — The join page and monitor page are separate HTML files. `localStorage` persists data across page navigations (unlike URL parameters which could be bookmarked/shared accidentally with session codes).

**Why clear on load?** — If a student returns to the join page, any stale session data is wiped. This prevents the monitor page from trying to reconnect to an expired session.

**Why `maxlength="6" pattern=".{6,6}"`?** — Session codes are exactly 6 characters. HTML validation enforces this before submission.

---

## 9. Monitor Page (`monitor.html`) — The Orchestrator

This is the main page where the magic happens. It:
1. Reads name/code from `localStorage` (redirects to join page if missing)
2. Initializes the Socket.io connection
3. Initializes the FaceAnalyzer (MediaPipe camera + CV)
4. Initializes the DataCollector (5-second aggregation buffer)
5. Runs a `setInterval` every 5 seconds to flush aggregated data to the server

### 9.1 CDN Dependencies

```html
<script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

**Why CDNs instead of npm?** — The student app is plain HTML with no bundler. CDNs provide:
- Zero build step (no Webpack/Vite needed)
- Browser caching (repeated visits load instantly)
- No `node_modules` bloat in the student folder

### 9.2 UI Layout

The monitor page has a **split layout**:
- **Left column (40%)**: Video feed with canvas overlay + status panel (face detected, gaze status, emotion, attention ring)
- **Right column (60%)**: 8 metric cards (attention score, engagement, emotion, gaze, blink rate, eye openness, head pose, focus streak) + sparkline chart
- **Top bar**: Student name, session code, connection status, leave button
- **Bottom bar**: Transmission counter and timestamp

### 9.3 The Main Loop (Lines 452–473)

```javascript
setInterval(() => {
    const intervalData = dataCollector.flush();
    if (intervalData) {
        updateSparkline(intervalData.computed.intervalAttentionScore);
        const fullPayload = buildPayload(
            faceAnalyzer.currentMetrics,
            socketClient.studentId,
            studentName,
            sessionId
        );
        fullPayload.aggregates = intervalData;
        socketClient.sendPayload(fullPayload);
    }
}, 5000);
```

**Why 5 seconds?**
- Sending every frame (~30fps) would flood the server with 30 payloads/second per student. For 30 students, that's 900 messages/second.
- 5-second intervals reduce this to 6 messages/student/minute, which is manageable.
- The `DataCollector` aggregates ~150 frames into statistical summaries (mean, min, max, stdDev, trend).

**Data flow:**
```
Camera → FaceMesh → FaceAnalyzer.onResults() → per-frame metrics
    ↓ (every frame)
DataCollector.addFrame(metrics)  ← buffers frames
    ↓ (every 5 seconds)
DataCollector.flush()  ← computes stats over buffered frames
    ↓
buildPayload()  ← combines latest frame + 5-sec aggregates
    ↓
SocketClient.sendPayload()  ← emits 'student:data' to server
```

---

## 10. FaceAnalyzer (`faceAnalyzer.js`) — The CV Engine (560 lines)

This is the most technically complex file. It uses **MediaPipe FaceMesh** to extract 478 3D facial landmarks from each video frame and computes 8 groups of metrics.

### 10.1 Initialization

```javascript
this.faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

this.faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,   // Enables iris landmarks (468-477)
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
```

**Why `maxNumFaces: 1`?** — We're monitoring one student per browser. Processing multiple faces would waste CPU.

**Why `refineLandmarks: true`?** — This enables **iris tracking** (landmarks 468-477), which is essential for gaze detection. Without it, we only get 468 landmarks (face outline, lips, etc.) but no iris positions.

**Why 0.5 confidence thresholds?** — Lower thresholds catch more faces but increase false positives. 0.5 is MediaPipe's recommended balance.

### 10.2 Camera Setup

```javascript
this.camera = new Camera(this.videoElement, {
    onFrame: async () => {
        await this.faceMesh.send({ image: this.videoElement });
    },
    width: 640, height: 480
});
```

**Why MediaPipe's `Camera` utility instead of raw `getUserMedia`?**
- It handles the browser's `requestAnimationFrame` loop internally.
- It manages video element lifecycle (play/pause/stop).
- It calls `onFrame` at the optimal rate for the device's capabilities.

### 10.3 The 8 Metric Groups

#### GROUP 1: Face Presence
```javascript
const faceDetected = true;
const faceConfidence = 0.99;
// Bounding box computed from min/max of all landmarks
```

**Why hardcode confidence to 0.99?** — FaceMesh doesn't expose per-frame confidence. If it detects a face at all (landmarks exist), confidence is inherently high. The 0.99 value satisfies the payload schema.

#### GROUP 2: Gaze & Eye Direction (Lines 117-151)

```javascript
const leftIris = landmarks[468];   // Center of left iris
const rightIris = landmarks[473];  // Center of right iris
const leftEyeInner = landmarks[133];
const leftEyeOuter = landmarks[33];

// Normalize iris position relative to eye width
const leftIrisRelX = Math.abs(leftIris.x - leftEyeOuter.x) / leftEyeWidth;
const avgIrisRelX = (leftIrisRelX + rightIrisRelX) / 2;
const gazeX = (avgIrisRelX - 0.5) * 2;  // Map to -1..+1

const gazeOnScreen = (avgIrisRelX > 0.35 && avgIrisRelX < 0.65 && Math.abs(gazeY) < 0.4);
```

**How gaze detection works:**
1. Get the iris center position (landmark 468 for left eye, 473 for right).
2. Get the eye corner positions (landmarks 33, 133 for left; 362, 263 for right).
3. Compute where the iris sits relative to the eye corners (0 = left corner, 1 = right corner).
4. If the iris is between 35%-65% horizontally and within 40% vertically, the student is looking at the screen.

**Why 0.35–0.65 instead of 0.25–0.75?** — Tighter thresholds reduce false positives. With a typical webcam at arm's length, the iris moves less than you'd expect when looking at screen edges.

#### GROUP 3: Head Pose Estimation (Lines 153-184)

```javascript
// Yaw (left-right rotation)
const dLeft = Math.abs(noseTip.x - leftEyeOuter.x);
const dRight = Math.abs(rightEyeOuter.x - noseTip.x);
const headPoseYaw = ((dRight - dLeft) / (dRight + dLeft)) * 90;

// Pitch (up-down tilt)
const headPosePitch = ((chinToNoseY - noseToEyeY) / (chinToNoseY + noseToEyeY)) * -90 + 30;

// Roll (head tilt)
const headPoseRoll = Math.atan2(
    rightEyeOuter.y - leftEyeOuter.y,
    rightEyeOuter.x - leftEyeOuter.x
) * (180 / Math.PI);
```

**How it works without a 3D model:**
- **Yaw**: When you turn right, the right side of your face compresses (nose-to-right-eye distance shrinks). The ratio of left vs right distances estimates rotation.
- **Pitch**: The vertical ratio between nose-to-eyes and chin-to-nose changes when you look up/down.
- **Roll**: The angle between eye corners in 2D directly gives head tilt.
- **+30 offset on pitch**: Calibration constant. Most people naturally tilt their head slightly downward when looking at a laptop screen.

**Category classification:**
```javascript
if (Math.abs(headPoseYaw) < 15 && Math.abs(headPosePitch) < 15) headPoseCategory = 'forward';
else if (headPosePitch < -20) headPoseCategory = 'looking_down';
// etc.
```

#### GROUP 4: Eye State & Blink Detection (Lines 186-228)

```javascript
// EAR = Eye Aspect Ratio
const calcEAR = (p1, p2, p3, p4, p5, p6) => {
    return (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4));
};

const earLeft = calcEAR(33, 160, 159, 133, 145, 144);
```

**EAR (Eye Aspect Ratio)** is a standard technique from computer vision research:
- Measures the ratio of eye height to eye width.
- Open eye: EAR ≈ 0.3. Closed eye: EAR ≈ 0.1.
- A blink is detected when EAR drops below 0.15 and then rises above 0.25 (using a 10-frame ring buffer).

**Blink rate calculation:**
```javascript
const blinkRate = sessionDurationMins > 0 ? this.blinkCount / sessionDurationMins : 0;
```
Normal blink rate is 15-20/min. Below 8 suggests deep focus or screen strain. Above 25 suggests stress.

#### GROUP 5: Mouth State & Yawn Detection (Lines 232-258)

```javascript
const mouthVert = distLms(13, 14);  // Upper lip to lower lip
const mouthHoriz = distLms(61, 291); // Left to right mouth corner
const mar = mouthVert / mouthHoriz;  // Mouth Aspect Ratio

if (mar > 0.5) {
    this.yawnFrames += deltaTimeSec;
    if (this.yawnFrames > 1.5) {  // Mouth open > 1.5 seconds
        yawnDetected = true;
        this.yawnCount++;
    }
}
```

**Why 1.5 seconds?** — A yawn typically lasts 4-7 seconds. Requiring at least 1.5s of continuous wide-open mouth filters out talking and brief expressions.

#### GROUP 6: Emotion Classification (Lines 260-301)

This is a **rule-based** classifier (not a neural network):

```javascript
let emotionScores = {
    focused:    (gazeOnScreen ? 0.6 : 0) + (headForward ? 0.3 : 0) + (eyesOpen ? 0.1 : 0),
    confused:   (browFurrowed ? 0.5 : 0) + (headTilted ? 0.5 : 0),
    bored:      (eyesHalfClosed ? 0.3 : 0) + (highBlink ? 0.2 : 0) + (yawning ? 0.5 : 0),
    engaged:    (forward && gazeOn && notYawning ? 1.0 : 0),
    distracted: (!gazeOnScreen ? 0.5 : 0) + (!headForward ? 0.5 : 0),
    drowsy:     drowsinessScore
};
```

**Why rule-based instead of ML?**
- No training data needed — works immediately.
- Fully interpretable — you can explain why a student was classified as "confused".
- Runs at 30fps in the browser with zero latency.
- A real emotion classifier (like FER) would require a separate neural network, adding load time and complexity.

The highest-scoring emotion becomes `primaryEmotion`. Scores are normalized relative to the max.

#### GROUP 7: Attention Score (Lines 302-321)

```javascript
let attentionRaw = (
    (gazeOnScreen ? 1 : 0) * 35 +       // 35% weight: looking at screen
    (headForward ? 1 : 0) * 25 +          // 25% weight: head facing forward
    (1 - drowsinessScore) * 20 +           // 20% weight: not drowsy
    (1 - gazeDeviation) * 10 +             // 10% weight: steady gaze
    (positiveEmotion ? 1 : 0) * 10         // 10% weight: focused/engaged emotion
);
const attentionScore = Math.max(0, Math.min(100, Math.round(attentionRaw)));
```

**Why these weights?**
- **Gaze (35%)**: The strongest signal. If you're not looking at the screen, you're likely not paying attention.
- **Head pose (25%)**: Complements gaze. You can look at the screen briefly while your head is turned away.
- **Drowsiness (20%)**: A drowsy student is physically present but mentally absent.
- **Gaze deviation (10%)**: Erratic eye movement suggests distraction even when looking at the screen.
- **Emotion (10%)**: A focused/engaged emotion adds a small bonus.

**Category thresholds:**
| Score | Category |
|---|---|
| 80-100 | Highly Focused |
| 60-79 | Focused |
| 40-59 | Neutral |
| 20-39 | Distracted |
| 0-19 | Disengaged |

#### GROUP 8: Session Metrics (Lines 323-355)

Cumulative tracking:
- `focusedTimeSeconds` — Total seconds with attention ≥ 60
- `distractedTimeSeconds` — Total seconds with attention < 40
- `awayTimeSeconds` — Total seconds with no face detected
- `focusStreak` — Current consecutive focus time (resets on distraction)
- `longestFocusStreak` — Best streak achieved
- `distractionCount` — Number of times attention dropped from focused to distracted
- `recoveryTimes[]` — Array of seconds taken to recover from each distraction episode

### 10.4 Canvas Overlay Drawing (Lines 417-490)

```javascript
// Green dots for all 478 face landmarks
ctx.fillStyle = "rgba(0, 255, 0, 0.6)";
for (const lm of landmarks) {
    ctx.arc(lm.x * width, lm.y * height, 1, 0, 2 * Math.PI);
}

// Cyan dots for iris centers
ctx.fillStyle = "cyan";
ctx.arc(leftIris.x * width, leftIris.y * height, 3, 0, 2 * Math.PI);

// Colored bounding box (green/orange/red based on attention)
ctx.strokeStyle = boxColor;
ctx.strokeRect(bx, by, bw, bh);

// Head direction arrow from nose tip
ctx.moveTo(startX, startY);
ctx.lineTo(startX + headPoseYaw * 2, startY + headPosePitch * -2);
```

**Why the overlay?** — Visual feedback for the student:
- Green box = paying attention
- Orange box = neutral
- Red box = distracted
- Arrow shows head direction
- "FACE NOT DETECTED" warning when face is missing

### 10.5 `buildPayload()` — The Wire Format (Lines 503-559)

Converts internal metrics to the JSON format expected by the server. Key transformations:
- `engagementScore = attentionScore * 0.7 + focusStreak * 2` — Engagement combines attention with sustained focus.
- `gazeX/Y` rounded to 3 decimal places — Saves bandwidth.
- Minimal payload when face isn't detected (just `faceDetected: false` + basic counters).

---

## 11. DataCollector (`dataCollector.js`) — The Aggregation Engine (267 lines)

### 11.1 Purpose

The FaceAnalyzer produces **per-frame** metrics (~30 times/second). The DataCollector:
1. **Buffers** these frames for 5 seconds
2. **Computes statistics** (mean, min, max, stdDev, trend) for each numeric field
3. **Computes percentages** for boolean fields (% of frames where face was detected, eyes were closed, etc.)
4. **Classifies** the interval (mode emotion, mode attention category, mode head pose)
5. **Generates alerts** based on thresholds

### 11.2 Statistical Computation (`_calcStats`)

```javascript
_calcStats(arr) {
    // Mean, Min, Max, StdDev
    // Plus: Linear regression slope over last 12 values for trend
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    trend = Math.abs(slope) < 0.1 ? 0 : slope;
}
```

**Why include trend?** — The trend tells the teacher if attention is improving or declining within the 5-second window. A positive slope means the student is recovering; negative means they're losing focus.

### 11.3 Alert Flag Generation (Lines 159-166)

```javascript
if (pctGaze < 40 && pctFace > 0) alertFlags.push("GAZE_OFF");
if (modeHeadPose !== 'forward') alertFlags.push("HEAD_TURNED");
if (statDrowsy.mean > 0.5) alertFlags.push("DROWSY");
if (yawnDetected) alertFlags.push("YAWNING");
if (intervalAttentionScore < 35) alertFlags.push("HIGH_DISTRACTION");
if (statBlink.mean < 8 && intervalAttentionScore < 60) alertFlags.push("LOW_BLINK");
if (pctEyesClosed > 20) alertFlags.push("EYES_CLOSED");
```

**Why `pctFace > 0` for GAZE_OFF?** — If the face isn't detected at all, gaze data is meaningless. Only flag gaze issues when the face is actually visible.

**Why `&& intervalAttentionScore < 60` for LOW_BLINK?** — Low blink rate during high attention is actually **deep focus** (a good thing). Only flag it when combined with low attention.

### 11.4 Session Summary (`getSessionSummary()`)

Provides cumulative stats across the entire session:
- Overall attention score (average of all intervals)
- Attention and emotion timelines (for the sparkline chart)
- Total alert counts by type
- Focus/distracted/away percentages
- Peak and lowest attention periods (with timestamps)

---

## 12. SocketClient (`socketClient.js`) — Communication Layer (148 lines)

### 12.1 Student ID Persistence

```javascript
this.studentId = localStorage.getItem('am_uuid');
if (!this.studentId) {
    this.studentId = 'uuid-stu-' + Date.now() + '-' + Math.round(Math.random() * 100000);
    localStorage.setItem('am_uuid', this.studentId);
}
```

**Why generate a UUID and store it?** — If the student disconnects and reconnects, the server recognizes them by the same UUID. Their data continues from where it left off instead of creating a duplicate student entry.

### 12.2 Connection Configuration

```javascript
this.socket = io(this.serverUrl + '/student', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5
});
```

**Why these reconnection settings?**
- `Infinity` attempts — Never give up. Classroom WiFi can be flaky.
- `1000ms` initial delay, `10000ms` max — Exponential backoff prevents server flooding.
- `0.5` randomization — If 30 students disconnect simultaneously (e.g., teacher's network blips), they reconnect at staggered times instead of all at once.

### 12.3 Payload Queue

```javascript
sendPayload(payload) {
    if (this.isConnected) {
        this.socket.emit('student:data', payload);
    } else {
        if (this.payloadQueue.length < 100) {
            this.payloadQueue.push(payload);
        }
    }
}
```

**Why queue payloads?** — During brief disconnections, the DataCollector keeps producing data. The queue stores up to 100 payloads (about 8 minutes of data at 5-second intervals). When the connection resumes, `_flushQueue()` sends them all, so no data is lost.

### 12.4 Join Session Flow

```javascript
async joinSession(studentName, sessionId) {
    return new Promise((resolve, reject) => {
        this.socket.once('student:joined', (response) => {
            if (response.ok) {
                this._flushQueue();  // Send any buffered data
                resolve(response);
            }
        });
        this.socket.once('error', reject);
        this.socket.emit('student:join', { studentId, name, sessionId });
        setTimeout(() => reject(new Error('Join session timeout')), 5000);
    });
}
```

**Why Promise-based?** — Allows the monitor page to `await` the join and handle errors (invalid session code → redirect to join page).

**Why flush queue after join?** — The server needs to know which session the student belongs to before it can process their data payloads. Flushing before join would cause the server to discard the payloads.

---

*Continue to Part 3 for the Teacher Dashboard (live charts, student grid, alerts), Post-Session Analytics, Control Hub, Demo Mode, and CSS design systems.*
