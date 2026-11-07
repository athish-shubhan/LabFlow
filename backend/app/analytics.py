"""Time-series queries behind GET /experiments/{id}/analytics.

Callers pass sample IDs they have already resolved through the org-scoped experiment
lookup (tenancy.get_experiment), and these queries read `measurements` by sample_id
directly. Joining every reading back up to projects.org_id, as
tenancy.measurements_in_org does, costs one nested-loop probe per reading, which
dominated response time once a series held hundreds of thousands of readings.

Downsampled requests (`width`) split each series into `width` equal time buckets and
keep the lowest and highest reading of each. When a bucket spans at least a minute,
the buckets are built from `measurement_rollups` (per-minute aggregates kept by a
trigger, see migration 0003) instead of from every reading, plus the raw readings of
any partial minute at the edges of a from/to window, so stats stay exact.
"""

import math
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import Float, String, Uuid, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Session

ROLLUP_PERIOD = timedelta(minutes=1)

# Loose index scan over (sample_id, metric, ...): a few index probes per distinct
# pair instead of reading and de-duplicating every row.
_SERIES_KEYS = text(
    """
    SELECT s.id AS sample_id, r.metric
    FROM unnest(:sample_ids) AS s(id)
    CROSS JOIN LATERAL (
        WITH RECURSIVE r(metric) AS (
            (SELECT metric FROM measurements WHERE sample_id = s.id ORDER BY metric LIMIT 1)
            UNION ALL
            SELECT (
                SELECT m.metric FROM measurements m
                WHERE m.sample_id = s.id AND m.metric > r.metric
                ORDER BY m.metric LIMIT 1
            )
            FROM r WHERE r.metric IS NOT NULL
        )
        SELECT metric FROM r WHERE metric IS NOT NULL
    ) AS r
    """
).bindparams(bindparam("sample_ids", type_=ARRAY(Uuid)))

_RAW = """
    SELECT m.sample_id, m.metric, m.unit, m.timestamp, m.value
    FROM measurements m
    WHERE m.sample_id = ANY(:sample_ids) {filters}
    ORDER BY m.sample_id, m.metric, m.unit, m.timestamp
"""

# Each series' time range in the window, from min/max probes on the
# (sample_id, metric, timestamp) index.
_BOUNDS = """
    SELECT k.sample_id, k.metric, extract(epoch FROM x.t0)::float8, extract(epoch FROM x.t1)::float8
    FROM unnest(:key_samples, :key_metrics) AS k(sample_id, metric)
    CROSS JOIN LATERAL (
        SELECT min(m.timestamp) AS t0, max(m.timestamp) AS t1
        FROM measurements m
        WHERE m.sample_id = k.sample_id AND m.metric = k.metric {filters}
    ) AS x
    WHERE x.t0 IS NOT NULL
"""

# Both bucket queries return (sample_id, metric, unit, n, total, lo, hi) per bucket.
# lo/hi are min/max over [value, epoch] and [value, -epoch] arrays, i.e. the lowest
# and highest reading together with when it was taken (ties: the earliest).
_BUCKET = (
    "greatest(least(floor((extract(epoch FROM {at})::float8 - b.t0) * :width / nullif(b.t1 - b.t0, 0)), :width - 1), 0)"
)
_LO = "ARRAY[{v}, extract(epoch FROM {at})::float8]"
_HI = "ARRAY[{v}, -extract(epoch FROM {at})::float8]"
_SERIES_JOIN = "JOIN b ON b.sample_id = {t}.sample_id AND b.metric = {t}.metric"
_B = "WITH b AS (SELECT * FROM unnest(:b_samples, :b_metrics, :b_t0, :b_t1) AS b(sample_id, metric, t0, t1))"

_BUCKETED_READINGS = f"""
    {_B}
    SELECT m.sample_id, m.metric, m.unit, count(*), sum(m.value),
           min({_LO.format(v="m.value", at="m.timestamp")}), max({_HI.format(v="m.value", at="m.timestamp")})
    FROM measurements m {_SERIES_JOIN.format(t="m")}
    WHERE true {{filters}}
    GROUP BY m.sample_id, m.metric, m.unit, {_BUCKET.format(at="m.timestamp")}
"""

_BUCKETED_ROLLUPS = f"""
    {_B},
    src AS (
        SELECT r.sample_id, r.metric, r.unit, r.minute AS at, r.n, r.total,
               {_LO.format(v="r.min", at="r.min_at")} AS lo, {_HI.format(v="r.max", at="r.max_at")} AS hi
        FROM measurement_rollups r {_SERIES_JOIN.format(t="r")}
        WHERE true {{rollup_filters}}
        {{edges}}
    )
    SELECT src.sample_id, src.metric, src.unit, sum(src.n), sum(src.total), min(src.lo), max(src.hi)
    FROM src {_SERIES_JOIN.format(t="src")}
    GROUP BY src.sample_id, src.metric, src.unit, {_BUCKET.format(at="src.at")}
"""

_EDGES = f"""
        UNION ALL
        SELECT m.sample_id, m.metric, m.unit, m.timestamp, 1, m.value,
               {_LO.format(v="m.value", at="m.timestamp")}, {_HI.format(v="m.value", at="m.timestamp")}
        FROM measurements m {_SERIES_JOIN.format(t="m")}
        WHERE {{conditions}}
"""

_BOUND_ARRAYS = (
    bindparam("b_samples", type_=ARRAY(Uuid)),
    bindparam("b_metrics", type_=ARRAY(String)),
    bindparam("b_t0", type_=ARRAY(Float)),
    bindparam("b_t1", type_=ARRAY(Float)),
)


@dataclass
class Series:
    sample_id: uuid.UUID
    metric: str
    unit: str
    count: int = 0
    total: float = 0.0
    min: float = math.inf
    max: float = -math.inf
    points: list[tuple[datetime, float]] = field(default_factory=list)

    @property
    def mean(self) -> float:
        return self.total / self.count


def series_keys(db: Session, sample_ids: list[uuid.UUID]) -> list[tuple[uuid.UUID, str]]:
    """Distinct (sample_id, metric) pairs that have at least one reading."""
    if not sample_ids:
        return []
    return [tuple(row) for row in db.execute(_SERIES_KEYS, {"sample_ids": sample_ids})]


def _time_filters(start: datetime | None, end: datetime | None) -> str:
    return (" AND m.timestamp >= :start" if start else "") + (" AND m.timestamp <= :end" if end else "")


def _floor_minute(t: datetime) -> datetime:
    return t.replace(second=0, microsecond=0)


def _ceil_minute(t: datetime) -> datetime:
    floor = _floor_minute(t)
    return floor if floor == t else floor + ROLLUP_PERIOD


def load_series(
    db: Session,
    keys: list[tuple[uuid.UUID, str]],
    start: datetime | None,
    end: datetime | None,
    width: int | None,
) -> list[Series]:
    """Series for the given (sample_id, metric) pairs, split further by unit.

    Stats always cover every reading in the window. With `width`, points are reduced
    to the lowest and highest reading of each of `width` time buckets.
    """
    if not keys:
        return []
    series: dict[tuple, Series] = {}

    def get(sample_id: uuid.UUID, metric: str, unit: str) -> Series:
        key = (sample_id, metric, unit)
        if key not in series:
            series[key] = Series(sample_id, metric, unit)
        return series[key]

    time_params = {"start": start, "end": end}
    if width is None:
        wanted = set(keys)
        query = text(_RAW.format(filters=_time_filters(start, end) + " AND m.metric = ANY(:metrics)")).bindparams(
            bindparam("sample_ids", type_=ARRAY(Uuid)), bindparam("metrics", type_=ARRAY(String))
        )
        params = {**time_params, "sample_ids": list({s for s, _ in keys}), "metrics": list({m for _, m in keys})}
        for sample_id, metric, unit, timestamp, value in db.execute(query, params):
            if (sample_id, metric) not in wanted:
                continue
            s = get(sample_id, metric, unit)
            s.count += 1
            s.total += value
            s.min = min(s.min, value)
            s.max = max(s.max, value)
            s.points.append((timestamp, value))
        return list(series.values())

    bounds_query = text(_BOUNDS.format(filters=_time_filters(start, end))).bindparams(
        bindparam("key_samples", type_=ARRAY(Uuid)), bindparam("key_metrics", type_=ARRAY(String))
    )
    bounds = db.execute(
        bounds_query, {**time_params, "key_samples": [s for s, _ in keys], "key_metrics": [m for _, m in keys]}
    ).all()

    # Rollups cover whole minutes. Minutes in [lo_edge, hi_edge) lie entirely inside the
    # window; readings in partial minutes before lo_edge or from hi_edge on come from
    # measurements. A window inside a single minute has no whole minutes to use.
    lo_edge = _ceil_minute(start) if start else None
    hi_edge = _floor_minute(end) if end else None
    rollups_usable = not (lo_edge and hi_edge and lo_edge > hi_edge)
    min_span = ROLLUP_PERIOD.total_seconds() * width
    from_rollups = [b for b in bounds if rollups_usable and b[3] - b[2] >= min_span]
    from_readings = [b for b in bounds if b not in from_rollups]

    if from_readings:
        query = text(_BUCKETED_READINGS.format(filters=_time_filters(start, end))).bindparams(*_BOUND_ARRAYS)
        _collect(db.execute(query, {**time_params, "width": width, **_bound_params(from_readings)}), get)

    if from_rollups:
        rollup_filters = (" AND r.minute >= :lo_edge" if start else "") + (" AND r.minute < :hi_edge" if end else "")
        edges = []
        if start:
            edges.append("(m.timestamp >= :start AND m.timestamp < :lo_edge)")
        if end:
            edges.append("(m.timestamp >= :hi_edge AND m.timestamp <= :end)")
        query = text(
            _BUCKETED_ROLLUPS.format(
                rollup_filters=rollup_filters,
                edges=_EDGES.format(conditions=" OR ".join(edges)) if edges else "",
            )
        ).bindparams(*_BOUND_ARRAYS)
        params = {**time_params, "lo_edge": lo_edge, "hi_edge": hi_edge, "width": width}
        _collect(db.execute(query, {**params, **_bound_params(from_rollups)}), get)

    for s in series.values():
        s.points = [(datetime.fromtimestamp(round(epoch, 6), UTC), value) for epoch, value in sorted(s.points)]
    return list(series.values())


def _bound_params(bounds: list) -> dict:
    return {
        "b_samples": [b[0] for b in bounds],
        "b_metrics": [b[1] for b in bounds],
        "b_t0": [b[2] for b in bounds],
        "b_t1": [b[3] for b in bounds],
    }


def _collect(rows, get) -> None:
    """Fold bucket rows into series; points are (epoch, value) until load_series sorts them."""
    for sample_id, metric, unit, n, total, lo, hi in rows:
        s = get(sample_id, metric, unit)
        s.count += n
        s.total += total
        s.min = min(s.min, lo[0])
        s.max = max(s.max, hi[0])
        s.points.append((lo[1], lo[0]))
        if -hi[1] != lo[1]:
            s.points.append((-hi[1], hi[0]))
