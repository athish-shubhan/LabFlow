import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.deps import CurrentUser, DbSession
from app.errors import FieldValidationError
from app.models import Experiment, ExperimentStatus, Project, User
from app.schemas import ExperimentCreate, ExperimentOut, ProjectOut
from app.tenancy import experiments_in_org, get_project

router = APIRouter(prefix="/projects", tags=["projects"])


def resolve_owner(db: Session, owner_id: uuid.UUID | None, org_id: uuid.UUID) -> uuid.UUID | None:
    if owner_id is None:
        return None
    exists = db.scalar(select(User.id).where(User.id == owner_id, User.org_id == org_id))
    if exists is None:
        raise FieldValidationError("owner_id", "Owner must be a user in your organization")
    return owner_id


@router.get("/{project_id}", response_model=ProjectOut)
def read_project(project_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Project:
    return get_project(db, project_id, user.org_id)


@router.get("/{project_id}/experiments", response_model=list[ExperimentOut])
def list_experiments(
    project_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    status_filter: Annotated[ExperimentStatus | None, Query(alias="status")] = None,
) -> list[Experiment]:
    project = get_project(db, project_id, user.org_id)
    query = (
        experiments_in_org(user.org_id)
        .where(Experiment.project_id == project.id)
        .options(selectinload(Experiment.owner))
        .order_by(Experiment.created_at.desc())
    )
    if status_filter is not None:
        query = query.where(Experiment.status == status_filter)
    return list(db.scalars(query))


@router.post("/{project_id}/experiments", response_model=ExperimentOut, status_code=status.HTTP_201_CREATED)
def create_experiment(project_id: uuid.UUID, body: ExperimentCreate, user: CurrentUser, db: DbSession) -> Experiment:
    project = get_project(db, project_id, user.org_id)
    data = body.model_dump()
    data["owner_id"] = resolve_owner(db, body.owner_id, user.org_id) if body.owner_id else user.id
    experiment = Experiment(project_id=project.id, **data)
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    return experiment
