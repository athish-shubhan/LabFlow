"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-30

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizations")),
        sa.UniqueConstraint("slug", name=op.f("uq_organizations_slug")),
    )
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"], ["organizations.id"], name=op.f("fk_projects_org_id_organizations"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_projects")),
    )
    op.create_index(op.f("ix_projects_org_id"), "projects", ["org_id"], unique=False)
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'member')", name=op.f("ck_users_user_role")),
        sa.ForeignKeyConstraint(
            ["org_id"], ["organizations.id"], name=op.f("fk_users_org_id_organizations"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(op.f("ix_users_org_id"), "users", ["org_id"], unique=False)
    op.create_table(
        "experiments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('planned', 'running', 'completed', 'archived')", name=op.f("ck_experiments_experiment_status")
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_experiments_owner_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], name=op.f("fk_experiments_project_id_projects"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_experiments")),
    )
    op.create_index(op.f("ix_experiments_owner_id"), "experiments", ["owner_id"], unique=False)
    op.create_index(op.f("ix_experiments_project_id"), "experiments", ["project_id"], unique=False)
    op.create_index(op.f("ix_experiments_status"), "experiments", ["status"], unique=False)
    op.create_table(
        "samples",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IN ('pending', 'in_progress', 'complete')", name=op.f("ck_samples_sample_status")),
        sa.ForeignKeyConstraint(
            ["experiment_id"], ["experiments.id"], name=op.f("fk_samples_experiment_id_experiments"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_samples")),
    )
    op.create_index(op.f("ix_samples_experiment_id"), "samples", ["experiment_id"], unique=False)
    op.create_table(
        "measurements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sample_id", sa.Uuid(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("metric", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(
            ["sample_id"], ["samples.id"], name=op.f("fk_measurements_sample_id_samples"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_measurements")),
    )
    op.create_index(
        "ix_measurements_sample_metric_ts", "measurements", ["sample_id", "metric", "timestamp"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_measurements_sample_metric_ts", table_name="measurements")
    op.drop_table("measurements")
    op.drop_index(op.f("ix_samples_experiment_id"), table_name="samples")
    op.drop_table("samples")
    op.drop_index(op.f("ix_experiments_status"), table_name="experiments")
    op.drop_index(op.f("ix_experiments_project_id"), table_name="experiments")
    op.drop_index(op.f("ix_experiments_owner_id"), table_name="experiments")
    op.drop_table("experiments")
    op.drop_index(op.f("ix_users_org_id"), table_name="users")
    op.drop_table("users")
    op.drop_index(op.f("ix_projects_org_id"), table_name="projects")
    op.drop_table("projects")
    op.drop_table("organizations")
