# ESSMT integration validation — 2026-11-06

Issue #7 connects the existing synthetic UI to a real read-only ESSMT API. All data used here is synthetic. No operating server, existing database, actual mail or employee session was accessed. No production deployment or employee installation was performed.

## Boundaries

- Source installation remains Mock by default, with no external host permission.
- A locally generated copy fixes one HTTPS origin, server namespace and synthetic account A binding. The worker alone performs credentialed JSON POST. Content scripts cannot supply URL, headers or server namespace.
- Chrome host permissions grant host/scheme access; the worker additionally fixes the full endpoint including port and path. Redirects are rejected.
- Runtime messages validate sender extension ID, tab, exact localhost demo origin, context and int32 serials. Server responses validate schema, namespace, complete requested IDs, unique tags and status/count consistency before normalization.
- Account/mode/generation/row changes invalidate pending results. No tag cache is stored. ESSMT refreshes every 30 seconds and when the page becomes visible. Browser background throttling and already authenticated in-flight requests prevent an instantaneous logout guarantee.

## Automated levels

| Level | What it establishes |
|---|---|
| Node tests | Request policy, no network for rejected input, HTTP status preservation, response validation, build host permission and existing Mock contracts |
| Installed MV3 + synthetic HTTPS | Browser cookie forwarding with Secure/HttpOnly/SameSite=Lax, 401/403/422/500, tag/empty/unmatched/ambiguous, stale account/mode responses; actual HTTPS server rather than intercepted fetch |
| Installed MV3 + actual ESSMT | Real password login route/session middleware, real API/database lookup and logout; performed on isolated PostgreSQL 17 with synthetic records |
| Existing demo/extension E2E | Existing Mock behavior, row reuse, delayed responses, controls, pagination and safe rendering |

## Actual ESSMT run

Local ESSMT code was `98dbae3` (merged API implementation). An independent temporary PostgreSQL 17 container was created and migrated with Alembic. It contained only synthetic employees and mails: 101 with `합성 HTTP 태그`, 102 with no tag, absent 103, and two candidates for 104. The temporary app used its real routers, database dependencies, session middleware and authentication. No dependency overrides or manually signed cookies were used.

The app ran on loopback HTTPS with a temporary self-signed certificate, `DEBUG=false`, a fresh signing root, an explicit synthetic employee grant, one server namespace and the actual test extension origin. Static/template paths were pointed at the local source; application lifespan was disabled to avoid unrelated bucket/admin startup. Login and auth-event persistence remained enabled. A temporary public extension key stabilized the test extension ID. Credentials and private paths were supplied locally, not tracked.

`tests/e2e/essmt-live.spec.js` opened `/login` in the same ephemeral profile as the installed worker, submitted the generated employee password, and verified tag rendering in the unchanged demo. It then posted the real `/logout` and verified 401 with no remaining badges. The test never copied a session into the extension or a page message. Login traces/screenshots/videos were disabled. The temporary app and database were removed afterward.

Final verification: **32 Node tests passed; 37 browser tests passed, including the opt-in actual ESSMT test (no skips in this run)**. The actual employee sequence verified Secure/HttpOnly/SameSite=Lax session attributes, successful password login, tag/empty/unmatched/ambiguous rendering, logout → 401, and a second real password login as an employee without grant → 403. The default browser run without a live environment skips that single opt-in case.

Independent code review identified a root-replacement regression in the narrowed observer. A failing installed-extension regression reproduced it; a direct-child observer on the root parent now rebinds the active root while subtree observation stays within that root. The regression and final whole suite passed after the fix. Syntax and diff whitespace checks passed. Browser output included only the existing NO_COLOR/FORCE_COLOR environment warning.

## Reproduce

See [extension setup and opt-in live test](../../extension/README.md#essmt-개발-서버-연결-7). The default suite explicitly skips the live test when an isolated HTTPS environment is absent. Use the synthetic #238 data contract, an explicit extension origin and an employee grant; do not supply operating credentials. OpenSSL is required for the synthetic HTTPS test. Self-signed certificate acceptance is limited to ephemeral automated test profiles; the extension itself never disables TLS checks.

## Remaining limits

- Testing used bundled headless Chromium (Google Chrome for Testing 156.0.8078.4 on Linux), not employees' Windows Chrome/Edge policies, manually installed production builds, or a store release.
- Individual cookie-blocking/enterprise policies, production certificates, stable deployment IDs and operating permissions remain deployment checks. The browser run does not guarantee success for every profile.
- Actual Naver compatibility, detail/thread screens and operating mail remain issue #3. The demo's own diagnostic panel always uses Mock, even while extension options select ESSMT.
- Namespace maps one server dataset; switching synthetic demo account is not an ESSMT employee-account selector. Account B cannot query the configured dataset.
- Actual app 422/5xx and CORS boundary permutations belong to #238's server suite; this branch tests HTTP error handling in the installed extension and the real app's authenticated path.

References: [Chrome extension network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [Chrome storage and cookie policy](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies). Host permission does not expose cookies to page JavaScript and does not override every cookie-blocking policy.
