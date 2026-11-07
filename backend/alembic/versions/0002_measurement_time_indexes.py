"""measurement time indexes

The dashboard's recent-readings and last-7-days queries filter and sort on timestamp
alone, and the measurements table pages one sample's readings by (timestamp, id)
without a metric filter; neither is served by (sample_id, metric, timestamp).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-08

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_measurements_timestamp", "measurements", ["timestamp"])
    op.create_index("ix_measurements_sample_ts", "measurements", ["sample_id", "timestamp", "id"])


def downgrade() -> None:
    op.drop_index("ix_measurements_sample_ts", table_name="measurements")
    op.drop_index("ix_measurements_timestamp", table_name="measurements")
