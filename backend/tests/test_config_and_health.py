from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import OperationalError

from app import main
from app.config import PLACEHOLDER_JWT_SECRET, Settings

ROOT = Path(__file__).resolve().parents[2]


def _settings(secret: str) -> Settings:
    return Settings(_env_file=None, database_url="postgresql+psycopg://u@localhost/db", jwt_secret=secret)


def test_placeholder_jwt_secret_is_refused():
    with pytest.raises(ValidationError, match="still the placeholder from .env.example"):
        _settings(PLACEHOLDER_JWT_SECRET)


def test_real_and_too_short_secrets():
    assert _settings("x" * 32).jwt_secret == "x" * 32
    with pytest.raises(ValidationError):
        _settings("short")


@pytest.mark.parametrize("example", [ROOT / ".env.example", ROOT / "backend" / ".env.example"])
def test_env_examples_ship_the_placeholder_that_is_refused(example):
    # If the example value changes, the guard above has to change with it.
    assert f"JWT_SECRET={PLACEHOLDER_JWT_SECRET}" in example.read_text().splitlines()


def test_health_ok(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_health_is_503_when_database_is_down(client, monkeypatch):
    def refuse():
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(main.engine, "connect", refuse)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unreachable"}
