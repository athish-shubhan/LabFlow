import math
import uuid
from datetime import date, datetime
from typing import Annotated, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

from app.models import ExperimentStatus, SampleStatus, UserRole

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
MetricName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$"),
]
Unit = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# Auth / users / orgs


class LoginRequest(InputModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORMModel):
    id: uuid.UUID
    org_id: uuid.UUID
    email: str
    name: str
    role: UserRole
    created_at: datetime


class UserSummary(ORMModel):
    id: uuid.UUID
    name: str
    email: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class OrganizationOut(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    created_at: datetime


# Projects


class ProjectCreate(InputModel):
    name: Name
    description: Description | None = None


class ProjectOut(ORMModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    description: str | None
    experiment_count: int
    created_at: datetime
    updated_at: datetime


# Experiments


def _check_date_order(start: date | None, end: date | None) -> None:
    if start and end and end < start:
        raise ValueError("end_date must be on or after start_date")


class ExperimentCreate(InputModel):
    name: Name
    description: Description | None = None
    status: ExperimentStatus = ExperimentStatus.PLANNED
    owner_id: uuid.UUID | None = Field(default=None, description="Defaults to the current user.")
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def dates_in_order(self) -> Self:
        _check_date_order(self.start_date, self.end_date)
        return self


class ExperimentUpdate(InputModel):
    name: Name | None = None
    description: Description | None = None
    status: ExperimentStatus | None = None
    owner_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def required_fields_not_null(self) -> Self:
        for field in ("name", "status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ExperimentOut(ORMModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    status: ExperimentStatus
    owner: UserSummary | None
    start_date: date | None
    end_date: date | None
    sample_count: int
    created_at: datetime
    updated_at: datetime


# Samples


class SampleCreate(InputModel):
    name: Name
    type: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    status: SampleStatus = SampleStatus.PENDING


class SampleUpdate(InputModel):
    name: Name | None = None
    type: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] | None = None
    status: SampleStatus | None = None

    @model_validator(mode="after")
    def no_nulls(self) -> Self:
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class SampleOut(ORMModel):
    id: uuid.UUID
    experiment_id: uuid.UUID
    name: str
    type: str
    status: SampleStatus
    measurement_count: int
    created_at: datetime


# Measurements


class MeasurementCreate(InputModel):
    timestamp: AwareDatetime
    metric: MetricName
    value: float = Field(allow_inf_nan=False)
    unit: Unit


class MeasurementOut(ORMModel):
    id: uuid.UUID
    sample_id: uuid.UUID
    timestamp: datetime
    metric: str
    value: float
    unit: str


class MeasurementPage(BaseModel):
    items: list[MeasurementOut]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def build(cls, items: list, total: int, page: int, page_size: int) -> Self:
        return cls(
            items=[MeasurementOut.model_validate(m) for m in items],
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size) if total else 0,
        )


# Analytics


class SeriesPoint(BaseModel):
    timestamp: datetime
    value: float


class SeriesStats(BaseModel):
    count: int
    min: float
    max: float
    mean: float


class AnalyticsSeries(BaseModel):
    sample_id: uuid.UUID
    sample_name: str
    metric: str
    unit: str
    stats: SeriesStats
    points: list[SeriesPoint]


class ExperimentAnalytics(BaseModel):
    experiment_id: uuid.UUID
    available_metrics: list[str]
    series: list[AnalyticsSeries]


# Dashboard


class RecentExperiment(BaseModel):
    id: uuid.UUID
    name: str
    status: ExperimentStatus
    project_id: uuid.UUID
    project_name: str
    updated_at: datetime


class RecentMeasurement(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    metric: str
    value: float
    unit: str
    sample_id: uuid.UUID
    sample_name: str
    experiment_id: uuid.UUID
    experiment_name: str


class DashboardOut(BaseModel):
    organization: OrganizationOut
    project_count: int
    experiment_count: int
    active_experiment_count: int
    experiments_by_status: dict[ExperimentStatus, int]
    sample_count: int
    samples_by_status: dict[SampleStatus, int]
    measurement_count: int
    measurements_last_7_days: int
    recent_experiments: list[RecentExperiment]
    recent_measurements: list[RecentMeasurement]
