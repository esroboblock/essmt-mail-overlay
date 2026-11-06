# Issue #3 implementation and validation plan

User authorization: implement details autonomously from observations; preserve existing work; push a dedicated branch and PR; comment on #3; never merge.

## Global constraints

- No extension installation, code injection or interactions in the ESSMT collector profile. No profile/session copying or cookie/token extraction.
- No real mail content, addresses, operational SN, credentials, raw HTML or captures in public files, logs or external Mock requests.
- Reuse identity validation, rendering, batching and stale binding protection. Separate demo/Naver contexts and lookup adapters.
- Naver lookup is synthetic, isolated-world, memory-only; no network, page postMessage, storage or production API. Clearly identify mock labels.
- Live testing requires a separate authenticated test profile. Synthetic E2E is not live compatibility evidence.

## Design decision

Reuse the strict observed href/class identity contract. Add context/lookup adapters instead of duplicating the renderer or implementing a service worker/server. Scope demo observation to its root and CSS to owned containers in supported roots. Keep unsupported localhost pages inert. Naver support is experimental and limited to the observed inbox route; unsupported screens must remove badges. Synthetic local mappings have no account/DB significance and reset at context boundaries. Bound retained mappings to the current screen, with no persistent cache.

An external Mock service would disclose operational IDs and is excluded. A new production API/auth path is outside scope.

## Tasks

1. Recheck Git/issues/CDP access; preserve original checkout with a managed worktree based on e8d4901. Read-only live aggregate DOM observation only if existing host is reachable. Record access failures and do not recover/restart collector services.
2. Test-first adapter/local Mock and installed-MV3 synthetic Naver tests, then minimal implementation. Exercise empty/unmatched/unidentified, row reuse, cancellation, route/root replacement and narrow title/attachment layout. Existing demo regression tests remain required.
3. Record live versus synthetic evidence, installation restrictions and remaining requirements; run Node and full Chromium E2E; review branch and privacy diff; commit/push, PR referencing #3 (keep issue open while live gates unmet), post issue result.

## Evidence ledger

- Original checkout clean on codex/issue-2-mv3-overlay; origin verified. Separate managed worktree on codex/issue-3-naver-compatibility at e8d4901.
- Prior ESSMT #234/#235 and public DOM document describe 80 inbox rows; this is historical evidence.
- Current SSH to es2003 timed out; Tailscale peer reports Online=false. Local loopback CDP timed out. Connected Playwright tool browser contains only about:blank. No authenticated separate test profile identified. Live DOM/insertion/UI tests remain unverified.
- Baseline npm test: 20/20 passing. Baseline full E2E: 33/33 passing after explicit local demo server startup.

- Implementation: separate external experimental build, local synthetic lookup, scoped observer/CSS, route/root invalidation and synthetic installed-MV3 regression tests. Implementer evidence: Node 23/23 and E2E 38/38 passing. Controller fresh verification: Node 23/23, full E2E 38/38 (23.4s), external experimental build and diff check passed. Fresh review approved experimental scope; two minor build-guard/documentation findings fixed and scoped re-review approved. Final Node 25/25; E2E 38/38 (23.8s). No deferred findings. Live gates remain unmet.

## 2026-11-06 follow-up

- es2003 is reachable again; collector service active and Chrome 151.0.7922.77/CDP1.3 inbox present. No profile/session copying or installation.
- Raw CDP DOM/CSS queries only (no Runtime.evaluate or injected page code): 80 rows, 80 unique SN, 80 href/class matches and 80 successes using the same extension identity function outside browser. Root/parent layout and attachment absolute positioning recorded as aggregate/allowed styles only.
- No separate authenticated Naver target identified among reachable CDP endpoints. Actual MV3 insertion and interactions remain unverified. No guessed CSS or route expansion from read-only evidence.
- Update current report/README and PR #6, preserve original offline investigation as historical evidence; run existing automated suites and check public diff.
- Follow-up verification: Node 25/25 and full E2E 38/38 (23.5s); document links/diff check passed; privacy/accuracy review approved after historical date wording correction. No extension source change.
