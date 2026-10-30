# SessionSignal Participant Beta 0.3.0

- Adds one shared participant application for Chrome Side Panel and New Tab modes.
- Preserves local MediaPipe face analysis and the existing observable-frame scoring formula.
- Sends only five-second derived numerical aggregates through validated Supabase RPCs.
- Adds explicit privacy review, camera start/stop controls, bounded retry, honest unavailable signal state, and a single active monitoring lease.
- Stops camera tracks and processing when monitoring ends or the active extension document closes.
- Extracts into one clearly named SessionSignal folder with a prominent `START_HERE.html` guide; participants select the folder in Chrome without handling individual extension files.

This is a controlled Developer Mode beta, not a Chrome Web Store release.
