# Automated Test Suite

Playwright end-to-end suite for the QA code assessment app.

- **[QA_ASSESSMENT_REPORT.md](../QA_ASSESSMENT_REPORT.md)** - the QA deliverable: every bug found, its severity, evidence, and how to reproduce it by hand. §5 lists the test-case catalogue (the five automated cases below, plus the recommended additional coverage).

## Quick start

```bash
# From qa-code-challenge/ (repo root)
npm install              # app dependencies
npm run test:e2e:install # test dependencies + the Chromium binary
cp tests/.env.example tests/.env   # then edit it - see "Credentials" below
npm run test:e2e
```

`tests/` is a standalone npm project, not a workspace - the app pins TypeScript 4.9 and the suite needs 6.0,
so hoisting them into one dependency tree would force an upgrade of the code under test. The root scripts
(`test:e2e`, `test:e2e:ui`, `test:e2e:install`) shell into `tests/` so you never have to `cd` first. Running
`npx playwright test` from inside `tests/` works identically.

## Credentials

`.env` is **required** - `config/env.ts` throws at load time if `TEST_USERNAME`, `TEST_PASSWORD` or
`TEST_WRONG_PASSWORD` are missing, and the suite will not start. This is deliberate: no credential is
hardcoded anywhere as a fallback, so there is nothing to silently fall back to.

The app has no accounts of its own; it proxies straight to
[dummyjson](https://dummyjson.com/docs/auth), so any valid dummyjson account works. See `.env.example`
for what each variable is for.

## What the suite covers

Five tests, one per distinct failure mode.

| #   | Test                                                          | File                               | Covers                                 | Finding |
| --- | ------------------------------------------------------------- | ---------------------------------- | -------------------------------------- | ------- |
| 1   | logs in successfully with valid credentials                   | `e2e/auth/login.spec.ts`           | Positive path: auth + backend response | -       |
| 2   | invalid credentials show an error and keep user on login page | `e2e/auth/login.spec.ts`           | Negative path - `@crashes-server`      | H1, L2  |
| 3   | renders every product returned by the API                     | `e2e/dashboard/products.spec.ts`   | Authenticated page + data rendering    | -       |
| 4   | renders product text containing HTML punctuation intact       | `e2e/dashboard/products.spec.ts`   | Silent data loss from unescaped output | M2      |
| 5   | a token the server never issued does not grant access         | `e2e/security/auth-bypass.spec.ts` | Authentication bypass - `@security`    | H2, H3  |

Finding IDs refer to [QA_ASSESSMENT_REPORT.md](../QA_ASSESSMENT_REPORT.md) §3.

Two positive journeys, one negative journey, one rendering-correctness case, one security probe.

Tests 3 and 4 were deliberately split. Combining a working rendering path with a failing escaping assertion
meant the whole test reported as an expected failure, hiding the fact that rendering works. Split, test 3
passes honestly and test 4 pins the bug on its own.

### Why three tests "pass" while failing

Tests 2, 4 and 5 use `test.fail()`. Each documents a bug that is **still open**, so the expected result _is_ a
failure: Playwright reports them green while the bug exists, and red the moment someone fixes the app without
updating the test. They are regression tripwires, not disabled tests.

A green suite here means "all three known bugs are still present, and nothing else broke" - it is a clean bill
of health for the suite's understanding of the app, **not** for the app. Severities and root causes are in
[QA_ASSESSMENT_REPORT.md](../QA_ASSESSMENT_REPORT.md).

> **If you add a `test.fail()` test, run it once with the annotation removed and confirm it fails on the
> assertion you intended.** `test.fail()` only requires that a test fail _somehow_ - it does not care which
> assertion, or why. A tripwire that fails for an unrelated reason reports green in every state and protects
> nothing.

## Running a subset

```bash
npx playwright test e2e/auth                         # one folder
npx playwright test --grep @authentication           # by tag
npx playwright test --grep-invert @expected-failure  # only tests that pass on their own merits
npx playwright test --grep-invert @crashes-server    # leaves the app alive afterwards
npx playwright test -g "logs in successfully"        # by name
```

Tags fall into two groups, and the distinction matters:

| Kind             | Tags                                                                         | Purpose                                                                             |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Feature area** | `@authentication`, `@dashboard`, `@security`, `@authorization`, `@rendering` | Selecting what to run. Applied per `describe` where the whole group shares an area. |
| **Mechanical**   | `@expected-failure`, `@crashes-server`                                       | Describe how the test _behaves_, not what it covers.                                |

**`@crashes-server` is infrastructure, not a label.** It drives project routing in
`playwright.config.ts` - the `chromium-crashers` project greps for it and `dependencies` on `chromium` so the
server-killing test always runs last. Renaming or removing it makes the crasher run mid-suite and take the
dashboard tests down with it (verified: 5 passed → 2 failed). Change it only alongside the config.

> **Counting tagged tests? Pass `--project=chromium`.** With two projects configured, a bare
> `--grep @anything --list` reports each project's own membership rather than the matched tests, so the
> totals look inflated. `npx playwright test --project=chromium --grep @dashboard --list` gives the real
> number. This is a quirk of listing across projects, not of the tags.

## Debugging

```bash
npx playwright test --headed   # visible browser
npx playwright test --ui       # interactive UI mode
npx playwright test --debug    # step-through debugger
npx playwright show-report     # HTML report from the last run
npx playwright show-trace test-results/<failed-test-folder>/trace.zip
```

Traces are kept on failure (`trace: 'retain-on-failure'`) rather than `on-first-retry`, because retries are 0
locally - `on-first-retry` would mean a local failure produces no trace at all.

## Things that will surprise you

- **The suite leaves the app server dead.** The last test submits invalid credentials, which terminates the
  Node process. That is the bug under test (see [QA_ASSESSMENT_REPORT.md](../QA_ASSESSMENT_REPORT.md), H1), not
  a suite problem - but the app needs restarting before you use it by hand afterwards.
- **Run order is load-bearing.** The crashing test is tagged `@crashes-server` and routed to its own
  `chromium-crashers` project, which `dependencies` on the main `chromium` project, so it always runs after
  every test that needs a live server. Don't override `workers` on the CLI without reading
  `playwright.config.ts` first - crash containment relies on it. Both mechanisms become unnecessary once the
  crash is fixed.
- **"1 did not run" means the crasher was skipped.** Playwright skips a project whose `dependencies` failed,
  so any failure in `chromium` silently drops the invalid-login test - it is not reported as failed, only as
  a count in the summary. This is documented Playwright behaviour with no override. Run it on its own with:

  ```bash
  npx playwright test --project=chromium-crashers --no-deps
  ```

  It cannot happen while all five tests report green, but it will the first time someone fixes a bug without
  removing the matching `test.fail()`.

- **Authentication is never stubbed.** Tests 1–4 sign in for real, so a broken login fails the suite loudly.
  Test 5 is the deliberate exception: it never logs in, because its whole purpose is to arrive
  unauthenticated with a forged token.
- **`/products` is stubbed** for the dashboard tests via `DashboardPage.stubProducts()`. Asserting the
  rendered table against a _separate_ live fetch races - the browser and the test each call the endpoint
  independently, so upstream changing between the two calls would fail the test with no bug in the app.
  Stubbing removes the race and lets us serve a product the live endpoint never would, which is what exposes
  the data-loss bug.
- **Login is captured with `page.route()`, not `waitForResponse()`.** A successful login navigates the instant
  the response arrives, and Chromium discards the body of a response the page has navigated away from - `waitForResponse().json()` loses that race with `No resource with given identifier found`. Intercepting
  captures the body while it is still in flight. See `utils/response-recorder.ts`.

## Project layout

```
tests/
├── config/     env.ts                     required-env accessor
├── data/       product.factory.ts         test data builders
├── fixtures/   index.ts                   the suite's test/expect entry point
│               pages.fixture.ts           page-object fixtures
│               network.fixture.ts         response capture + console-error guard
├── pages/      login.page.ts, dashboard.page.ts
├── types/      api.types.ts               Product, LoginResponseBody
├── utils/      response-recorder.ts
└── e2e/        auth/ dashboard/ security/ the specs
```

Specs import `test` and `expect` from `../../fixtures/index.js` - never from `@playwright/test` directly, or
they lose the fixtures and the console-error guard.

Test types are declared locally in `types/api.types.ts` rather than imported from the app's `src/types.ts`.
That is intentional: the app's `Product` type is missing the `rating` field it actually serves, so importing
it would make the tests type-check against a shape the API does not return.

## Tooling

```bash
npm run lint          # eslint (incl. eslint-plugin-playwright + no-floating-promises)
npm run format        # prettier --write
npm run format:check  # prettier --check
npx tsc --noEmit      # typecheck
```
