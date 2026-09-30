import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    MetaData,
    String,
    Text,
    Uuid,
    func,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, column_property, mapped_column, relationship

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UserRole(enum.StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class ExperimentStatus(enum.StrEnum):
    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class SampleStatus(enum.StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"


def _str_enum(enum_cls: type[enum.StrEnum], name: str) -> Enum:
    # Stored as VARCHAR + CHECK constraint rather than a native Postgres ENUM so
    # adding a status later is a plain migration instead of ALTER TYPE.
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda e: [m.value for m in e],
    )


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = _created_at()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[UserRole] = mapped_column(_str_enum(UserRole, "user_role"), default=UserRole.MEMBER)
    created_at: Mapped[datetime] = _created_at()

    organization: Mapped[Organization] = relationship()


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = _uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[uuid.UUID] = _uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ExperimentStatus] = mapped_column(
        _str_enum(ExperimentStatus, "experiment_status"), default=ExperimentStatus.PLANNED, index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped[Project] = relationship()
    owner: Mapped[User | None] = relationship()


class Sample(Base):
    __tablename__ = "samples"

    id: Mapped[uuid.UUID] = _uuid_pk()
    experiment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("experiments.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(100))
    status: Mapped[SampleStatus] = mapped_column(
        _str_enum(SampleStatus, "sample_status"), default=SampleStatus.PENDING
    )
    created_at: Mapped[datetime] = _created_at()


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (Index("ix_measurements_sample_metric_ts", "sample_id", "metric", "timestamp"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    sample_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("samples.id", ondelete="CASCADE"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    metric: Mapped[str] = mapped_column(String(64))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(32))


# Child counts exposed on list/detail responses, computed in the same SELECT.
Project.experiment_count = column_property(
    select(func.count(Experiment.id)).where(Experiment.project_id == Project.id).correlate_except(Experiment).scalar_subquery()
)
Experiment.sample_count = column_property(
    select(func.count(Sample.id)).where(Sample.experiment_id == Experiment.id).correlate_except(Sample).scalar_subquery()
)
Sample.measurement_count = column_property(
    select(func.count(Measurement.id))
    .where(Measurement.sample_id == Sample.id)
    .correlate_except(Measurement)
    .scalar_subquery()
)
