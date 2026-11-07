"""measurement rollups

Per-minute aggregates of each (sample, metric, unit) series, so a chart over a long
time range reads a couple of thousand rollup rows per series instead of every
reading. Kept current by a statement-level trigger on measurements: one upsert per
touched minute per INSERT statement, so bulk loads stay cheap.

Measurements are insert-only through the API, and deletes only happen by cascade
from samples, which cascades to the rollups too. If single measurements ever become
editable or deletable, this trigger needs UPDATE/DELETE handling.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# min/max over [value, epoch] arrays picks the lowest/highest reading together with
# the time it was taken (ties: earliest).
ROLLUP_SELECT = """
    SELECT sample_id, metric, unit, date_trunc('minute', timestamp), count(*), sum(value),
           (min(ARRAY[value, extract(epoch FROM timestamp)::float8]))[1],
           to_timestamp((min(ARRAY[value, extract(epoch FROM timestamp)::float8]))[2]),
           (max(ARRAY[value, -extract(epoch FROM timestamp)::float8]))[1],
           to_timestamp(-(max(ARRAY[value, -extract(epoch FROM timestamp)::float8]))[2])
    FROM {source}
    GROUP BY 1, 2, 3, 4
"""


def upgrade() -> None:
    op.create_table(
        "measurement_rollups",
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("metric", sa.String(length=64), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("minute", sa.DateTime(timezone=True), nullable=False),
        sa.Column("n", sa.Integer(), nullable=False),
        sa.Column("total", sa.Float(), nullable=False),
        sa.Column("min", sa.Float(), nullable=False),
        sa.Column("min_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max", sa.Float(), nullable=False),
        sa.Column("max_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["sample_id"],
            ["samples.id"],
            name=op.f("fk_measurement_rollups_sample_id_samples"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("sample_id", "metric", "unit", "minute", name=op.f("pk_measurement_rollups")),
    )
    op.execute(
        f"""
        CREATE FUNCTION measurements_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            INSERT INTO measurement_rollups AS r (sample_id, metric, unit, minute, n, total, min, min_at, max, max_at)
            {ROLLUP_SELECT.format(source="new_rows")}
            ON CONFLICT (sample_id, metric, unit, minute) DO UPDATE SET
                n = r.n + excluded.n,
                total = r.total + excluded.total,
                min = least(r.min, excluded.min),
                min_at = CASE WHEN excluded.min < r.min THEN excluded.min_at ELSE r.min_at END,
                max = greatest(r.max, excluded.max),
                max_at = CASE WHEN excluded.max > r.max THEN excluded.max_at ELSE r.max_at END;
            RETURN NULL;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER measurements_rollup AFTER INSERT ON measurements
        REFERENCING NEW TABLE AS new_rows
        FOR EACH STATEMENT EXECUTE FUNCTION measurements_rollup()
        """
    )
    op.execute(
        "INSERT INTO measurement_rollups (sample_id, metric, unit, minute, n, total, min, min_at, max, max_at)"
        + ROLLUP_SELECT.format(source="measurements")
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER measurements_rollup ON measurements")
    op.execute("DROP FUNCTION measurements_rollup()")
    op.drop_table("measurement_rollups")
