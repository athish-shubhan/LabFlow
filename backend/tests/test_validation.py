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


# Valid ISO 8601 with an offset, but outside year 1-9999 once converted to UTC.
UTC_OVERFLOW = ["9999-12-31T23:59:59-14:00", "0001-01-01T00:00:00+10:00"]


@pytest.mark.parametrize("timestamp", UTC_OVERFLOW)
def test_measurement_timestamp_must_fit_in_utc(client, tenant_headers, timestamp):
    tenant, headers = tenant_headers
    payload = {"timestamp": timestamp, "metric": "ph", "value": 7.1, "unit": "pH"}
    response = client.post(f"/api/samples/{tenant.sample.id}/measurements", headers=headers, json=payload)
    assert response.status_code == 422
    assert response.json()["errors"][0] == {
        "location": "body",
        "field": "timestamp",
        "message": "timestamp is out of range once converted to UTC",
    }


def test_rejected_timestamp_leaves_reads_working(client, tenant_headers):
    # Such a row used to be stored before the read-back failed, after which the sample's
    # measurement list, the experiment's analytics and the org dashboard all returned 500.
    tenant, headers = tenant_headers
    payload = {"timestamp": UTC_OVERFLOW[0], "metric": "ph", "value": 7.1, "unit": "pH"}
    client.post(f"/api/samples/{tenant.sample.id}/measurements", headers=headers, json=payload)
    measurements = client.get(f"/api/samples/{tenant.sample.id}/measurements", headers=headers)
    assert measurements.status_code == 200 and measurements.json()["total"] == 3
    assert client.get(f"/api/experiments/{tenant.experiment.id}/analytics", headers=headers).status_code == 200
    assert client.get(f"/api/organizations/{tenant.org.id}/dashboard", headers=headers).status_code == 200


@pytest.mark.parametrize("param", ["from", "to"])
@pytest.mark.parametrize("timestamp", UTC_OVERFLOW)
def test_date_filters_must_fit_in_utc(client, tenant_headers, param, timestamp):
    tenant, headers = tenant_headers
    for url in (
        f"/api/samples/{tenant.sample.id}/measurements",
        f"/api/experiments/{tenant.experiment.id}/analytics",
    ):
        response = client.get(url, headers=headers, params={param: timestamp})
        assert response.status_code == 422, url
        assert response.json()["errors"][0]["field"] == param


def test_edge_of_range_timestamps_are_accepted(client, tenant_headers):
    tenant, headers = tenant_headers
    url = f"/api/samples/{tenant.sample.id}/measurements"
    for timestamp in ("9999-12-31T23:59:59Z", "0001-01-01T00:00:00Z"):
        payload = {"timestamp": timestamp, "metric": "ph", "value": 7.1, "unit": "pH"}
        assert client.post(url, headers=headers, json=payload).status_code == 201
    assert client.get(url, headers=headers).json()["total"] == 5


def test_page_number_too_large_is_422_not_500(client, tenant_headers):
    tenant, headers = tenant_headers
    url = f"/api/samples/{tenant.sample.id}/measurements"
    assert client.get(url, headers=headers, params={"page": 10**20}).status_code == 422
    assert client.get(url, headers=headers, params={"page": 2**62, "page_size": 500}).status_code == 422
    last = client.get(url, headers=headers, params={"page": 1_000_000, "page_size": 500})
    assert last.status_code == 200 and last.json()["items"] == []
