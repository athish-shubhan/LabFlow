"""Org-scoped query builders.

Every read or write of a tenant resource starts from one of these selects, so the
org filter is part of the SQL itself rather than a check after loading. A resource
in another org is indistinguishable from one that doesn't exist: both are 404,
which avoids leaking the existence of other tenants' IDs (a 403 would).
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models import Experiment, Measurement, Organization, Project, Sample, User


def not_found(resource: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{resource} not found")


def projects_in_org(org_id: uuid.UUID) -> Select[tuple[Project]]:
    return select(Project).where(Project.org_id == org_id)


def experiments_in_org(org_id: uuid.UUID) -> Select[tuple[Experiment]]:
    return select(Experiment).join(Project, Experiment.project_id == Project.id).where(Project.org_id == org_id)


def samples_in_org(org_id: uuid.UUID) -> Select[tuple[Sample]]:
    return (
        select(Sample)
        .join(Experiment, Sample.experiment_id == Experiment.id)
        .join(Project, Experiment.project_id == Project.id)
        .where(Project.org_id == org_id)
    )


def measurements_in_org(org_id: uuid.UUID) -> Select[tuple[Measurement]]:
    return (
        select(Measurement)
        .join(Sample, Measurement.sample_id == Sample.id)
        .join(Experiment, Sample.experiment_id == Experiment.id)
        .join(Project, Experiment.project_id == Project.id)
        .where(Project.org_id == org_id)
    )


def get_own_org(db: Session, org_id: uuid.UUID, user: User) -> Organization:
    org = db.get(Organization, org_id) if org_id == user.org_id else None
    if org is None:
        raise not_found("Organization")
    return org


def get_project(db: Session, project_id: uuid.UUID, org_id: uuid.UUID) -> Project:
    project = db.scalar(projects_in_org(org_id).where(Project.id == project_id))
    if project is None:
        raise not_found("Project")
    return project


def get_experiment(db: Session, experiment_id: uuid.UUID, org_id: uuid.UUID) -> Experiment:
    experiment = db.scalar(experiments_in_org(org_id).where(Experiment.id == experiment_id))
    if experiment is None:
        raise not_found("Experiment")
    return experiment


def get_sample(db: Session, sample_id: uuid.UUID, org_id: uuid.UUID) -> Sample:
    sample = db.scalar(samples_in_org(org_id).where(Sample.id == sample_id))
    if sample is None:
        raise not_found("Sample")
    return sample
