import os
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import psycopg
import pytest
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class _TestSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    test_database_url: str


TEST_DATABASE_URL = _TestSettings().test_database_url
# Must happen before the app (and its engine) is imported.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Experiment,
    ExperimentStatus,
    Measurement,
    Organization,
    Project,
    Sample,
    User,
    UserRole,
)
from app.security import hash_password  # noqa: E402

PASSWORD = "test-password"
PASSWORD_HASH = hash_password(PASSWORD)


def _ensure_database_exists() -> None:
    url = make_url(TEST_DATABASE_URL)
    conninfo = url.set(drivername="postgresql", database="postgres").render_as_string(hide_password=False)
    with psycopg.connect(conninfo, autocommit=True) as conn:
        if not conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (url.database,)).fetchone():
            conn.execute(f'CREATE DATABASE "{url.database}"')


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    _ensure_database_exists()
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL.replace("%", "%%"))
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE organizations, users, projects, experiments, samples, measurements CASCADE"))


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@dataclass
class Tenant:
    org: Organization
    user: User
    project: Project
    experiment: Experiment
    sample: Sample


def _create_tenant(db, slug: str) -> Tenant:
    org = Organization(id=uuid.uuid4(), name=slug.title(), slug=slug)
    user = User(
        id=uuid.uuid4(),
        org_id=org.id,
        email=f"admin@{slug}.example.com",
        name="Admin",
        role=UserRole.ADMIN,
        hashed_password=PASSWORD_HASH,
    )
    project = Project(id=uuid.uuid4(), org_id=org.id, name=f"{slug} project")
    experiment = Experiment(
        id=uuid.uuid4(),
        project_id=project.id,
        name=f"{slug} experiment",
        status=ExperimentStatus.RUNNING,
        owner_id=user.id,
        start_date=date(2026, 1, 1),
    )
    sample = Sample(id=uuid.uuid4(), experiment_id=experiment.id, name=f"{slug} sample", type="buffer")
    base = datetime(2026, 1, 1, tzinfo=UTC)
    measurements = [
        Measurement(
            sample_id=sample.id, timestamp=base + timedelta(hours=i), metric="temperature", value=20.0 + i, unit="°C"
        )
        for i in range(3)
    ]
    for row in (org, user, project, experiment, sample, *measurements):
        db.add(row)
        db.flush()
    db.commit()
    return Tenant(org, user, project, experiment, sample)


@pytest.fixture
def make_tenant(db):
    return lambda slug=None: _create_tenant(db, slug or f"org-{uuid.uuid4().hex[:8]}")


def login(client: TestClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
