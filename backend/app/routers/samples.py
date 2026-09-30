import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from pydantic import AwareDatetime
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.errors import FieldValidationError
from app.models import Measurement, Sample
from app.schemas import MeasurementCreate, MeasurementOut, MeasurementPage, MetricName, SampleOut, SampleUpdate
from app.tenancy import get_sample, measurements_in_org

router = APIRouter(prefix="/samples", tags=["samples"])


@router.get("/{sample_id}", response_model=SampleOut)
def read_sample(sample_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Sample:
    return get_sample(db, sample_id, user.org_id)


@router.patch("/{sample_id}", response_model=SampleOut)
def update_sample(sample_id: uuid.UUID, body: SampleUpdate, user: CurrentUser, db: DbSession) -> Sample:
    sample = get_sample(db, sample_id, user.org_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(sample, field, value)
    db.commit()
    db.refresh(sample)
    return sample


@router.get("/{sample_id}/measurements", response_model=MeasurementPage)
def list_measurements(
    sample_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    metric: MetricName | None = None,
    start: Annotated[AwareDatetime | None, Query(alias="from")] = None,
    end: Annotated[AwareDatetime | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 50,
    order: Literal["asc", "desc"] = "asc",
) -> MeasurementPage:
    sample = get_sample(db, sample_id, user.org_id)
    if start and end and start > end:
        raise FieldValidationError("from", "'from' must be before 'to'", "query")

    query = measurements_in_org(user.org_id).where(Measurement.sample_id == sample.id)
    if metric:
        query = query.where(Measurement.metric == metric)
    if start:
        query = query.where(Measurement.timestamp >= start)
    if end:
        query = query.where(Measurement.timestamp <= end)

    total = db.scalar(select(func.count()).select_from(query.with_only_columns(Measurement.id).subquery()))
    sort = Measurement.timestamp.asc() if order == "asc" else Measurement.timestamp.desc()
    items = db.scalars(query.order_by(sort, Measurement.id).offset((page - 1) * page_size).limit(page_size)).all()
    return MeasurementPage.build(list(items), total, page, page_size)


@router.post("/{sample_id}/measurements", response_model=MeasurementOut, status_code=status.HTTP_201_CREATED)
def create_measurement(sample_id: uuid.UUID, body: MeasurementCreate, user: CurrentUser, db: DbSession) -> Measurement:
    sample = get_sample(db, sample_id, user.org_id)
    measurement = Measurement(sample_id=sample.id, **body.model_dump())
    db.add(measurement)
    db.commit()
    db.refresh(measurement)
    return measurement
