from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

# Pin the session time zone so timestamps always come back as UTC regardless of server config.
engine = create_engine(get_settings().database_url, pool_pre_ping=True, connect_args={"options": "-c timezone=utc"})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
