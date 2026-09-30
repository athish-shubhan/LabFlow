import pytest

from tests.conftest import login


@pytest.fixture
def tenant_headers(client, make_tenant):
    tenant = make_tenant("acme")
    return tenant, login(client, tenant.user.email)


def test_invalid_experiment_status_is_rejected(client, tenant_headers):
    tenant, headers = tenant_headers
    response = client.post(
        f"/api/projects/{tenant.project.id}/experiments", headers=headers, json={"name": "X", "status": "exploded"}
    )
    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "Request validation failed"
    [error] = body["errors"]
    assert error["location"] == "body"
    assert error["field"] == "status"
    assert "planned" in error["message"] and "archived" in error["message"]


def test_patch_with_invalid_status_is_rejected(client, tenant_headers):
    tenant, headers = tenant_headers
    response = client.patch(f"/api/experiments/{tenant.experiment.id}", headers=headers, json={"status": "done"})
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "status"


def test_end_date_before_start_date_is_rejected(client, tenant_headers):
    tenant, headers = tenant_headers
    create = client.post(
        f"/api/projects/{tenant.project.id}/experiments",
        headers=headers,
        json={"name": "X", "start_date": "2026-03-01", "end_date": "2026-02-01"},
    )
    assert create.status_code == 422
    assert "end_date must be on or after start_date" in create.json()["errors"][0]["message"]

    # Fixture experiment starts 2026-01-01; PATCH validates against the stored start date.
    patch = client.patch(f"/api/experiments/{tenant.experiment.id}", headers=headers, json={"end_date": "2025-12-31"})
    assert patch.status_code == 422
    assert patch.json()["errors"][0]["field"] == "end_date"


def test_experiment_name_cannot_be_blank_or_null(client, tenant_headers):
    tenant, headers = tenant_headers
    blank = client.post(f"/api/projects/{tenant.project.id}/experiments", headers=headers, json={"name": "   "})
    null = client.patch(f"/api/experiments/{tenant.experiment.id}", headers=headers, json={"name": None})
    assert blank.status_code == null.status_code == 422


def test_unknown_fields_are_rejected(client, tenant_headers):
    tenant, headers = tenant_headers
    response = client.post(
        f"/api/projects/{tenant.project.id}/experiments", headers=headers, json={"name": "X", "project_id": "abc"}
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "project_id"


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"timestamp": "2026-01-01T00:00:00Z", "metric": "ph", "value": "high", "unit": "pH"}, "value"),
        ({"timestamp": "2026-01-01T00:00:00Z", "metric": "ph", "value": "NaN", "unit": "pH"}, "value"),
        ({"timestamp": "2026-01-01T00:00:00", "metric": "ph", "value": 7.1, "unit": "pH"}, "timestamp"),
        ({"timestamp": "yesterday", "metric": "ph", "value": 7.1, "unit": "pH"}, "timestamp"),
        ({"timestamp": "2026-01-01T00:00:00Z", "metric": "p H!", "value": 7.1, "unit": "pH"}, "metric"),
        ({"timestamp": "2026-01-01T00:00:00Z", "metric": "ph", "value": 7.1}, "unit"),
    ],
)
def test_invalid_measurement_is_rejected(client, tenant_headers, payload, field):
    tenant, headers = tenant_headers
    response = client.post(f"/api/samples/{tenant.sample.id}/measurements", headers=headers, json=payload)
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == field


def test_measurement_query_validation(client, tenant_headers):
    tenant, headers = tenant_headers
    url = f"/api/samples/{tenant.sample.id}/measurements"
    reversed_range = client.get(
        url, headers=headers, params={"from": "2026-02-01T00:00:00Z", "to": "2026-01-01T00:00:00Z"}
    )
    assert reversed_range.status_code == 422
    assert reversed_range.json()["errors"][0] == {
        "location": "query",
        "field": "from",
        "message": "'from' must be before 'to'",
    }
    assert client.get(url, headers=headers, params={"page_size": 10_000}).status_code == 422
    assert client.get(url, headers=headers, params={"page": 0}).status_code == 422


def test_malformed_ids_are_422_not_500(client, tenant_headers):
    tenant, headers = tenant_headers
    assert client.get("/api/experiments/not-a-uuid", headers=headers).status_code == 422
    bad_ids = client.get(
        f"/api/experiments/{tenant.experiment.id}/analytics", headers=headers, params={"sample_ids": "abc,def"}
    )
    assert bad_ids.status_code == 422
    assert bad_ids.json()["errors"][0]["field"] == "sample_ids"
