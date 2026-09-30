"""Load synthetic demo data: two organizations with projects, experiments, samples
and measurement time series.

    python -m scripts.seed          # no-op if the demo orgs already exist
    python -m scripts.seed --reset  # delete the demo orgs (cascades) and reseed

All data is synthetic. Demo accounts share the password in DEMO_PASSWORD.
"""

import argparse
import math
import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, insert, select

from app.db import SessionLocal
from app.models import (
    Experiment,
    ExperimentStatus,
    Measurement,
    Organization,
    Project,
    Sample,
    SampleStatus,
    User,
    UserRole,
)
from app.security import hash_password

DEMO_PASSWORD = "labflow-demo"


def _logistic(t: float, midpoint: float = 0.4, steepness: float = 10.0) -> float:
    return 1 / (1 + math.exp(-steepness * (t - midpoint)))


@dataclass(frozen=True)
class MetricProfile:
    unit: str
    noise: float
    lower: float | None = None
    upper: float | None = None

    def value(self, metric: str, t: float, p: dict[str, float], rng: random.Random) -> float:
        """Noise-free trend for progress t in [0, 1], plus gaussian noise."""
        match metric:
            case "temperature":
                trend = p["setpoint"] + p["drift"] * t + 0.4 * math.sin(t * 6 * math.pi)
            case "pressure":
                trend = p["base"] + p["ramp"] * min(t / 0.2, 1.0) - p["leak"] * t
            case "yield":
                trend = p["plateau"] * _logistic(t, p["midpoint"])
            case "concentration":
                trend = p["c0"] * math.exp(-p["k"] * t)
            case "ph":
                trend = p["ph0"] - p["acidify"] * _logistic(t, 0.5, 6)
            case "dissolved_oxygen":
                trend = 95 - p["uptake"] * _logistic(t, 0.45, 8)
            case "biomass":
                trend = 0.3 + p["max_od"] * _logistic(t, 0.5, 9)
            case _:
                raise ValueError(metric)
        value = trend + rng.gauss(0, self.noise)
        if self.lower is not None:
            value = max(self.lower, value)
        if self.upper is not None:
            value = min(self.upper, value)
        return round(value, 4)


METRICS = {
    "temperature": MetricProfile("°C", 0.25),
    "pressure": MetricProfile("kPa", 0.8, lower=0),
    "yield": MetricProfile("%", 1.2, lower=0, upper=100),
    "concentration": MetricProfile("mol/L", 0.01, lower=0),
    "ph": MetricProfile("pH", 0.04, lower=0, upper=14),
    "dissolved_oxygen": MetricProfile("%", 1.5, lower=0, upper=100),
    "biomass": MetricProfile("OD600", 0.15, lower=0),
}


def _sample_params(rng: random.Random, setpoint: float) -> dict[str, float]:
    """Per-sample variation so series within an experiment are comparable but distinct."""
    return {
        "setpoint": setpoint + rng.uniform(-1.5, 1.5),
        "drift": rng.uniform(-1.0, 2.5),
        "base": rng.uniform(100, 104),
        "ramp": rng.uniform(40, 180),
        "leak": rng.uniform(0, 8),
        "plateau": rng.uniform(62, 94),
        "midpoint": rng.uniform(0.3, 0.5),
        "c0": rng.uniform(0.8, 2.0),
        "k": rng.uniform(1.2, 3.0),
        "ph0": rng.uniform(6.9, 7.2),
        "acidify": rng.uniform(0.4, 1.3),
        "uptake": rng.uniform(40, 70),
        "max_od": rng.uniform(8, 18),
    }


@dataclass(frozen=True)
class ExperimentSpec:
    name: str
    description: str
    status: ExperimentStatus
    sample_prefix: str
    sample_type: str
    metrics: tuple[str, ...]
    setpoint: float
    # Days relative to today: start offset (negative = past) and duration.
    start_offset: int
    duration: int


ORGS = [
    {
        "name": "Acme Labs",
        "slug": "acme-labs",
        "users": [
            ("admin@acme-labs.dev", "Dana Whitfield", UserRole.ADMIN),
            ("priya.nair@acme-labs.dev", "Priya Nair", UserRole.MEMBER),
            ("tom.okafor@acme-labs.dev", "Tom Okafor", UserRole.MEMBER),
        ],
        "projects": [
            (
                "Catalyst Screening Q3",
                "Heterogeneous catalyst candidates for the hydrogenation step in route B.",
                [
                    ExperimentSpec(
                        "Pd/C hydrogenation, batch A",
                        "Baseline activity for 5% Pd/C at 3 bar H2.",
                        ExperimentStatus.COMPLETED,
                        "PDC",
                        "catalyst slurry",
                        ("temperature", "pressure", "yield"),
                        60,
                        -75,
                        10,
                    ),
                    ExperimentSpec(
                        "Pt/Al2O3 temperature sweep",
                        "Activity vs. temperature from 50 to 90 °C.",
                        ExperimentStatus.RUNNING,
                        "PTA",
                        "catalyst slurry",
                        ("temperature", "pressure", "yield"),
                        72,
                        -9,
                        14,
                    ),
                    ExperimentSpec(
                        "Ni catalyst reuse cycles",
                        "Five reuse cycles to measure deactivation.",
                        ExperimentStatus.PLANNED,
                        "NIR",
                        "catalyst slurry",
                        ("temperature", "yield"),
                        65,
                        12,
                        20,
                    ),
                    ExperimentSpec(
                        "Ru screen (superseded)",
                        "Replaced by the Pt series after cost review.",
                        ExperimentStatus.ARCHIVED,
                        "RUS",
                        "catalyst slurry",
                        ("temperature", "yield"),
                        58,
                        -160,
                        6,
                    ),
                ],
            ),
            (
                "Polymer Curing Study",
                "Cure kinetics for the EP-40 adhesive formulation.",
                [
                    ExperimentSpec(
                        "Epoxy cure at 80 °C",
                        "Isothermal cure, residual monomer tracked by titration.",
                        ExperimentStatus.RUNNING,
                        "EPX",
                        "resin coupon",
                        ("temperature", "concentration"),
                        80,
                        -5,
                        10,
                    ),
                    ExperimentSpec(
                        "UV cure intensity series",
                        "Three lamp intensities, conversion measured by FTIR.",
                        ExperimentStatus.COMPLETED,
                        "UVC",
                        "resin film",
                        ("temperature", "yield", "concentration"),
                        35,
                        -40,
                        7,
                    ),
                    ExperimentSpec(
                        "Moisture sensitivity",
                        "Cure at 40/60/80% RH.",
                        ExperimentStatus.PLANNED,
                        "MST",
                        "resin coupon",
                        ("temperature", "concentration"),
                        60,
                        20,
                        14,
                    ),
                ],
            ),
            (
                "Solvent Recovery Pilot",
                "Distillation-based THF recovery from the pilot plant waste stream.",
                [
                    ExperimentSpec(
                        "Column trial 1",
                        "Reflux ratio 2:1.",
                        ExperimentStatus.COMPLETED,
                        "CT1",
                        "distillate fraction",
                        ("temperature", "pressure", "yield"),
                        66,
                        -30,
                        5,
                    ),
                    ExperimentSpec(
                        "Column trial 2",
                        "Reflux ratio 3:1.",
                        ExperimentStatus.RUNNING,
                        "CT2",
                        "distillate fraction",
                        ("temperature", "pressure", "yield"),
                        66,
                        -3,
                        6,
                    ),
                ],
            ),
        ],
    },
    {
        "name": "Helix Biosciences",
        "slug": "helix-bio",
        "users": [
            ("admin@helix-bio.dev", "Samir Haddad", UserRole.ADMIN),
            ("lena.kowalski@helix-bio.dev", "Lena Kowalski", UserRole.MEMBER),
            ("marco.silva@helix-bio.dev", "Marco Silva", UserRole.MEMBER),
        ],
        "projects": [
            (
                "Fermentation Scale-Up",
                "Scaling strain HX-12 from shake flask to 50 L.",
                [
                    ExperimentSpec(
                        "5 L bioreactor, strain HX-12",
                        "Batch run at 30 °C, DO cascade on agitation.",
                        ExperimentStatus.RUNNING,
                        "BR5",
                        "fermentation broth",
                        ("temperature", "ph", "dissolved_oxygen", "biomass"),
                        30,
                        -4,
                        7,
                    ),
                    ExperimentSpec(
                        "Fed-batch glucose feed",
                        "Exponential feed profile, mu set = 0.15 1/h.",
                        ExperimentStatus.COMPLETED,
                        "FBG",
                        "fermentation broth",
                        ("temperature", "ph", "biomass", "concentration"),
                        30,
                        -50,
                        9,
                    ),
                    ExperimentSpec(
                        "50 L transfer run",
                        "First run in the pilot vessel.",
                        ExperimentStatus.PLANNED,
                        "B50",
                        "fermentation broth",
                        ("temperature", "ph", "dissolved_oxygen"),
                        30,
                        25,
                        10,
                    ),
                ],
            ),
            (
                "Enzyme Stability",
                "Formulation screen for the HX-lipase product.",
                [
                    ExperimentSpec(
                        "Thermal denaturation panel",
                        "Residual activity after 1 h holds from 40 to 70 °C.",
                        ExperimentStatus.COMPLETED,
                        "TDP",
                        "enzyme solution",
                        ("temperature", "yield"),
                        55,
                        -90,
                        4,
                    ),
                    ExperimentSpec(
                        "Buffer screen pH 5-9",
                        "Activity retention in phosphate, citrate and Tris buffers.",
                        ExperimentStatus.RUNNING,
                        "BUF",
                        "enzyme solution",
                        ("temperature", "ph", "yield"),
                        25,
                        -12,
                        21,
                    ),
                    ExperimentSpec(
                        "Lyophilization trial",
                        "Dropped after the vendor changed excipient grade.",
                        ExperimentStatus.ARCHIVED,
                        "LYO",
                        "lyophilized powder",
                        ("temperature", "yield"),
                        -40,
                        -200,
                        3,
                    ),
                ],
            ),
        ],
    },
]


def _seed_experiment(db, rng: random.Random, project: Project, spec: ExperimentSpec, owner: User, now: datetime) -> int:
    start = (now + timedelta(days=spec.start_offset)).replace(hour=8, minute=0, second=0, microsecond=0)
    planned_end = start + timedelta(days=spec.duration)
    finished = spec.status in (ExperimentStatus.COMPLETED, ExperimentStatus.ARCHIVED)

    experiment = Experiment(
        project_id=project.id,
        name=spec.name,
        description=spec.description,
        status=spec.status,
        owner_id=owner.id,
        start_date=start.date(),
        end_date=planned_end.date() if finished or spec.status == ExperimentStatus.PLANNED else None,
        created_at=start - timedelta(days=rng.randint(3, 10)),
        updated_at=min(planned_end, now) if finished else now - timedelta(hours=rng.uniform(0.5, 30)),
    )
    db.add(experiment)
    db.flush()

    sample_count = rng.randint(3, 5)
    rows = []
    for i in range(1, sample_count + 1):
        if spec.status == ExperimentStatus.PLANNED:
            status = SampleStatus.PENDING
        elif spec.status == ExperimentStatus.RUNNING:
            status = SampleStatus.PENDING if i == sample_count else SampleStatus.IN_PROGRESS
        else:
            status = SampleStatus.COMPLETE

        sample = Sample(
            id=uuid.uuid4(),
            experiment_id=experiment.id,
            name=f"{spec.sample_prefix}-{i:02d}",
            type=spec.sample_type,
            status=status,
            created_at=experiment.created_at + timedelta(days=1),
        )
        db.add(sample)
        if status == SampleStatus.PENDING:
            continue

        # Running experiments have data up to now, as a fraction of their planned duration.
        window_end = min(planned_end, now)
        progress_end = (window_end - start) / (planned_end - start)
        params = _sample_params(rng, spec.setpoint)
        for metric in spec.metrics:
            points = max(10, int(rng.randint(60, 180) * progress_end))
            step = (window_end - start) / points
            profile = METRICS[metric]
            for n in range(points):
                ts = start + step * n + timedelta(seconds=rng.uniform(0, step.total_seconds() * 0.3))
                t = progress_end * n / points
                rows.append(
                    {
                        "id": uuid.uuid4(),
                        "sample_id": sample.id,
                        "timestamp": ts,
                        "metric": metric,
                        "value": profile.value(metric, t, params, rng),
                        "unit": profile.unit,
                    }
                )
    db.flush()
    if rows:
        db.execute(insert(Measurement), rows)
    return len(rows)


def seed(reset: bool = False) -> None:
    slugs = [org["slug"] for org in ORGS]
    rng = random.Random(42)
    now = datetime.now(UTC)
    password_hash = hash_password(DEMO_PASSWORD)

    with SessionLocal() as db:
        existing = db.scalars(select(Organization.slug).where(Organization.slug.in_(slugs))).all()
        if existing and not reset:
            print(f"Demo data already present ({', '.join(existing)}); skipping. Use --reset to reseed.")
            return
        if existing:
            db.execute(delete(Organization).where(Organization.slug.in_(slugs)))

        for org_spec in ORGS:
            org = Organization(name=org_spec["name"], slug=org_spec["slug"])
            db.add(org)
            db.flush()
            users = [
                User(org_id=org.id, email=email, name=name, role=role, hashed_password=password_hash)
                for email, name, role in org_spec["users"]
            ]
            db.add_all(users)
            db.flush()

            measurement_count = experiment_count = 0
            for project_name, description, experiments in org_spec["projects"]:
                project = Project(org_id=org.id, name=project_name, description=description)
                db.add(project)
                db.flush()
                for spec in experiments:
                    measurement_count += _seed_experiment(db, rng, project, spec, rng.choice(users), now)
                    experiment_count += 1
            print(
                f"{org.name}: {len(users)} users, {len(org_spec['projects'])} projects, "
                f"{experiment_count} experiments, {measurement_count} measurements"
            )
        db.commit()
    print(f"Demo password for all seeded users: {DEMO_PASSWORD}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="delete and recreate the demo organizations")
    seed(reset=parser.parse_args().reset)
