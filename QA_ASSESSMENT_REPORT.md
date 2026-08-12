# QA Assessment Report

**Project:** QA Code Challenge - login + secure product dashboard
**Assessed:** 11 August 2026
**Environment:** Node/Express (`src/`), vanilla JS frontend (`public/`), third-party API `dummyjson.com` (the brief's "downstream service")
**Method:** Static code review + live black-box verification in Chrome (DevTools MCP: Network, Console, a11y tree, `localStorage` inspection) + Lighthouse accessibility/best-practice audits + a category-by-category review against the **OWASP Top 10:2025** (released January 2026) + direct API probing with `curl`/Node. Every browser-dependent finding was re-driven through the real UI in a final pass ([Appendix D](APPENDIX.md#d-verification-method)).

### Where to find each deliverable

| Brief asks for | Location |
|---|---|
| **1.** Detailed report of flaws & security concerns, prioritised | §1 summary · §3 findings (H/M) · [Appendix A](APPENDIX.md#a-low-severity-findings) (L) · §4 remediation order |
| **2.** Automated test cases + README | §5, with the suite in [`tests/`](tests/) and run instructions in [`tests/README.md`](tests/README.md) |
| **3.** Observations & suggestions | §6 |

**In 90 seconds:** the app is down (§1). One anonymous request kills the server (H1/H9), the "secure" page has no server-side auth (H2/H3), and login never truly worked even when it appeared to (H4). Fix order and rationale in §4.

---

## 1. Executive summary

The application **does not work out of the box**. A user following the README, clicking **Login** with the pre-filled credentials, gets:

> *"Network error. Please check your internet connection."*

Their connection is fine. What actually happened is that **the server process crashed**, and the browser reported the dropped TCP connection.

Behind that single symptom sit **three independent defects**, each sufficient to break login on its own. This matters: fixing only the credentials - the obvious culprit - leaves the server still crashable by anyone, and leaves login still broken for every real user.

| # | Defect | Effect |
|---|--------|--------|
| 1 | Unhandled promise rejection in `/login` | **Server process dies** on any failed login |
| 2 | README credentials no longer valid at dummyJSON | Every documented login attempt fails |
| 3 | Frontend reads `userData.token`; API returns `accessToken` | Stores the string `"undefined"` as the auth token |

Separately, the "secure" area is **not secure**: the product endpoint requires no authentication, and the client-side auth gate is bypassed by typing one line into the browser console.

**Verdict:** not production-ready. Nine High-severity issues (one unauthenticated denial-of-service, one authentication bypass, one logout bypass, one critical dependency advisory) require fixing before release. Measured against the **OWASP Top 10:2025**, the application has confirmed findings in **9 of the 10 categories** ([Appendix B](APPENDIX.md#b-owasp-top-102025-coverage)).

### Severity summary

| Priority | Count | Issues |
|---|---|---|
| 🔴 **High** | 9 | H1 DoS crash · H2 auth bypass · H3 unprotected API · H4 broken token contract · H5 vulnerable dependencies (1 critical, 4 high) · H6 no brute-force protection · **H7 logout bypassable via back button** · **H8 third-party PII exposed unauthenticated** · **H9 crash reachable with no credentials at all** |
| 🟠 **Medium** | 9 | M1 stale credentials · M2 XSS sink · M3 stack-trace leak · M4 85% data loss · M5 token in `localStorage` · M6 credentials over plain HTTP · **M7 unauthenticated fetch fires despite redirect** · **M8 `npm test` broken; CWD-relative static path** · **M9 no security logging or alerting** |
| 🟡 **Low** | 8 | L1 wildcard CORS · L2 misleading errors · L3 no loading/empty states · L4 hardcoded creds in HTML · L5 dead code · L6 missing security headers · L7 accessibility defects (measured) · **L8 no `autocomplete` on login inputs** |

---

## 2. Root cause analysis - why login is broken

The failure was traced end-to-end rather than stopping at the first plausible explanation. The chain has three links.

### The reproduction

Clicking **Login** in Chrome produced this in the Network panel:

```
POST http://localhost:3000/login   →   (failed) net::ERR_CONNECTION_RESET
```

`ERR_CONNECTION_RESET` is not an HTTP error - there is no status code, because **no response was ever sent**. The server died mid-request. `script.js` cannot distinguish this from an offline browser, so its `catch` block reports a network problem - the misleading message users actually see.

### Link 1 - the crash (root cause)

[`src/app.ts:38-45`](src/app.ts#L38-L45) awaits `axios.post` with **no `try/catch`**:

```ts
const user = (await axios.post(LOGIN_URL, JSON.stringify(credentials), { ... })).data;
res.send(user);
```

Axios **throws** on any non-2xx response. dummyJSON answers bad credentials with **HTTP 400**, so the `await` rejects inside an `async` handler with no rejection handler. Express 4 cannot catch async rejections, so it becomes an unhandled rejection and - on modern Node - **terminates the process**.

Server log at the moment of failure:

```
AxiosError: Request failed with status code 400
    at settle (.../axios/lib/core/settle.js:19:12)
    at ... src/app.ts:1:619
```

**Verified impact - this is the most serious finding in the assessment:**

```
Server before: 200
-> ONE request with a wrong password
   login -> 000
Server after:  000   (000 = process dead)
```

A **single unauthenticated HTTP request with a wrong password takes the whole service down.** No credentials, no privileges, no volume required. Every other user is now offline. This is an unauthenticated denial-of-service (H1).

### Link 2 - the credentials are dead

The README's users are rejected by the live dummyJSON service:

| Credentials (source) | Result |
|---|---|
| `atuny0` / `9uQFF1Lh` (README) | ❌ **400** `Invalid credentials` |
| `hbingley1` / `CQutx25i8r` (README) | ❌ **400** `Invalid credentials` |
| `emilys` / `emilyspass` (current dummyJSON) | ✅ **200** returns tokens |

dummyJSON reset its user dataset; the README was never updated. So the documented happy path **always** triggers the crash in Link 1 - which is why the app appears completely dead rather than merely showing a login error.

> **Discounted hypothesis.** A plausible alternative explanation - that `body-parser`'s default export is `urlencoded`, leaving `req.body` empty - fits the 400 message `"Username and password required"` exactly. Testing disproved it: `req.body` parses correctly, and both `JSON.stringify(obj)` and a plain object return **200** from the dummyJSON API. The 400 is caused purely by invalid credentials. The distinction is material - acting on the plausible-but-wrong theory would have meant rewriting working request-serialization code while leaving the real bug untouched.

### Link 3 - the token contract is broken

Even after fixing links 1 and 2, **login still does not truly work.** dummyJSON returns `accessToken`; [`public/script.js:25`](public/script.js#L25) reads `userData.token`, which is `undefined`.

`localStorage.setItem` coerces that to the **string** `"undefined"`. Verified in the browser after a *successful* login:

```json
{ "url": ".../dashboard.html", "storedToken": "undefined", "isAuthCheck": true }
```

The guard at [`public/script.js:48`](public/script.js#L48) is `localStorage.getItem('token') !== null`. Since `"undefined"` is a non-null string, **the check passes** and the user reaches the dashboard. The bug is invisible today - the dashboard loads, so login *looks* successful - and would surface only later as mysterious 401s once the API is properly protected. This is exactly the kind of latent defect that becomes expensive after release.

---

## 3. Detailed findings

### 🔴 HIGH

#### H1 - Unhandled rejection crashes the server (unauthenticated DoS)
**Location:** [`src/app.ts:19-46`](src/app.ts#L19-L46) (both `/login` and `/products`)
**Evidence:** One wrong-password request → process dead (`000`); `AxiosError` in log.
**Risk:** Total loss of availability, triggerable anonymously by anyone.

**Recommendation** - wrap the dummyJSON calls in `try/catch`, map third-party failures to correct status codes, add a global error handler and a request timeout:

```ts
app.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  try {
    const { data } = await axios.post(LOGIN_URL, { username, password }, { timeout: 5000 });
    return res.status(200).json({ token: data.accessToken, username: data.username });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      return res.status(err.response.status === 400 ? 401 : 502)
                .json({ message: 'Invalid credentials.' });   // no third-party internals leaked
    }
    return res.status(504).json({ message: 'Authentication service unavailable.' });
  }
});
```

**Validated.** This implementation was executed against every known failure mode - including the three credential-free vectors later identified under H9:

```
valid creds                 : 200 {"token":"eyJhbGciOiJIUzI1NiIs..."}
bad creds                   : 401 {"message":"Invalid credentials."}
missing fields {}           : 400 {"message":"Username and password are required."}
malformed JSON              : 400 {"message":"Malformed request."}
text/plain body       (H9-A): 400 {"message":"Username and password are required."}
no body, no content-type (C): 400 {"message":"Username and password are required."}
type-confusion {$ne:null}   : 400 {"message":"Username and password are required."}

SERVER ALIVE after all seven probes -> YES (no crash)
```

The type check (`typeof username !== 'string'`) is doing real work here, not defensive padding: it is what rejects the `{"username":{"$ne":null}}` object payload before it can reach the dummyJSON call.

Note this also converts dummyJSON's misleading **400** into a correct **401**, which makes the frontend's existing `else if (response.status === 401)` branch work as originally intended.

---

#### H2 - Authentication is client-side only (bypass)
**Location:** [`public/dashboard.html:62`](public/dashboard.html#L62), [`public/script.js:48`](public/script.js#L48)
**Evidence:** With **no login at all**, a fabricated token was set in the console:

```js
localStorage.setItem('token', 'totally-fake-not-a-jwt');
```

Result - full dashboard access with live data:

```json
{ "dashboardVisible": true, "rowsRendered": 30, "tokenUsed": "totally-fake-not-a-jwt" }
```

The guard only checks that *a value exists* - never that it is valid. It is presentational, not a security control.

**Recommendation:** Treat the client check purely as UX. Enforce authorisation **server-side**: validate the bearer token on every protected route and return 401 when absent/invalid. A client-side redirect can always be bypassed.

---

#### H3 - Product endpoint requires no authentication
**Location:** [`src/app.ts:19-25`](src/app.ts#L19-L25)
**Evidence:** `fetch('/products')` with **no `Authorization` header** → `200`, 30 products returned.
**Risk:** The "secure page" contents are public to anyone who knows the URL.

**Recommendation:** Add auth middleware to `/products` (and `/cart`), rejecting missing/invalid tokens with 401. Have the frontend send `Authorization: Bearer <token>`.

---

#### H4 - Wrong token field silently stores `"undefined"`
**Location:** [`public/script.js:25`](public/script.js#L25) - see Link 3 above.
**Recommendation:** Align the contract and **fail loudly** rather than storing junk:

```js
const { token } = await response.json();
if (!token) { errorMessage.textContent = 'Login failed. Please try again.'; return; }
localStorage.setItem('token', token);
```

Combined with the H1 fix (which normalises the response to `token`), the contract holds on both sides. Frontend guards should also verify the value is a plausible token, not merely non-null.

---

#### H5 - Vulnerable dependencies in production runtime (1 critical, 4 high)
**Evidence:** `npm audit --omit=dev` reports **10 production vulnerabilities: 1 critical, 4 high, 2 moderate, 3 low** (31 including dev dependencies).

| Severity | Package | Advisory |
|---|---|---|
| 🔴 **CRITICAL** | `form-data` 4.0.0–4.0.5 | Unsafe random boundary selection; CRLF injection via unescaped multipart field names |
| **HIGH** | `axios` 1.0.0–1.17.0 | **SSRF** and credential leakage via absolute URL |
| **HIGH** | `express` ≤4.21.2 | XSS via `response.redirect()`; open redirect on malformed URLs |
| **HIGH** | `body-parser` ≤1.20.5 | DoS when URL encoding enabled; size enforcement silently disabled on invalid limit |
| **HIGH** | `path-to-regexp` ≤0.1.12 | **ReDoS** via backtracking regular expressions |
| MODERATE | `qs`, `send`/`serve-static` | `qs` arrayLimit bypass DoS; `send` template injection → XSS |

**Reachability confirmed** - these are not dormant transitive packages:
- `send`/`serve-static` sit directly in the request path via [`app.ts:11`](src/app.ts#L11) `express.static('public')` - **every page load** goes through them.
- `qs` parses the query string on **every** Express request (verified: `/products?a[b]=c` → 200).
- `axios` performs all outbound third-party calls - the SSRF advisory is directly relevant to a service that proxies user-influenced requests.

**Severity note:** rated High on reachability, not package count. An initial reading treated these as dev-only advisories; `npm audit --omit=dev` shows they are production dependencies, and `send`/`serve-static` and `qs` were confirmed to sit in the live request path.

**Recommendation:** run `npm audit fix` and re-test (a dry run shows fixes are available). Per OWASP A03:2025, triage by reachability - all of the above are reachable, so treat them as release blockers rather than backlog items. Add `npm audit` to CI as a quality gate. Do **not** use `--force` without reviewing changelogs, as it can cross semver ranges.

---

#### H6 - No rate limiting: unlimited credential brute-force
**Location:** [`src/app.ts:27`](src/app.ts#L27) - `/login` has no throttling.
**Evidence:** 12 rapid failed logins against a crash-fixed handler (to isolate throttling from the H1 crash):

```
12 rapid failed logins -> 401 401 401 401 401 401 401 401 401 401 401 401
429 responses (throttled): 0  => NO rate limiting
```

Every attempt was served. An attacker can enumerate passwords at full network speed, limited only by the dummyJSON service.

**Recommendation:** apply `express-rate-limit` to authentication routes (e.g. 10 attempts / 15 min per IP), with stricter limits than general traffic. Consider account lockout/backoff and logging repeated failures as a security event.

---

#### H7 - Logout is bypassable with the browser back button (bfcache)
**Location:** [`public/dashboard.html`](public/dashboard.html) (no cache directives), [`public/script.js:41-46`](public/script.js#L41-L46)

`dashboard.html` is served with `Cache-Control: public, max-age=0` and **no `no-store`**, leaving it eligible for the browser's back/forward cache. bfcache restores the page's prior DOM and already-evaluated JS state *without re-running scripts*, so the inline auth check never fires again.

**Evidence - reproduced end-to-end with a genuine session (real `accessToken`, not a forged value):**

```
1. Logged in as emilys        -> dashboard renders 30 products
2. Clicked the real Logout    -> token = null, browser on /index.html
3. Pressed browser Back
4. { url: ".../dashboard.html", token: null,
     productRowCount: 30, authContentVisible: true }
   -> "BYPASS CONFIRMED: authenticated dashboard restored with NO token"
```

**Risk:** on a shared, public, or borrowed device, clicking **Logout** does not prevent the next person from viewing the authenticated dashboard. This is **independent of H2/H3**: it concerns client-side cache eligibility, not server authorization, so it would persist even after server-side auth is enforced.

**Recommendation:** send `Cache-Control: no-store` on `dashboard.html` and every authenticated response, and re-run the auth check on the `pageshow` event when `event.persisted` is true.

---

#### H8 - Third-party PII exposed to unauthenticated callers
**Location:** [`src/app.ts:24`](src/app.ts#L24) - `res.send(products.products)` forwards the dummyJSON payload verbatim.

**Evidence:**

```
fields per product: 22   (the UI renders 6)
has reviews? true
reviewer sample: { "reviewerName": "Eleanor Collins",
                   "reviewerEmail": "eleanor.collins@x.dummyjson.com", ... }
/products payload: 44045 bytes
```

Combined with H3 (no authentication on `/products`), **anyone on the network can retrieve reviewer names and email addresses without credentials.** The `/login` handler has the same flaw, forwarding `refreshToken` - a long-lived credential the frontend never uses - plus `email` and `gender` to the browser.

**Recommendation:** a proxy should be a filter, not a pipe. Project the response down to the fields the UI consumes:

```ts
res.json(data.products.map(({ id, title, description, price, rating, thumbnail }) =>
  ({ id, title, description, price, rating, thumbnail })));
```

This also insulates your API contract from third-party schema drift - the exact class of change that caused H4.

---

#### H9 - The crash needs no credentials, no body, and no valid request
**Location:** [`src/app.ts:27-45`](src/app.ts#L27-L45)
**OWASP:** A10:2025 Mishandling of Exceptional Conditions

H1 establishes that a wrong password kills the process. Re-testing against the 2025 A10 category showed the entry condition is **materially wider than "a wrong password"** - the handler reads `req.body.username` and forwards whatever it finds, so *any* request that fails dummyJSON validation reaches the same unguarded `await`. Three independent vectors, each verified on a freshly started server:

| Vector | Request | Server before → after |
|---|---|---|
| A | `Content-Type: text/plain`, body `hello` (JSON parser never populates `req.body`) | `200` → **`000`** |
| B | `Content-Type: application/json`, body `{}` | `200` → **`000`** |
| C | **No body and no `Content-Type` at all** | `200` → **`000`** |

All three produce the identical `AxiosError: Request failed with status code 400` unhandled rejection. Vector C is the important one:

```
curl -X POST http://localhost:3000/login
```

**That is the entire exploit.** No credentials, no payload, no knowledge of the application - a bare POST to a public endpoint terminates the service. This raises H1 from "an attacker who guesses wrong takes us down" to "any scanner, health-check misfire, or crawler hitting `/login` takes us down," and it means the outage is reachable by a client that never had an account.

**Why this matters for the fix:** a patch that only handles the *invalid-credentials* case still crashes on vectors A and C. The H1 recommendation above is written to cover all three - it validates `req.body ?? {}` and the field types *before* the network call, then wraps the call itself. Both halves are required; either alone leaves a live DoS.

**Recommendation:** as H1, plus a `process.on('unhandledRejection')` handler as a backstop so an unforeseen rejection degrades one request instead of the whole process.

---

### 🟠 MEDIUM

#### M1 - README credentials invalid → documented happy path always fails
Update the README to working credentials (e.g. `emilys` / `emilyspass`). Longer term, avoid depending on a public dataset that can change without notice - see §6.

#### M2 - XSS sink: unescaped API data injected via `innerHTML`
**Location:** [`public/script.js:57-80`](public/script.js#L57-L80) - `product.title` / `description` are interpolated straight into `innerHTML`.

**Evidence:** Confirmed genuinely exploitable, not theoretical. A payload through the same sink **executed**:

```json
{ "xssExecuted": true, "verdict": "Injected HTML EXECUTED script" }
```

*(An initial probe with `<img src=x onerror=...>` did not fire - the markup was injected unescaped, but the load did not error in time. Retesting with a payload that reliably triggers `onerror` executed. The vector is real; the first result was a false negative, and reporting it as "safe" would have been wrong.)*

**Risk:** The app trusts a third-party service completely. If dummyJSON were compromised or swapped for an attacker-controlled endpoint, injected script would run in the user's session - and since the token sits in `localStorage` (M5), it could be exfiltrated. Rated Medium only because the current data source is trusted; the flaw is High if the third-party source is ever untrusted.

**Recommendation:** Build rows with `textContent`/`createElement` instead of `innerHTML`, and add a Content-Security-Policy header.

#### M3 - Internal stack traces leaked to the client
Malformed JSON returns Express's HTML error page containing a stack trace:

```
SyntaxError: Unexpected end of JSON input
    at JSON.parse (<anonymous>) ...
```

This discloses framework internals and file paths.

**Severity note:** rated Medium rather than High - genuine information disclosure, but it exposes framework paths rather than credentials or user data.

**Recommendation:** add a global error handler returning a generic JSON message; never expose stack traces in production.

#### M4 - 85% of products silently missing
`/products` returns dummyJSON's default page of **30**, but **194** exist (`total: 194, limit: 30`). No pagination, no "showing X of Y" - users cannot know 164 products are missing, and would reasonably conclude the catalogue is complete.
**Recommendation:** implement pagination (or explicitly request all items) and surface the total count.

#### M5 - Token stored in `localStorage`
Readable by any script on the origin, making M2 materially worse. **Recommendation:** prefer `httpOnly`, `Secure`, `SameSite` cookies so JavaScript cannot read the token.

#### M6 - Credentials transmitted over plain HTTP
The frontend posts passwords to `http://localhost:3000` ([`script.js:1`](public/script.js#L1)) with no TLS, and Lighthouse flags the origin as not using HTTPS. Acceptable for local development, but the codebase contains **no TLS configuration or HTTPS redirect**, so this ships as-is. Any network observer can read credentials in transit.
**Recommendation:** enforce HTTPS in non-local environments, add HSTS, and make `baseUrl` environment-driven (see §6.4).

*Positive finding:* the application does **not** log credentials - the only `console.log` is the server startup message, and `tests/.env` is correctly gitignored.

#### M7 - Unauthenticated product fetch fires despite the redirect
**Location:** [`public/dashboard.html:61-67`](public/dashboard.html#L61-L67)

```js
if (!isAuthenticated) { location.href='index.html'; }   // no return
getProducts();                                          // runs regardless
```

Assigning `location.href` schedules a navigation; it does **not** halt script execution. `getProducts()` therefore always runs, including for visitors with no token.

**Evidence** - cleared `localStorage`, loaded `/dashboard.html`, captured the network log:

```
GET /dashboard.html  [304]
GET /index.html      [304]   <- redirect already happened
GET /products        [pending]  <- unauthenticated fetch still fired
```

The request was genuinely issued *after* the browser had navigated away. Today it also **succeeds**, because of H3.

**Recommendation:** `return` immediately after the redirect, and never fetch protected data before the auth check resolves.

#### M8 - `npm test` fails out of the box; CWD-relative static path
Two independent maintainability defects, both verified:

**`npm test` is broken.** The root script runs Jest, which has no configuration and tries to parse the Playwright specs:

```
Test Suites: 3 failed, 3 total
Tests:       0 total
```

A newcomer running the conventional command concludes the project is broken or untested. The working entry point is `npm run test:e2e`.

**`express.static('public')` is CWD-relative** ([`app.ts:11`](src/app.ts#L11)) - it resolves against the process working directory, not the module location. Proven with identical code run from two directories:

```
cwd: K:\...\qa-code-challenge   GET /index.html -> 200 (found)
cwd: C:\...\Temp                GET /index.html -> 404 (static path broken)
```

**Recommendation:** point `test` at the Playwright suite (or add `--passWithNoTests`), remove the unused `jest`/`mocha`/`supertest`/`node-fetch`/`@types/jsonwebtoken` dependencies, add a production `start` script (`node dist/server.js` - none exists today, so `tsx watch` is currently the only way to run the app), and use `express.static(path.join(__dirname, '..', 'public'))`.

#### M9 - No security logging: attacks leave no trace
**Location:** [`src/app.ts`](src/app.ts) (no logging middleware), [`src/server.ts:5`](src/server.ts#L5)
**OWASP:** A09:2025 Security Logging and Alerting Failures

§6.3 previously noted the absence of structured logging as a general observation. Tested against A09 it is a **finding in its own right**, because the gap is not "logs are unstructured" - it is that security-relevant events produce **no log line at all**.

**Evidence** - a clean server run, then one unauthenticated `/products` fetch and one failed login. The complete post-startup log:

```
Server listening to port 3000...
AxiosError: Request failed with status code 400
    at settle (.../axios/lib/core/settle.js:19:12)
    ... 7 more stack frames ...
```

Two things are wrong here:

1. **The unauthenticated `/products` request logged nothing whatsoever.** Data left the system to an anonymous caller (H3, H8) with no record that it happened - no timestamp, no source IP, no path.
2. **The failed login logged a stack trace, not a security event.** There is no username, no source IP, no outcome field, and no severity. It is a *crash report* that happens to coincide with an auth failure - it records where the code broke, not that someone tried to log in and failed.

**Risk:** the brute-force attack in H6 is not merely unthrottled, it is **invisible**. Ten thousand failed logins would produce ten thousand identical stack traces with no attacker IP and no username, so neither alerting nor post-incident forensics is possible. A09 exists precisely because undetected breaches are the expensive ones.

**Recommendation:** add structured request logging (`pino`/`winston`) emitting one JSON event per request with timestamp, source IP, route, status and latency; log authentication outcomes explicitly as `auth.success` / `auth.failure` with the attempted username - **never the password**; and alert on failure-rate thresholds per IP. Pair with H6 so a throttled attacker is also a *visible* one.

---

### 🟡 LOW

Eight low-severity findings (L1 wildcard CORS · L2 misleading errors · L3 no loading/empty states · L4 hardcoded credentials in HTML · L5 dead code · L6 missing security headers · L7 accessibility defects · L8 missing `autocomplete`) are documented with evidence and recommendations in **[Appendix A](APPENDIX.md#a-low-severity-findings)**, including a measured Lighthouse accessibility audit of both pages.

---

## 4. Prioritised remediation plan

**Fix in this order** - each step unblocks the next, and the order is deliberate: stop the crash before anything else, because until H1 is fixed the service can be taken down by anyone at any time.

| Order | Action | Issue | Why first |
|---|---|---|---|
| 1 | Validate `req.body` **and** wrap the call in `try/catch` + global error handler + timeouts + `unhandledRejection` backstop | H1, **H9**, M3 | Stops the DoS and the crash-loop blocking all other testing. Both halves required - validation alone or `try/catch` alone still leaves a live crash vector |
| 2 | Align token contract (`accessToken` → `token`) + fail loudly | H4 | Makes login genuinely work |
| 3 | Update README credentials | M1 | Restores the documented happy path |
| 4 | Enforce server-side auth on `/products` | H2, H3 | Makes the "secure" area actually secure |
| 5 | `npm audit fix` + add audit to CI | **H5** | Clears 1 critical + 4 high advisories in reachable code |
| 6 | Rate-limit `/login` | **H6** | Closes unlimited brute-force |
| 6b | Structured request + auth-outcome logging with alerting | **M9** | A throttled attacker must also be a visible one; today an attack leaves no trace |
| 7 | `Cache-Control: no-store` + `pageshow` re-check | **H7** | Makes Logout actually log the user out |
| 8 | Project the third-party response to needed fields only | **H8** | Stops PII and `refreshToken` leaking to the browser |
| 9 | Replace `innerHTML` with `textContent`; add CSP | M2 | Closes the injection vector |
| 10 | `return` after redirect on the dashboard | **M7** | Stops the unauthenticated fetch |
| 11 | Pagination + total count | M4 | Restores the missing 85% of data |
| 12 | HTTPS/HSTS; cookie-based tokens; restrict CORS; `helmet` | M5, M6, L1, L6 | Transport and header hardening |
| 13 | Accessibility fixes (landmarks, contrast, table semantics, image dimensions) | L7 | WCAG compliance + fixes CLS |
| 14 | Fix `npm test`, add `start` script, absolute static path, prune deps | **M8** | Maintainability and correct production run path |
| 15 | Loading/empty/error states; remove dead code & hardcoded creds | L2–L5 | UX and maintainability |

---

## 5. Test automation - what was built and why

An automated Playwright + TypeScript suite was implemented under [`tests/`](tests/) as part of this
assessment. Five tests, one per distinct failure mode - deliberately more than the three requested, because
the security probe and the escaping case each pin a different High/Medium finding.

| # | Test | File | Covers | Finding |
|---|---|---|---|---|
| 1 | Logs in successfully with valid credentials | [`e2e/auth/login.spec.ts`](tests/e2e/auth/login.spec.ts) | Positive path: auth + backend response shape | – |
| 2 | Invalid credentials show an error, user stays on login | [`e2e/auth/login.spec.ts`](tests/e2e/auth/login.spec.ts) | Negative path - `@crashes-server` | **H1**, L2 |
| 3 | Renders every product returned by the API | [`e2e/dashboard/products.spec.ts`](tests/e2e/dashboard/products.spec.ts) | Authenticated page + data rendering | – |
| 4 | Renders product text containing HTML punctuation intact | [`e2e/dashboard/products.spec.ts`](tests/e2e/dashboard/products.spec.ts) | Silent data loss through the unescaped sink | **M2** |
| 5 | A token the server never issued does not grant access | [`e2e/security/auth-bypass.spec.ts`](tests/e2e/security/auth-bypass.spec.ts) | Authentication bypass - `@security` | **H2**, **H3** |

Two positive journeys, one negative journey, one rendering-correctness case, one security probe.
Full run instructions, tagging scheme and debugging commands are in [`tests/README.md`](tests/README.md):

```bash
npm run test:e2e:install   # first time only
cp tests/.env.example tests/.env   # credentials - nothing is hardcoded
npm run test:e2e
```

### Automation decisions and trade-offs

Several choices in the suite are non-obvious. The reasoning behind each, and what breaks without it:

| Decision | Why - and what breaks without it |
|---|---|
| **Three tests use `test.fail()`** | Tests 2, 4 and 5 document bugs that are **still open**, so the expected result *is* a failure. They are regression tripwires: green while the bug exists, red the moment someone fixes the app without updating the test. A green suite certifies "all known bugs still present, nothing else broke" - **not** that the app is healthy. |
| **The crashing test is isolated by tag** | `@crashes-server` is infrastructure, not a label: it routes test 2 into a `chromium-crashers` project that `dependencies` on the main project, so the test that kills the server always runs last. Verified - without it, the crasher runs mid-suite and takes the dashboard tests with it (5 passed → 2 failed). |
| **`/products` is stubbed for dashboard tests** | Asserting the rendered table against a *separate* live fetch races: browser and test each call the endpoint independently, so dummyJSON data changing between the two calls fails the test with no bug in the app. Stubbing removes the race **and** lets us serve a product the live endpoint never would - which is what exposes the escaping defect. |
| **Login is captured with `page.route()`, not `waitForResponse()`** | A successful login navigates the instant the response arrives, and Chromium discards the body of a response the page has navigated away from - `waitForResponse().json()` loses that race with `No resource with given identifier found`. Interception captures the body while it is still in flight. |
| **Authentication is never stubbed (tests 1–4)** | Real sign-in means a broken login fails the suite loudly instead of passing against a mock. Test 5 is the deliberate exception - its entire purpose is to arrive unauthenticated with a forged token. |
| **Test types are declared locally, not imported from `src/types.ts`** | The app's `Product` type omits the `rating` field it actually serves (L5). Importing it would type-check the tests against a shape the API does not return. |
| **Tests 3 and 4 were split** | Combined, the failing escaping assertion made the whole test an expected failure and hid the fact that rendering works. Split, test 3 passes honestly and test 4 pins the bug alone. |

Page Object Model, typed fixtures, a console-error guard, ESLint (with `eslint-plugin-playwright` and
`no-floating-promises`) and Prettier are all wired up; `tests/` is a standalone npm project because the app
pins TypeScript 4.9 while the suite needs 6.0, and hoisting them would force an upgrade of the code under test.

### Recommended additional coverage

The verified defects suggest eleven further regression tests - several of which would fail today - listed in **[Appendix C](APPENDIX.md#c-recommended-additional-test-coverage)**. The highest-value additions are: wrong password returns 401 **and the server stays alive** (H1), an empty POST to `/login` returns 400 without crashing (H9), and a successful login stores a real token rather than `"undefined"` (H4).

---

## 6. Observations & suggestions

1. **Untestable dependency on a live third party.** Every test depends on `dummyjson.com` being reachable and its dataset unchanged - precisely what broke the README credentials. Introduce a mock/contract layer so the suite is deterministic and can simulate 500s, timeouts and malformed payloads. This is the single highest-leverage improvement to test reliability.
2. **No automated CI gate.** These defects are all detectable automatically. Running the suite on every PR would have caught the crash immediately, and a `npm audit` step would have caught H5 the day the advisories landed. Recommended gates: `npm audit`, `tsc --noEmit`, the Playwright suite, and an axe accessibility scan.
3. **No health endpoint or process supervision.** The crash was diagnosable only with a console attached to the process. Add a `/health` endpoint and a process manager to restart on failure - mitigation, not a substitute for the H1/H9 fix. *(The logging half of this observation was promoted to a finding in its own right - see **M9**, which carries the measured evidence.)*
4. **Configuration is hardcoded.** URLs and the port are literals; `baseUrl` is pinned to `http://localhost:3000`, so the frontend breaks outside local dev. Move to environment variables.
5. **Type safety is declared but unused.** `Product` and `User` exist in `types.ts` yet no handler uses them - `axios` responses flow through as `any`. Typing the third-party response (with runtime validation, e.g. `zod`) would have caught the `accessToken`/`token` mismatch **at compile time**.
6. **Deprecated dependency.** `body-parser` emits a deprecation warning on startup; use the built-in `express.json()`. This also resolves one of the H5 advisories.
7. **No dependency maintenance process.** Ten production advisories accumulated unnoticed, including a critical one. Adopt automated dependency updates (Dependabot/Renovate) with CI running the audit on every PR.

---

## 7. Conclusion

The application fails at its primary function - login - for three independent reasons, and the fault that makes it *look* dead (the crash) is also the most dangerous: **any anonymous user can take the service down with one empty request** - no credentials, no payload, no account (H9). The security posture needs equal attention: the "secure" page is protected only by a client-side check that a single console command defeats, the login endpoint accepts unlimited brute-force attempts, and the dependency tree carries a critical advisory plus four high ones in code that runs on every request.

Every finding was reproduced against the running application; none rests on code reading alone. The recommended H1/H9 handler was implemented and executed against all **seven** known failure modes before being recommended, so the fix in §3 is tested, not sketched.

Five initial readings were overturned by testing ([Appendix D](APPENDIX.md#d-verification-method)). Two of them - SSRF and an apparent logout failure - would have *added* findings; both were dropped when the evidence did not hold. The defect count is only meaningful if claims that inflate it face the same scrutiny as claims that reduce it.

With the prioritised fixes applied and the suggested regression tests added, the application would be in a defensible state for release.
