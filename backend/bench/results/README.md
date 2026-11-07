# Benchmark results

Every file records its command, environment and a free-text note in the JSON itself, except the first three.

| File | Origin |
|---|---|
| `baseline.json`, `baseline-rerun.json`, `optimized-width1200.json` | Produced earlier on the repository owner's laptop (Docker/Colima, 125,000 readings per series, machine load unknown). Environment details were not recorded in the files. Kept for reference; the numbers are noisy (the two baseline runs disagree by 2-3x) and are not quoted in the README. |
| `before-main-50k.json`, `before-main-50k-run2.json` | Code on `main` (9ffa4ef), API on port 8001, 50,000 readings per series. |
| `after-width1200-50k.json`, `after-width1200-50k-run2.json` | This branch, `width=1200`. |
| `after-nowidth-50k.json` | This branch, no `width` (full resolution), so only indexes and query changes apply. |

Environment of the `*-50k*` runs: Apple M1, 8 GiB RAM, macOS 26.2, Python 3.14.8, PostgreSQL 16.2
(standalone binary, `shared_buffers=128MB`, no Docker), API and database on the same machine. The machine was
not idle: load average at start was 3-5 on 8 logical CPUs because other jobs were running, so absolute
numbers are pessimistic and noisy; compare the before/after pairs run back to back, not across files.
Docker Compose was not used for these runs (no container runtime was available).

Note: the case labelled "measurements page 2000 (OFFSET 99,950)" is only meaningful at 125,000+ readings per series;
at 50,000 per series the page is out of range and the endpoint clamps it, so it is not an OFFSET test here.
