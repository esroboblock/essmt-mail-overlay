# ESSMT adapter implementation plan

**Goal:** Implement issue #7's explicit integration contract while preserving Mock mode.
**Spec:** https://github.com/esroboblock/essmt-mail-overlay/issues/7
**Architecture:** Trusted unpacked-extension build configuration fixes an HTTPS origin, API path, namespace and synthetic account binding. Only the worker fetches credentials; extension options select Mock (default) or ESSMT. No arbitrary page-controlled proxy or credentials storage. Existing generation and row binding checks protect rendering.
**Tech stack:** MV3 classic worker, vanilla JS, Node tests, Playwright Chromium.

## Constraints and choices

- Exact host permission is generated locally into ignored dist; no server address in source.
- A local options page selects provider only. A new build is required to change destination.
- API output validation is shared with Mock. HTTP codes remain distinguishable from Mock errors.
- Only synthetic account A may bind to the configured server dataset; account B fails closed.
- No result cache; mode changes and periodic ESSMT refresh clear pending results and badges. Logout detection is bounded by refresh, not instantaneous.
- Real server validation depends on #238 availability and is reported separately from synthetic browser tests.

## Tasks

- [x] Write failing worker tests for authenticated request construction, strict sender/input/config validation, redirects, status and output validation. Implement worker and trusted build script; run Node tests.
- [x] Write installed-extension tests for mode selection, cookie forwarding, logout, grant failure, account/mode switches and stale responses. Implement options and provider routing; retain Mock regression.
- [x] Limit DOM observer and CSS to demo root, verify inert unrelated localhost pages.
- [x] Run complete Node and browser suites. Check #238 development-server availability and test if possible without accessing operating data.
- [x] Update setup/results documentation, inspect final diff, commit, push, create PR and report evidence on issue #7.

## Review focus

Reject unexpected URL/header/namespace fields, wrong sender origin and invalid SNs before fetch. Never follow redirects with cookies. Reject malformed/foreign/partial results. Invalidate results during mode, account and DOM binding transitions. Test browser cookies using actual installed worker separately from HTTP-only tests.

## Verification record

32 Node tests and 37 installed-browser/demo tests passed, including actual isolated PostgreSQL/HTTPS ESSMT employee login, cookie attributes, read-only lookup, logout/401 and ungranted employee/403. Independent review found a root replacement regression; failing regression → observer rebind fix → passing whole suite. No findings remain deferred.
