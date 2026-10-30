# Production migration cleanup report

## Replaced in the production path

- Old hub/control page → `apps/web/` public product site.
- Unauthenticated teacher entry → Supabase Auth guard and trusted profile role.
- Teacher Socket.IO transport → `apps/teacher/js/supabaseHandler.js` with database hydration and private Broadcast.
- Historical REST fetches → `apps/teacher/js/analyticsRepository.js` with RLS-protected Supabase queries.
- Primary standalone student website → `apps/extension/` MV3 Side Panel/New Tab application.
- CDN extension dependencies → locally packaged Supabase, Chart.js, MediaPipe JavaScript/WASM/assets.
- Missing-face score zero and fabricated `0.99` confidence → unavailable signal/null confidence.
- Fake homepage usage statistics/admin login → accurate product and privacy content.

## Intentionally retained

- `apps/student/js/faceAnalyzer.js` and `dataCollector.js`: canonical preserved scoring/aggregation source copied into the extension build.
- `apps/teacher/js/charts.js`, `studentGrid.js`, `dashboard.js`, and `analytics.js`: existing useful dashboard/report behavior adapted rather than replaced.
- `apps/api/`, SQLite database, and old REST/Socket.IO code: retained outside the production build until remote migration counts and representative reports are verified.
- `apps/hub/` and standalone student HTML/CSS: retained as legacy reference until owner acceptance of the replacement routes.
- Legacy documentation/screenshots: retained for regression and product previews.
- Development-only dashboard demo: now local and synthetic, hidden from production builds, and writes no production rows.

## Dependencies

Production web/extension dependencies are managed at the root. Legacy Express/Socket.IO/SQLite dependencies remain isolated in `apps/api/package.json` for migration/baseline use. They are not imported by the production Vite or extension paths.

No source database or historical record has been deleted.
