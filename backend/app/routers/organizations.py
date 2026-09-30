import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import Experiment, ExperimentStatus, Measurement, Organization, Project, Sample, SampleStatus
from app.schemas import (
    DashboardOut,
    OrganizationOut,
    ProjectCreate,
    ProjectOut,
    RecentExperiment,
    RecentMeasurement,
)
from app.tenancy import experiments_in_org, get_own_org, measurements_in_org, projects_in_org, samples_in_org

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=list[OrganizationOut])
def list_organizations(user: CurrentUser, db: DbSession) -> list[Organization]:
    return [db.get(Organization, user.org_id)]


@router.get("/{org_id}/dashboard", response_model=DashboardOut)
def get_dashboard(org_id: uuid.UUID, user: CurrentUser, db: DbSession) -> DashboardOut:
    org = get_own_org(db, org_id, user)

    def count(query) -> int:
        return db.scalar(select(func.count()).select_from(query.subquery()))

    experiments_by_status = {s: 0 for s in ExperimentStatus}
    experiments_by_status.update(
        db.execute(
            experiments_in_org(org_id).with_only_columns(Experiment.status, func.count()).group_by(Experiment.status)
        ).all()
    )
    samples_by_status = {s: 0 for s in SampleStatus}
    samples_by_status.update(
        db.execute(samples_in_org(org_id).with_only_columns(Sample.status, func.count()).group_by(Sample.status)).all()
    )

    recent_experiments = db.execute(
        experiments_in_org(org_id)
        .with_only_columns(Experiment, Project.name)
        .order_by(Experiment.updated_at.desc())
        .limit(5)
    ).all()

    recent_measurements = db.execute(
        measurements_in_org(org_id)
        .with_only_columns(Measurement, Sample.name, Experiment.id, Experiment.name)
        .order_by(Measurement.timestamp.desc())
        .limit(10)
    ).all()

    week_ago = datetime.now(UTC) - timedelta(days=7)
    return DashboardOut(
        organization=OrganizationOut.model_validate(org),
        project_count=count(projects_in_org(org_id)),
        experiment_count=sum(experiments_by_status.values()),
        active_experiment_count=experiments_by_status[ExperimentStatus.RUNNING],
        experiments_by_status=experiments_by_status,
        sample_count=sum(samples_by_status.values()),
        samples_by_status=samples_by_status,
        measurement_count=count(measurements_in_org(org_id).with_only_columns(Measurement.id)),
        measurements_last_7_days=count(
            measurements_in_org(org_id).with_only_columns(Measurement.id).where(Measurement.timestamp >= week_ago)
        ),
        recent_experiments=[
            RecentExperiment(
                id=e.id,
                name=e.name,
                status=e.status,
                project_id=e.project_id,
                project_name=project_name,
                updated_at=e.updated_at,
            )
            for e, project_name in recent_experiments
        ],
        recent_measurements=[
            RecentMeasurement(
                id=m.id,
                timestamp=m.timestamp,
                metric=m.metric,
                value=m.value,
                unit=m.unit,
                sample_id=m.sample_id,
                sample_name=sample_name,
                experiment_id=experiment_id,
                experiment_name=experiment_name,
            )
            for m, sample_name, experiment_id, experiment_name in recent_measurements
        ],
    )


@router.get("/{org_id}/projects", response_model=list[ProjectOut])
def list_projects(org_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[Project]:
    get_own_org(db, org_id, user)
    return list(db.scalars(projects_in_org(org_id).order_by(Project.created_at.desc())))


@router.post("/{org_id}/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(org_id: uuid.UUID, body: ProjectCreate, user: CurrentUser, db: DbSession) -> Project:
    get_own_org(db, org_id, user)
    project = Project(org_id=org_id, **body.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project
