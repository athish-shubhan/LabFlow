# Improvements log

## Round 1 (2026-11-05): CI, BFF proxy path and timeout guards, README test description

### What changed

1. **CI.** There was none. `.github/workflows/ci.yml` runs on every push and pull request:
   - **backend:** Python 3.14 (the version in the Dockerfile and `ruff.toml`), `ruff check`, `ruff format --check`,
     and `pytest` against a `postgres:17-alpine` service container. The JWT signing key is generated per run,
     so no secret is committed.
   - **frontend:** Node 24 (the version in the Dockerfile), `npm ci`, ESLint, `tsc` (`npm run typecheck`),
     Vitest, and `next build`.
   - Playwright is not in CI, because it needs the whole compose stack.
2. **The BFF proxy could forward outside `/api`.** `/bff/[...path]` checked only that the first segment was
   `api`, then built the target with `new URL()`. That normalises dot segments, so `["api", "..", "openapi.json"]`
   was forwarded to `/openapi.json`, and `["api", "x", "..", "..", "docs"]` to `/docs`, with the user's bearer
   token attached. Today's backend exposes nothing sensitive outside `/api`, so this is defence in depth, but it
   defeated the check's purpose. Empty, `.` and `..` segments are now rejected with a 404. The URL is built by a
   pure helper (`src/lib/api/bff.ts`) so it can be unit-tested.
3. **The BFF proxy had no upstream timeout.** A stalled backend held the request open indefinitely. It now
   aborts after 15 s and answers `504 "The LabFlow API did not respond in time."`. Connection failures are
   still `502`.
4. **Tests for the proxy, which had none.** 14 tests:
   - `bff.test.ts` (8): the allowed paths, dot and empty segments, encoding, and a trailing slash on the base URL.
   - `route.test.ts` (6), which runs the real route handler under Node with a stubbed `fetch`:
     - the bearer header and query string are forwarded
     - a write keeps its body and content type
     - backend error statuses pass through unchanged
     - no cookie gives 401 without calling the backend
     - a traversal gives 404 without calling the backend
     - a timeout gives 504 and a connection failure gives 502
5. **README.** The Testing section said Vitest's API client tests ran against "a real backend". The same README
   later says the tests "don't hit the network", and the code stubs `fetch`. It now says what is true. The Vitest
   count is updated (re-measured), CI is described, and the proxy's two guards are mentioned in the
   Architecture section.

### Why it matters

The BFF is the one place where the session token leaves the httpOnly cookie, so its path checks and failure
modes matter more than any other frontend code, and it had no tests. Without CI, nothing checked that the
39 backend tests, the strict `tsc` build or the lint rules held on each change.

### How it was verified

Backend: Postgres 16 started locally (the sandbox has no Docker daemon; compose and CI use 17), Python 3.14.6
installed with `uv`.

```
$ ruff check . && ruff format --check . && python -m pytest -q        # backend, unchanged code
All checks passed!
26 files already formatted
39 passed in 13.63s
```

Frontend: Node 22.23.4.

```
$ npm test          # before (main)
      Tests  69 passed (69)
$ npm test          # after
      Tests  83 passed (83)
$ npm run lint; npm run typecheck; npm run build     # all exit 0
```

The new `route.test.ts` was run against `main`'s `route.ts`. 3 of its 6 tests fail there: the traversal is
forwarded, the timeout comes back as 502 rather than 504, and no abort signal is passed to `fetch`.

```
$ node -e '... new URL(`http://backend:8000/${["api","..","openapi.json"].map(encodeURIComponent).join("/")}`).pathname'
/openapi.json
```

### Not verified

- The CI workflow has not run yet; the first run on this PR is the check. Locally I used Node 22 rather than 24
  and Postgres 16 rather than 17.
- Playwright: there was no compose stack in this sandbox. The README's "4 tests" was not re-run.
- The README's performance tables (login ~390 ms, dashboard TTFB ~70 ms, and so on) were measured on Apple
  Silicon with Colima. They were not re-measured and are unchanged.
- The README's statement that removing the org filter made "six" tenant-isolation tests fail was not re-run.

### Files touched

`.github/workflows/ci.yml` (new), `frontend/src/lib/api/bff.ts` (new), `frontend/src/lib/api/bff.test.ts` (new),
`frontend/src/app/bff/[...path]/route.ts`, `frontend/src/app/bff/[...path]/route.test.ts` (new), `README.md`,
`IMPROVEMENTS.md` (new)
