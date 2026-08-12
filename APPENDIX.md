# QA Assessment - Appendix

Supporting detail for [QA_ASSESSMENT_REPORT.md](QA_ASSESSMENT_REPORT.md). Finding IDs (H1-H9, M1-M9, L1-L8) are shared between the two documents.

Contents:
- [A. Low-severity findings](#a-low-severity-findings) - L1-L8, including the measured accessibility audit
- [B. OWASP Top 10:2025 coverage](#b-owasp-top-102025-coverage) - category-by-category mapping
- [C. Recommended additional test coverage](#c-recommended-additional-test-coverage) - gaps the findings expose
- [D. Verification method](#d-verification-method) - how each finding class was reproduced

---

## A. Low-severity findings


| ID | Issue | Recommendation |
|---|---|---|
| <a id="l1"></a>**L1** | `cors()` allows **all** origins (`Access-Control-Allow-Origin: *`, verified) | Restrict to a known origin allowlist |
| <a id="l2"></a>**L2** | Crash reported to users as *"check your internet connection"*; the client's `401`/`500` branches are unreachable because the server never responds | Distinguish transport failure from server error; never blame the user's connection for a server fault |
| <a id="l3"></a>**L3** | No loading indicator, no empty/error state; `getProducts()` has no `try/catch` - a failed fetch leaves a blank page and an unhandled rejection. The error message is never cleared between attempts, and the submit button is never disabled, so a double-click fires two logins | Add loading, empty and error states; clear stale errors; disable submit while in flight |
| <a id="l4"></a>**L4** | Real credentials hardcoded as `value=""` in [`index.html:19-23`](public/index.html#L19-L23) | Remove; never ship credentials in markup |
| <a id="l5"></a>**L5** | Dead code: `/cart` returns a hardcoded empty cart, ignoring `productId`; `GET /` is unreachable (static middleware serves `index.html` first - verified); `Product`/`CartContent` types unused and `Product` omits the `rating` the UI renders; `"Welcome, User!"` is static despite `firstName` being returned; "Remember me" and "Forgot password?" are non-functional | Implement or remove - non-functional UI erodes trust |
| <a id="l6"></a>**L6** | `X-Powered-By: Express` disclosed (verified); no CSP/X-Frame-Options/X-Content-Type-Options; Bootstrap loaded from a CDN with no SRI hash; `favicon.ico` 404 noise in console | `app.disable('x-powered-by')`, add `helmet`, add an `integrity` attribute or vendor Bootstrap locally, add a favicon |
| <a id="l7"></a>**L7** | Accessibility defects measured by Lighthouse - see below | Fix contrast, landmarks, headings, table semantics |
| <a id="l8"></a>**L8** | No `autocomplete` attributes on the login inputs. Chrome itself raises this as a DevTools **issue** on every page load: *"An element doesn't have an autocomplete attribute"*, suggesting `current-password`. It blocks password managers from filling the form reliably, which pushes users toward weaker, hand-typed passwords | Add `autocomplete="username"` and `autocomplete="current-password"` to [`index.html:19,23`](public/index.html#L19-L23) |

#### L7 - Accessibility audit (measured, not estimated)

Lighthouse (desktop, navigation mode) on both pages:

| Page | Accessibility | Best Practices | SEO |
|---|---|---|---|
| `index.html` (login) | **81** | 81 | 90 |
| `dashboard.html` | **89** | 81 | 91 |

Confirmed failures (verified in the DOM, not just reported):

| Issue | Detail |
|---|---|
| **Colour contrast** | Login `button.btn-primary` and the "Forgot password?" link fail WCAG AA; on the dashboard the green `th:first-child` (`#4CAF50` + white) fails |
| **No `<main>` landmark** | Neither page has one - screen-reader users cannot skip to content |
| **No `<h1>`** | Dashboard heading hierarchy starts at `<h2>` (`h1Count: 0`) |
| **Table semantics** | `hasCaption: false`, `thWithScope: 0 of 6`. The table's *structure* is sound - the accessibility tree exposes `table` › `rowgroup` › `row` › 6 × `columnheader`, because the markup uses real `<th>` elements - but with no `<caption>` and no `scope="col"`, header-to-cell association is left to the browser's heuristics rather than stated, which degrades navigation in screen readers that rely on explicit scoping |
| **Tap target too small** | "Forgot password?" link is below the 48×48px guidance |
| **Layout shift** | **CLS 0.069** - caused by **30 of 30** thumbnails having no `width`/`height` |
| **Missing meta description** | Both pages (SEO) |

*Exclusion, verified:* Lighthouse's `is-on-https` failures trace to `local.adguard.org` - a **browser extension in the test profile, not an application defect**. Both offending URLs were re-checked in the audit JSON rather than assumed. Excluded on that basis; the HTTPS concern is reported separately and on its own merits as M6.

**Recommendation:** add `<main>` landmarks and a single `<h1>` per page; add `<caption>` and `scope="col"` to the table; darken the button/link/header colours to meet 4.5:1; set explicit `width`/`height` on thumbnails (fixes CLS); enlarge the tap target.

**Correctness note:** prices use raw interpolation (`$${product.price}`) rather than locale-aware currency formatting (`Intl.NumberFormat`) - an internationalisation risk. Thumbnails reuse the product title as `alt`, which is acceptable but ideally decorative images would use `alt=""`.

---


---

## B. OWASP Top 10:2025 coverage

> **Edition note.** This maps to the **2025** list (released January 2026), not the widely-cited 2021 one. The revision is not a renumbering: it adds **A03 Software Supply Chain Failures** and **A10 Mishandling of Exceptional Conditions**, both of which land directly on this codebase. A10 is the most precise description of the application's most severe defect (H1/H9) and did not exist in 2021. SSRF, formerly its own A10:2021 entry, is now folded into A01.

Every category was reviewed explicitly, including those where nothing was found - a category is only useful as evidence of coverage if the clean results are stated too. **9 of 10 categories have at least one confirmed finding.**

| # | Category (2025) | Verdict | Findings | Evidence |
|---|---|---|---|---|
| **A01** | Broken Access Control | 🔴 **Fail** | H2, H3, H7, M7 | `/products` returns 30 products with no `Authorization` header; fabricated `localStorage` token grants full dashboard |
| **A02** | Security Misconfiguration | 🔴 **Fail** | L1, L6, M3, M8 | `Access-Control-Allow-Origin: *` on every route; `X-Powered-By: Express`; no CSP/HSTS/X-Frame-Options; stack traces to client |
| **A03** | Software Supply Chain Failures | 🔴 **Fail** | H5, L6 | 10 production advisories (1 critical, 4 high); Bootstrap loaded from CDN with **no SRI hash** |
| **A04** | Cryptographic Failures | 🔴 **Fail** | M5, M6 | Credentials posted over plain HTTP; no TLS config in the codebase; token in `localStorage` |
| **A05** | Injection | 🔴 **Fail** | M2 | XSS payload **executed** through the `innerHTML` sink (`xssExecuted: true`) |
| **A06** | Insecure Design | 🔴 **Fail** | H6, H8, M4 | No rate limit by design; proxy forwards the dummyJSON payload verbatim including third-party PII and `refreshToken` |
| **A07** | Authentication Failures | 🔴 **Fail** | H4, H6, H7 | Unlimited brute-force (12/12 served, zero 429s); token contract broken; logout defeated by Back button |
| **A08** | Software and Data Integrity Failures | 🟠 **Partial** | L6 | Un-pinned CDN asset with no integrity check. **Contrast:** `package-lock.json` is fully hash-pinned - 476/476 packages carry an `integrity` hash, so the npm supply chain is verified while the browser-side one is not |
| **A09** | Security Logging and Alerting Failures | 🔴 **Fail** | **M9** | Unauthenticated `/products` fetch logged **nothing**; failed login logged a stack trace with no IP, username or outcome |
| **A10** | Mishandling of Exceptional Conditions | 🔴 **Fail** | **H1, H9**, L2, L3 | `curl -X POST /login` with **no body** kills the process (`200` → `000`); client reports the crash as "check your internet connection" |

### Notes on specific categories

**A10 is the headline.** The 2025 list introduced *Mishandling of Exceptional Conditions*, and this application is close to a textbook instance: an `await` with no `try/catch`, an error path that terminates the process rather than degrading the request, and a UI that misattributes the resulting failure to the user's own network. Under the 2021 list this would have been filed loosely under A04 Insecure Design; the 2025 category names it precisely, which is why re-mapping was worth doing rather than relabelling the old table.

**SSRF (A10:2021) is now inside A01.** Assessed and **not found as an application defect**: both outbound URLs (`LOGIN_URL`, `PRODUCTS_URL`) are hardcoded string literals, and no part of the request path, host, or protocol is user-influenceable - the user controls only the JSON body forwarded to a fixed endpoint. The SSRF exposure that *does* exist is the `axios` advisory in H5, i.e. a supply-chain issue (A03), not a coding flaw. Flagging it as an application SSRF would have been a false positive.

**A08 is rated Partial, not Fail,** because the two halves of the integrity story diverge: dependency installs are cryptographically verified (476/476 lockfile entries hashed) while the CDN `<link>` has no `integrity` attribute. Worth noting that the CDN host - `stackpath.bootstrapcdn.com` - belongs to a provider that has since exited the CDN business, so an un-pinned asset is loaded from infrastructure with an uncertain owner. It still returns `200` today; that is exactly the condition under which nobody notices until it serves something else.

**Injection beyond XSS was tested and not found.** There is no database, no shell execution, no file-path handling and no template engine, so SQLi, command injection and path traversal have no surface here. Object-injection into the dummyJSON auth call (`{"username":{"$ne":null}}`) was probed - it does not authenticate, though it does trigger the H9 crash.

---


---

## C. Recommended additional test coverage


The verified defects above suggest these gaps, several of which are **regression tests that would fail today**:

| Scenario | Type | Guards against |
|---|---|---|
| Wrong password → API returns **401**, **server stays alive** | Negative | **H1** - the DoS; the single highest-value test |
| **Empty POST to `/login` (no body, no `Content-Type`) → 400, server alive** | Negative | **H9** - the credential-free crash vector |
| **`Content-Type: text/plain` body → 400, server alive** | Negative | **H9** - the unparsed-body crash vector |
| Malformed JSON / missing fields → 400, no stack trace, no crash | Negative | H1, M3 |
| Failed login emits an auth-failure log event with source IP | Observability | **M9** |
| Successful login stores a **real** token, never `"undefined"` | Positive | **H4** - today's silent failure |
| Fabricated `localStorage` token → denied by the server | Security | H2, H3 |
| `/products` without `Authorization` → 401 | Security | H3 |
| Product with `<script>` in title renders as **text**, not markup | Security | M2 |
| Upstream 500/timeout (mocked) → friendly error, no crash | Negative | H1, L3 |
| Product count matches the API total | Data integrity | M4 |
| Repeated failed logins → **429** after threshold | Security | **H6** |
| Automated a11y scan (`@axe-core/playwright`) on both pages | Accessibility | **L7** |
| No console errors during the happy path | Regression | L6 |

---


---

## D. Verification method


No finding in this report rests on code reading alone. Each was reproduced against the running application, and the evidence sits with the finding itself in §3 rather than being repeated here.

**Server-side findings** (H1, H3, H5, H6, H8, H9, M3, M4, M9, L1, L5, L6) were verified by direct HTTP probing with `curl`/Node against a live process. Crash vectors were each run against a **freshly started server** with before/after liveness checks, since a dead process invalidates every subsequent probe.

**Client-side findings** (H2, H4, H7, M2, M7, L4, L7, L8) were verified in real Chrome via DevTools MCP - driving the actual UI, reading the network log, console, `localStorage` and the accessibility tree. HTTP-level probing cannot observe redirect timing, bfcache restoration, storage coercion or a11y tree structure, so these required a browser.

**Accessibility** (L7) was measured with Lighthouse (desktop, navigation mode) on both pages, with the failing audits read from the report JSON rather than summarised from the score.

**Dependency findings** (H5) come from `npm audit --omit=dev`, with reachability confirmed by tracing each package to the live request path.

### Points where testing overturned an initial reading

Recorded because they affect how much weight to give the findings, not as narrative:

| Initial reading | What testing showed |
|---|---|
| `body-parser`'s default export leaves `req.body` empty, causing the 400 | **Wrong.** `req.body` parses correctly; both serialisations return 200 from dummyJSON. The 400 is purely invalid credentials. Acting on this would have meant rewriting working code while leaving the real bug (H1) untouched |
| XSS is not exploitable - first probe did not fire | **False negative.** The first payload's `onerror` did not trigger in time; a reliable payload executed (`xssExecuted: true`). Reporting "safe" would have been wrong (M2) |
| Lighthouse `is-on-https` failures are an app defect | **Not the app.** Both offending URLs are `local.adguard.org`, a browser extension in the test profile. Excluded; HTTPS reported separately on its own merits (M6) |
| SSRF is present - an SSRF advisory sits in the dependency tree | **Not an application defect.** Both outbound URLs are hardcoded literals with no user-influenceable host or path. Recorded as a deliberate non-finding; the advisory is a supply-chain issue (H5), not a coding flaw |
| Logout is broken - clicking it left the page unchanged | **Tooling artifact.** The automation click landed without firing the listener; a directly dispatched click navigated and cleared the token, proving the handler is bound. Not a finding |
| The product table exposes no `columnheader` roles or `table` structure | **Overstated.** That reading came from a *collapsed* accessibility snapshot, which omits structural roles. The verbose tree shows `table` › `rowgroup` › `row` › 6 × `columnheader` - the markup uses real `<th>` elements. The genuine defect is narrower: no `<caption>` and no `scope="col"` (L7). Caught by the automated suite, whose `getByRole('columnheader')` assertion passes |

The last three matter most: two would have *added* findings, and one overstated the severity of a real one. A defect count is only meaningful if the same standard of evidence applies to claims that inflate it as to claims that reduce it.

---

