import itertools
import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import AwareDatetime
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.errors import FieldValidationError
from app.models import Experiment, ExperimentStatus, Measurement, Sample, SampleStatus
from app.routers.projects import resolve_owner
from app.schemas import (
    AnalyticsSeries,
    ExperimentAnalytics,
    ExperimentOut,
    ExperimentUpdate,
    MetricName,
    SampleCreate,
    SampleOut,
    SeriesPoint,
    SeriesStats,
)
from app.tenancy import get_experiment, measurements_in_org, samples_in_org

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("/{experiment_id}", response_model=ExperimentOut)
def read_experiment(experiment_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Experiment:
    return get_experiment(db, experiment_id, user.org_id)


@router.patch("/{experiment_id}", response_model=ExperimentOut)
def update_experiment(experiment_id: uuid.UUID, body: ExperimentUpdate, user: CurrentUser, db: DbSession) -> Experiment:
    experiment = get_experiment(db, experiment_id, user.org_id)
    changes = body.model_dump(exclude_unset=True)
    if "owner_id" in changes:
        changes["owner_id"] = resolve_owner(db, changes["owner_id"], user.org_id)

    start = changes.get("start_date", experiment.start_date)
    end = changes.get("end_date", experiment.end_date)
    if start and end and end < start:
        raise FieldValidationError("end_date", "end_date must be on or after start_date")

    for field, value in changes.items():
        setattr(experiment, field, value)
    db.commit()
    db.refresh(experiment)
    return experiment


@router.delete("/{experiment_id}", response_model=ExperimentOut)
def archive_experiment(experiment_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Experiment:
    # Experiments are archived rather than deleted so their measurement history is kept.
    experiment = get_experiment(db, experiment_id, user.org_id)
    if experiment.status != ExperimentStatus.ARCHIVED:
        experiment.status = ExperimentStatus.ARCHIVED
        db.commit()
        db.refresh(experiment)
    return experiment


@router.get("/{experiment_id}/samples", response_model=list[SampleOut])
def list_samples(
    experiment_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    status_filter: Annotated[SampleStatus | None, Query(alias="status")] = None,
) -> list[Sample]:
    experiment = get_experiment(db, experiment_id, user.org_id)
    query = samples_in_org(user.org_id).where(Sample.experiment_id == experiment.id).order_by(Sample.name)
    if status_filter is not None:
        query = query.where(Sample.status == status_filter)
    return list(db.scalars(query))


@router.post("/{experiment_id}/samples", response_model=SampleOut, status_code=status.HTTP_201_CREATED)
def create_sample(experiment_id: uuid.UUID, body: SampleCreate, user: CurrentUser, db: DbSession) -> Sample:
    experiment = get_experiment(db, experiment_id, user.org_id)
    sample = Sample(experiment_id=experiment.id, **body.model_dump())
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return sample


def _parse_sample_ids(raw: str) -> list[uuid.UUID]:
    try:
        return [uuid.UUID(part.strip()) for part in raw.split(",") if part.strip()]
    except ValueError:
        raise FieldValidationError("sample_ids", "Must be a comma-separated list of sample UUIDs", "query") from None


@router.get("/{experiment_id}/analytics", response_model=ExperimentAnalytics)
def experiment_analytics(
    experiment_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    metric: MetricName | None = None,
    sample_ids: Annotated[str | None, Query(description="Comma-separated sample UUIDs")] = None,
    start: Annotated[AwareDatetime | None, Query(alias="from")] = None,
    end: Annotated[AwareDatetime | None, Query(alias="to")] = None,
) -> ExperimentAnalytics:
    """Measurement time series for an experiment, one series per (sample, metric, unit)."""
    experiment = get_experiment(db, experiment_id, user.org_id)
    if start and end and start > end:
        raise FieldValidationError("from", "'from' must be before 'to'", "query")

    base = measurements_in_org(user.org_id).where(Sample.experiment_id == experiment.id)

    available_metrics = list(
        db.scalars(base.with_only_columns(Measurement.metric).distinct().order_by(Measurement.metric))
    )

    query = base.with_only_columns(
        Measurement.sample_id,
        Sample.name,
        Measurement.metric,
        Measurement.unit,
        Measurement.timestamp,
        Measurement.value,
    )
    if sample_ids:
        ids = _parse_sample_ids(sample_ids)
        known = set(db.scalars(select(Sample.id).where(Sample.experiment_id == experiment.id, Sample.id.in_(ids))))
        unknown = [str(i) for i in ids if i not in known]
        if unknown:
            raise FieldValidationError("sample_ids", f"Not samples of this experiment: {', '.join(unknown)}", "query")
        query = query.where(Measurement.sample_id.in_(ids))
    if metric:
        query = query.where(Measurement.metric == metric)
    if start:
        query = query.where(Measurement.timestamp >= start)
    if end:
        query = query.where(Measurement.timestamp <= end)
    query = query.order_by(
        Sample.name, Measurement.sample_id, Measurement.metric, Measurement.unit, Measurement.timestamp
    )

    series = []
    rows = db.execute(query).all()
    for (sample_id, sample_name, metric_name, unit), group in itertools.groupby(rows, key=lambda r: r[:4]):
        points = [SeriesPoint(timestamp=r.timestamp, value=r.value) for r in group]
        values = [p.value for p in points]
        series.append(
            AnalyticsSeries(
                sample_id=sample_id,
                sample_name=sample_name,
                metric=metric_name,
                unit=unit,
                stats=SeriesStats(count=len(values), min=min(values), max=max(values), mean=sum(values) / len(values)),
                points=points,
            )
        )

    return ExperimentAnalytics(experiment_id=experiment.id, available_metrics=available_metrics, series=series)
