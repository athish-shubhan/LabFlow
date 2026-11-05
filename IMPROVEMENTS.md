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

## Round 2 (2026-11-05): one bad timestamp could break an organization's dashboard; page overflow

Stacked on round 1 (`improve/round-1`).

### What changed

1. **A single measurement with an extreme UTC offset took down reads for the whole organization.**
   `MeasurementCreate.timestamp` accepted any aware datetime. `9999-12-31T23:59:59-14:00` is valid ISO 8601,
   but it is year 10000 in UTC. Postgres stores it, and then psycopg cannot read it back
   (`timestamp too large (after year 10K)`). The POST returned 500 after the row was already committed. From
   then on, the sample's measurement list, the experiment's analytics and the organization's dashboard all
   returned 500 for every user in that org. `0001-01-01T00:00:00+10:00`, which is year 0 in UTC, failed the
   same way. The new `UtcDatetime` type (`app/schemas.py`) rejects such values with a 422
   (`"timestamp is out of range once converted to UTC"`). It is used for the measurement body and for the
   `from`/`to` filters on `/samples/{id}/measurements` and `/experiments/{id}/analytics`, which also returned
   500 for those values.
2. **`?page=10**20` on the measurements list returned 500** (`bigint out of range` on OFFSET). `page` is now
   capped at 1,000,000, so `(page - 1) * page_size` always fits, and anything larger gets a 422.

### Why it matters

The first bug let any member of an org break the dashboard for everyone in it with one ordinary-looking API
call, and the fix needed a manual DB cleanup. The README's validation story ("malformed input is 422, not
500") had gaps at the edges of the datetime and integer ranges.

### How it was verified

Postgres 16 running locally, Python 3.14.6.

Reproduced on round 1's code before the fix:

```
before: list 200 analytics 200
bad POST 500                                          # timestamp 9999-12-31T23:59:59-14:00
after: list 500 analytics 500 dashboard 500
measurements {'page': 100000000000000000000} 500 {"detail":"Internal server error"}
```

```
$ ruff check . && ruff format --check . && python -m pytest -q    # backend
All checks passed!
26 files already formatted
48 passed in 16.28s                                   # was 39

$ npm test                                            # frontend, unchanged
      Tests  83 passed (83)
```

The 9 new tests in `tests/test_validation.py` were also run on round 1's backend. 8 fail there. The ninth checks
that `9999-12-31T23:59:59Z` and `0001-01-01T00:00:00Z` are still accepted and read back. It passes on both
branches, so no valid timestamp is newly rejected.

### Not verified

- I did not check whether an existing database already holds out-of-range rows. Any such rows would still
  break reads and would need a manual `DELETE`. The seed script only generates timestamps near the current
  date, so seeded data is not affected.
- Playwright was not run (no compose stack in this sandbox).

### Files touched

`backend/app/schemas.py`, `backend/app/routers/samples.py`, `backend/app/routers/experiments.py`,
`backend/tests/test_validation.py`, `README.md`, `IMPROVEMENTS.md`

## Round 3 (2026-11-05): refuse the public placeholder JWT secret; 503 health check; page clamp

Stacked on round 2 (`improve/round-2`).

### What changed

1. **The backend accepted the `.env.example` signing key.** Both `.env.example` files ship
   `JWT_SECRET=replace-with-a-long-random-string-of-32-plus-chars`. That is 50 characters, so it passed
   `Field(min_length=32)`. Someone who ran `cp .env.example .env && docker compose up` without editing it got
   a server whose tokens anyone could forge from the public repo. The user's and org's UUIDs appear in URLs and
   API responses. `Settings` now rejects that exact value with a message that gives the command to generate a
   real one. The backend fails at startup instead of running insecurely. A test checks that both example files
   still contain the value being refused, so the guard cannot silently drift out of sync with them.
2. **`/health` returns 503 when the database is down.** Before, the exception reached the catch-all handler
   and came back as a generic `500 {"detail": "Internal server error"}`. It now returns
   `503 {"status": "unavailable", "database": "unreachable"}`, logged with the cause, and keeps the documented
   200 response schema.
3. **`parsePage` mirrors the backend's page bound.** The measurements table read `?page=` with
   `Number.isInteger`, which accepts `1e300` and `9007199254740993`, and anything above round 2's
   `MAX_PAGE = 1_000_000`. Those turned into a backend 422 and the error page. Values outside
   [1, 1,000,000], or not a safe integer, now fall back to page 1, as other invalid values already did.

### Why it matters

A setup that is insecure by default, with a key the README itself publishes, is the kind of thing a reviewer
spots first. A health endpoint that reports an outage as a server bug points people at the wrong layer.

### How it was verified

Backend: Postgres 16 locally, Python 3.14.6. Frontend: Node 22.

The risk, reproduced on round 2's code with `JWT_SECRET` set to the placeholder: a token signed locally,
without logging in, is accepted.

```
forged token with the .env.example secret -> 200 admin@org-ce4341e2.example.com
```

On this branch, with the same environment, the app refuses to import:

```
$ python -c "from app.main import app"
  Value error, JWT_SECRET is still the placeholder from .env.example; generate one with python -c "import secrets; print(secrets.token_urlsafe(48))"
```

```
$ ruff check . && ruff format --check . && python -m pytest -q     # backend
All checks passed!
27 files already formatted
54 passed in 16.98s                                                # was 48

$ npm test        # 83 -> 87
$ npm run lint    # exit 0
$ npm run typecheck   # exit 0
```

### Not verified

- `docker compose up` with the placeholder was not run (no Docker daemon here). The startup failure was shown
  by importing the app with that environment. Compose should report the backend as unhealthy, with the message
  in `docker compose logs backend`.
- Only the exact shipped placeholder is refused. Other weak secrets of 32 or more characters are still accepted.

### Files touched

`backend/app/config.py`, `backend/app/main.py`, `backend/tests/test_config_and_health.py` (new),
`frontend/src/lib/pagination.ts`, `frontend/src/lib/pagination.test.ts`, `README.md`, `IMPROVEMENTS.md`
