from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.db import engine
from tests.conftest import TEST_DATABASE_URL


def _config() -> Config:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL.replace("%", "%%"))
    return cfg


def test_migrations_downgrade_to_base_and_upgrade_again():
    cfg = _config()
    try:
        command.downgrade(cfg, "base")
        remaining = set(inspect(engine).get_table_names()) - {"alembic_version"}
        assert remaining == set()
        with engine.connect() as conn:
            leftover = conn.execute(text("SELECT count(*) FROM pg_proc WHERE proname = 'measurements_rollup'")).scalar()
        assert leftover == 0
    finally:
        command.upgrade(cfg, "head")
    assert "measurement_rollups" in inspect(engine).get_table_names()
