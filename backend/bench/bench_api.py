"""Latency and payload benchmark against a running API (not the in-process test client),
so serialization, the network stack and the connection pool are all on the measured path.

    python -m bench.seed_scale --points 125000
    uvicorn app.main:app --port 8000 &
    python -m bench.bench_api --label baseline

Each case runs a warm-up request, then `--repeat` sequential requests; the table reports
p50/p95 wall-clock latency and the response body size. Results are also written to
bench/results/<label>.json so before/after runs can be compared.
"""

import argparse
import json
import statistics
import time
from pathlib import Path

import httpx2 as httpx

from bench.seed_scale import EMAIL
from scripts.seed import DEMO_PASSWORD

RESULTS = Path(__file__).parent / "results"


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(q * (len(ordered) - 1)))]


def run_case(client: httpx.Client, name: str, method: str, url: str, repeat: int, **kwargs) -> dict:
    client.request(method, url, **kwargs).raise_for_status()  # warm-up
    timings, size = [], 0
    for _ in range(repeat):
        start = time.perf_counter()
        response = client.request(method, url, **kwargs)
        timings.append((time.perf_counter() - start) * 1000)
        response.raise_for_status()
        size = len(response.content)
    result = {
        "case": name,
        "p50_ms": round(statistics.median(timings), 1),
        "p95_ms": round(percentile(timings, 0.95), 1),
        "bytes": size,
        "repeat": repeat,
    }
    print(f"{name:<44} p50 {result['p50_ms']:>8.1f} ms   p95 {result['p95_ms']:>8.1f} ms   {size / 1024:>9.1f} KiB")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--label", required=True, help="name for bench/results/<label>.json")
    parser.add_argument("--repeat", type=int, default=20)
    parser.add_argument("--query", action="append", default=[], help="extra analytics query param, e.g. width=1200")
    args = parser.parse_args()

    with httpx.Client(base_url=args.base_url, timeout=120) as client:
        token = client.post("/api/auth/login", json={"email": EMAIL, "password": DEMO_PASSWORD}).json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token}"
        org_id = client.get("/api/auth/me").json()["org_id"]
        project = client.get(f"/api/organizations/{org_id}/projects").json()[0]
        experiment = client.get(f"/api/projects/{project['id']}/experiments").json()[0]
        exp = experiment["id"]
        samples = client.get(f"/api/experiments/{exp}/samples").json()
        sample = samples[0]["id"]
        extra = dict(q.split("=", 1) for q in args.query)
        series_points = samples[0]["measurement_count"] // 2
        print(f"experiment {exp}: {len(samples)} samples, {series_points:,} readings per series\n")

        r = args.repeat
        heavy = max(3, r // 4)  # full-experiment analytics can take seconds per request at baseline
        results = [
            run_case(client, "dashboard", "GET", f"/api/organizations/{org_id}/dashboard", r),
            run_case(client, "samples list (with counts)", "GET", f"/api/experiments/{exp}/samples", r),
            run_case(client, "measurements page 1", "GET", f"/api/samples/{sample}/measurements", r),
            run_case(
                client,
                "measurements page 2000 (OFFSET 99,950)",
                "GET",
                f"/api/samples/{sample}/measurements",
                r,
                params={"page": 2000},
            ),
            run_case(
                client,
                "analytics: 1 series",
                "GET",
                f"/api/experiments/{exp}/analytics",
                heavy,
                params={"metric": "temperature", "sample_ids": sample, **extra},
            ),
            run_case(
                client,
                "analytics: 1 metric, all samples",
                "GET",
                f"/api/experiments/{exp}/analytics",
                heavy,
                params={"metric": "temperature", **extra},
            ),
            run_case(
                client, "analytics: whole experiment", "GET", f"/api/experiments/{exp}/analytics", heavy, params=extra
            ),
        ]

    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / f"{args.label}.json"
    out.write_text(
        json.dumps({"series_points": series_points, "samples": len(samples), "results": results}, indent=2) + "\n"
    )
    print(f"\nwrote {out.relative_to(Path.cwd()) if out.is_relative_to(Path.cwd()) else out}")


if __name__ == "__main__":
    main()
