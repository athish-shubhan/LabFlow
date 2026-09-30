"""A user in org A must not be able to see or change anything in org B.

Cross-tenant access returns 404 (never 403) so resource IDs from other orgs are
indistinguishable from IDs that don't exist.
"""

import pytest
from sqlalchemy import func, select

from app.models import Experiment, ExperimentStatus, Project, Sample, SampleStatus
from tests.conftest import login


@pytest.fixture
def two_orgs(client, make_tenant):
    org_a = make_tenant("org-a")
    org_b = make_tenant("org-b")
    return org_a, org_b, login(client, org_a.user.email)


def test_cannot_read_or_modify_other_orgs_experiment(client, db, two_orgs):
    _, org_b, headers_a = two_orgs
    exp_b = org_b.experiment.id

    get = client.get(f"/api/experiments/{exp_b}", headers=headers_a)
    patch = client.patch(f"/api/experiments/{exp_b}", headers=headers_a, json={"name": "pwned", "status": "completed"})
    delete = client.delete(f"/api/experiments/{exp_b}", headers=headers_a)

    for response in (get, patch, delete):
        assert response.status_code == 404
        assert response.json() == {"detail": "Experiment not found"}

    db.expire_all()
    untouched = db.get(Experiment, exp_b)
    assert untouched.name == "org-b experiment"
    assert untouched.status == ExperimentStatus.RUNNING


def test_other_orgs_experiment_is_indistinguishable_from_missing(client, two_orgs):
    _, org_b, headers_a = two_orgs
    other_org = client.get(f"/api/experiments/{org_b.experiment.id}", headers=headers_a)
    missing = client.get("/api/experiments/00000000-0000-0000-0000-000000000000", headers=headers_a)
    assert other_org.status_code == missing.status_code == 404
    assert other_org.json() == missing.json()


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("GET", "/api/organizations/{org}/dashboard", None),
        ("GET", "/api/organizations/{org}/projects", None),
        ("POST", "/api/organizations/{org}/projects", {"name": "sneaky"}),
        ("GET", "/api/projects/{project}", None),
        ("GET", "/api/projects/{project}/experiments", None),
        ("POST", "/api/projects/{project}/experiments", {"name": "sneaky"}),
        ("GET", "/api/experiments/{experiment}/samples", None),
        ("POST", "/api/experiments/{experiment}/samples", {"name": "sneaky", "type": "x"}),
        ("GET", "/api/experiments/{experiment}/analytics", None),
        ("GET", "/api/samples/{sample}", None),
        ("PATCH", "/api/samples/{sample}", {"status": "complete"}),
        ("GET", "/api/samples/{sample}/measurements", None),
        (
            "POST",
            "/api/samples/{sample}/measurements",
            {"timestamp": "2026-01-01T00:00:00Z", "metric": "ph", "value": 7.0, "unit": "pH"},
        ),
    ],
)
def test_every_scoped_endpoint_returns_404_across_orgs(client, db, two_orgs, method, path, payload):
    _, org_b, headers_a = two_orgs
    url = path.format(
        org=org_b.org.id, project=org_b.project.id, experiment=org_b.experiment.id, sample=org_b.sample.id
    )
    response = client.request(method, url, headers=headers_a, json=payload)
    assert response.status_code == 404, response.text

    db.expire_all()
    project_b = db.get(Project, org_b.project.id)
    sample_b = db.get(Sample, org_b.sample.id)
    assert db.scalar(select(func.count()).select_from(Project).where(Project.org_id == org_b.org.id)) == 1
    assert project_b.experiment_count == 1
    assert db.get(Experiment, org_b.experiment.id).sample_count == 1
    assert sample_b.status == SampleStatus.PENDING
    assert sample_b.measurement_count == 3


def test_lists_only_contain_own_org_data(client, two_orgs):
    org_a, org_b, headers_a = two_orgs
    projects = client.get(f"/api/organizations/{org_a.org.id}/projects", headers=headers_a).json()
    assert [p["id"] for p in projects] == [str(org_a.project.id)]

    dashboard = client.get(f"/api/organizations/{org_a.org.id}/dashboard", headers=headers_a).json()
    assert dashboard["project_count"] == 1
    assert dashboard["experiment_count"] == 1
    assert dashboard["measurement_count"] == 3
    assert {m["sample_id"] for m in dashboard["recent_measurements"]} == {str(org_a.sample.id)}


def test_cannot_assign_experiment_owner_from_other_org(client, two_orgs):
    org_a, org_b, headers_a = two_orgs
    response = client.patch(
        f"/api/experiments/{org_a.experiment.id}", headers=headers_a, json={"owner_id": str(org_b.user.id)}
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "owner_id"


def test_analytics_rejects_sample_ids_from_other_org(client, two_orgs):
    org_a, org_b, headers_a = two_orgs
    response = client.get(
        f"/api/experiments/{org_a.experiment.id}/analytics",
        headers=headers_a,
        params={"sample_ids": str(org_b.sample.id)},
    )
    assert response.status_code == 422
