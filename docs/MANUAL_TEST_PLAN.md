# Controlled-beta manual acceptance plan

Automated tests cover pure aggregation and static security/build contracts. Complete this plan against the configured development Supabase project before production use.

## Public website

- Check every navigation destination on desktop, tablet, and mobile.
- Verify keyboard navigation, visible focus, heading order, form labels, contrast, and reduced-motion behavior.
- Confirm no fake metrics/testimonials and that the download ZIP/checksum/release notes exist.
- Confirm privacy copy matches observed extension network behavior.

## Facilitator authentication and ownership

- Sign in/out with provisioned facilitator A.
- Confirm unauthenticated `/facilitator`, `/facilitator/sessions`, and analytics requests redirect to login.
- Confirm a normal permanent user without a trusted teacher profile is rejected and signed out.
- Create teacher B; verify A cannot select, end, export, or subscribe to B's sessions and vice versa.
- Confirm editing local/session storage or user metadata cannot grant teacher access.

## Extension and camera lifecycle

- Load `dist/extension` unpacked in Chrome 116+.
- Open the launcher and verify Side Panel and New Tab both open the same student UI/state.
- Join a valid code and reject invalid/ended codes clearly.
- Verify no camera prompt occurs before code validation, notice review, checkbox, and Start click.
- Deny permission; confirm monitoring does not begin and no attention score is submitted.
- Allow permission; confirm the persistent camera-active and connection indicators.
- Open the second mode during monitoring; confirm it cannot start a duplicate camera/telemetry loop.
- Stop monitoring and inspect that every camera track ends, the video clears, timers stop, and participant status changes.
- Close the active document and verify the teacher eventually sees disconnected/stale status.
- Test New Tab in foreground/background and confirm stale/offline states are honest.

## Critical raw-media privacy inspection

In extension DevTools Network, Application, and Console panels while monitoring:

- Confirm no request/WebSocket contains image bytes, data URLs, video/audio blobs, screenshots, canvas data, face crops, embeddings, or raw landmarks.
- Confirm snapshot RPC bodies contain only IDs, timestamps, status/version fields, and aggregated numerical metrics.
- Confirm extension storage contains only auth/session values, the monitoring lease, preferences, and bounded numerical retry packets.
- Confirm no raw media appears in localStorage, extension storage, IndexedDB, logs, or Supabase rows.
- Confirm microphone permission is never requested.

## RLS and session lifecycle

- Anonymous participant A cannot query session rows generally, another participant, or snapshots.
- A cannot submit using a different participant/session ID.
- A cannot call teacher create/end operations.
- Unrelated anonymous B cannot join private A lifecycle topics.
- Teacher B and an unauthenticated visitor cannot join teacher A's private topic.
- End A's session; confirm later snapshot RPCs fail and the extension stops on the private end event.
- Confirm retrying an accepted `snapshot_id` does not duplicate the row.

## Cross-location test

Use one teacher and at least two extension clients on separate computers and different internet connections:

1. Teacher starts session and shares code.
2. Both students join and start cameras.
3. Facilitator sees both participants and updates about every five seconds.
4. Cards, table, all six charts, class summary, alerts, and recommendations update.
5. Disconnect one student's network; confirm bounded queue/retry, deduplication, and stale state.
6. Refresh teacher page; confirm database rehydration and private subscription resume.
7. End session; confirm both students stop and new telemetry is rejected.
8. Open historical report; confirm heatmap, comparisons, deep dives, print, and CSV.

## Camera concurrency and performance

- Test Meet in Chrome + extension, Zoom web + extension, and Zoom desktop + extension on target pilot devices.
- Record where camera sharing succeeds/fails; do not promise simultaneous access universally.
- Test the owner-selected realistic pilot class size and record snapshot rate (expected 12/student/minute), database growth, Realtime usage, browser CPU, and dropped/stale intervals.

No cross-network, deployed RLS, or real-camera acceptance result is claimed until this checklist is completed and recorded.
