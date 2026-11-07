"""Load an instrument-scale benchmark tenant: one experiment whose samples were logged
at a fixed sample rate, so a single series holds hundreds of thousands of readings.

    python -m bench.seed_scale --points 250000          # 4 samples x 2 metrics x 250k
    python -m bench.seed_scale --points 250000 --reset  # drop and recreate the bench org

Rows are generated inside Postgres (generate_series), one series per statement, so the
seed is limited by the database rather than by Python. The org is separate from the
demo orgs; log in as bench@labflow.dev with the demo password.
"""

import argparse
import time
import uuid

from sqlalchemy import delete, select, text

from app.db import SessionLocal, engine
from app.models import Experiment, ExperimentStatus, Organization, Project, Sample, SampleStatus, User, UserRole
from app.security import hash_password
from scripts.seed import DEMO_PASSWORD

SLUG = "bench"
EMAIL = "bench@labflow.dev"

# Same shapes as the demo seed (scripts/seed.py), expressed in SQL over progress t in [0, 1).
METRICS = {
    "temperature": ("°C", "60 + 1.5 * t + 0.4 * sin(t * 6 * pi()) + 0.25 * (random() - 0.5) * 3.4"),
    "pressure": ("kPa", "102 + 120 * least(t / 0.2, 1.0) - 6 * t + 0.8 * (random() - 0.5) * 3.4"),
}

SERIES_SQL = """
INSERT INTO measurements (id, sample_id, timestamp, metric, value, unit)
SELECT gen_random_uuid(), :sample_id, CAST(:start AS timestamptz) + make_interval(secs => n * :interval_s),
       :metric, {expr}, :unit
FROM (SELECT n, n::float8 / :points AS t FROM generate_series(0, :points - 1) AS n) AS g
"""


def seed(points: int, samples: int, interval_s: float, reset: bool) -> None:
    with SessionLocal() as db:
        existing = db.scalar(select(Organization).where(Organization.slug == SLUG))
        if existing and not reset:
            print("Bench org already present; use --reset to recreate it.")
            return
        if existing:
            db.execute(delete(Organization).where(Organization.slug == SLUG))
            db.commit()

        org = Organization(name="Bench Instruments", slug=SLUG)
        db.add(org)
        db.flush()
        user = User(
            org_id=org.id, email=EMAIL, name="Bench", role=UserRole.ADMIN, hashed_password=hash_password(DEMO_PASSWORD)
        )
        project = Project(org_id=org.id, name="Continuous logging")
        db.add_all([user, project])
        db.flush()
        experiment = Experiment(
            project_id=project.id,
            name=f"Reactor log, {points:,} readings per series",
            status=ExperimentStatus.RUNNING,
            owner_id=user.id,
        )
        db.add(experiment)
        db.flush()

        start = time.perf_counter()
        for i in range(1, samples + 1):
            sample = Sample(
                id=uuid.uuid4(),
                experiment_id=experiment.id,
                name=f"R-{i:02d}",
                type="reactor",
                status=SampleStatus.IN_PROGRESS,
            )
            db.add(sample)
            db.flush()
            for metric, (unit, expr) in METRICS.items():
                db.execute(
                    text(SERIES_SQL.format(expr=expr)),
                    {
                        "sample_id": sample.id,
                        "start": "2026-06-01T00:00:00Z",
                        "interval_s": interval_s,
                        "metric": metric,
                        "unit": unit,
                        "points": points,
                    },
                )
            db.commit()
        rows = samples * len(METRICS) * points
        print(f"experiment {experiment.id}: {rows:,} rows in {time.perf_counter() - start:.1f}s")
    # VACUUM (not just ANALYZE) sets the visibility map, which index-only count scans rely on;
    # it can't run inside a transaction block.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("VACUUM ANALYZE measurements"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--points", type=int, default=250_000, help="readings per (sample, metric) series")
    parser.add_argument("--samples", type=int, default=4)
    parser.add_argument("--interval", type=float, default=1.0, help="seconds between readings")
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    seed(args.points, args.samples, args.interval, args.reset)
