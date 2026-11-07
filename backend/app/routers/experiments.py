import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app import analytics
from app.deps import CurrentUser, DbSession
from app.errors import FieldValidationError
from app.models import Experiment, ExperimentStatus, Sample, SampleStatus
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
    UtcDatetime,
)
from app.tenancy import get_experiment, samples_in_org

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
    start: Annotated[UtcDatetime | None, Query(alias="from")] = None,
    end: Annotated[UtcDatetime | None, Query(alias="to")] = None,
    width: Annotated[
        int | None,
        Query(ge=10, le=10_000, description="Downsample each series to at most 2 x width points"),
    ] = None,
) -> ExperimentAnalytics:
    """Measurement time series for an experiment, one series per (sample, metric, unit).

    With `width` (roughly the chart's pixel width), each series is split into `width`
    equal time buckets and each bucket keeps its minimum and maximum reading, so spikes
    survive while the payload stays bounded regardless of how many readings are stored.
    Buckets with two or fewer readings keep them all, so sparse series are unchanged.
    `stats` always covers every reading in range.
    """
    experiment = get_experiment(db, experiment_id, user.org_id)
    if start and end and start > end:
        raise FieldValidationError("from", "'from' must be before 'to'", "query")

    # The experiment lookup above is org-scoped, so its samples are too.
    sample_names = dict(db.execute(select(Sample.id, Sample.name).where(Sample.experiment_id == experiment.id)).all())
    keys = analytics.series_keys(db, list(sample_names))
    available_metrics = sorted({m for _, m in keys})

    if sample_ids:
        ids = _parse_sample_ids(sample_ids)
        unknown = [str(i) for i in ids if i not in sample_names]
        if unknown:
            raise FieldValidationError("sample_ids", f"Not samples of this experiment: {', '.join(unknown)}", "query")
        selected = set(ids)
        keys = [k for k in keys if k[0] in selected]
    if metric:
        keys = [k for k in keys if k[1] == metric]

    loaded = analytics.load_series(db, keys, start, end, width)
    loaded.sort(key=lambda s: (sample_names[s.sample_id], s.sample_id, s.metric, s.unit))
    series = [
        AnalyticsSeries(
            sample_id=s.sample_id,
            sample_name=sample_names[s.sample_id],
            metric=s.metric,
            unit=s.unit,
            stats=SeriesStats(count=s.count, min=s.min, max=s.max, mean=s.mean),
            points=[SeriesPoint(timestamp=t, value=v) for t, v in s.points],
        )
        for s in loaded
    ]

    return ExperimentAnalytics(experiment_id=experiment.id, available_metrics=available_metrics, series=series)
