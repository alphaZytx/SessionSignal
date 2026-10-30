# SQLite migration verification

## Preserved source

- Source: `apps/api/data/sessions.db`
- Consistent backup: `apps/api/data/sessions.pre-supabase-migration-20261030.db`
- Backup integrity result: `ok`
- Recorded baseline on 2026-10-30: 9 sessions, 3 student rows, 279 snapshots

Both database files are ignored from Git and must be protected by the project owner. The migration script opens the source read-only.

Legacy attention values are imported with their original observable-score semantics so historical averages and reports remain comparable. The metrics JSON also records `legacySignalClassification` to show whether a row would be unavailable under the new no-face rule. Newly collected extension packets use the strict unavailable/null-score semantics.

## Dry run completed

`npm run migrate:sqlite -- --dry-run` completed and reported the same counts. No remote writes were attempted.

## Owner mapping

Legacy `teacher_id` values are untrusted Socket.IO IDs. The importer refuses to guess an owner. Set `LEGACY_TEACHER_ID` to a real, provisioned Supabase teacher profile UUID before `--apply`.

## Apply and verify

1. Apply the Supabase migration.
2. Provision the initial teacher.
3. Set the server-only migration variables described in the README.
4. Run the dry run again against the intended SQLite path.
5. Run `npm run migrate:sqlite -- --apply`.
6. Save the JSON source/destination count report.
7. Open at least one representative legacy report in `/teacher/analytics?sessionId=...`.
8. Compare attention averages, timeline point counts, emotion distributions, alerts, heatmap, student deep-dive charts, print output, and CSV rows.
9. Confirm `development_demo` records are visibly labelled and kept separate from normal sessions.
10. Keep both SQLite files until counts and representative reports pass owner review.

The remote apply and report comparison have not been run because no Supabase owner credentials were provided in this workspace.
