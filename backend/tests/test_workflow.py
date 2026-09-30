from tests.conftest import login


def test_project_to_measurement_happy_path(client, make_tenant):
    tenant = make_tenant("acme")
    headers = login(client, tenant.user.email)
    org_id = tenant.org.id

    project = client.post(
        f"/api/organizations/{org_id}/projects",
        headers=headers,
        json={"name": "  Enzyme Screening  ", "description": "Thermostability screen"},
    )
    assert project.status_code == 201, project.text
    project = project.json()
    assert project["name"] == "Enzyme Screening"
    assert project["experiment_count"] == 0

    experiment = client.post(
        f"/api/projects/{project['id']}/experiments",
        headers=headers,
        json={"name": "Batch 7 thermal ramp", "status": "running", "start_date": "2026-09-01"},
    )
    assert experiment.status_code == 201, experiment.text
    experiment = experiment.json()
    assert experiment["status"] == "running"
    assert experiment["owner"]["id"] == str(tenant.user.id)
    assert experiment["sample_count"] == 0
    assert experiment["end_date"] is None

    sample = client.post(
        f"/api/experiments/{experiment['id']}/samples", headers=headers, json={"name": "B7-S1", "type": "enzyme lysate"}
    )
    assert sample.status_code == 201, sample.text
    sample = sample.json()
    assert sample["status"] == "pending"
    assert sample["measurement_count"] == 0

    created = []
    for i, (metric, value, unit) in enumerate(
        [("temperature", 37.0, "°C"), ("temperature", 37.4, "°C"), ("ph", 7.2, "pH"), ("temperature", 38.1, "°C")]
    ):
        response = client.post(
            f"/api/samples/{sample['id']}/measurements",
            headers=headers,
            json={"timestamp": f"2026-09-01T0{i}:00:00+02:00", "metric": metric, "value": value, "unit": unit},
        )
        assert response.status_code == 201, response.text
        created.append(response.json())
    assert created[0]["timestamp"].startswith("2026-08-31T22:00:00")

    page = client.get(
        f"/api/samples/{sample['id']}/measurements",
        headers=headers,
        params={"metric": "temperature", "page_size": 2},
    ).json()
    assert page["total"] == 3
    assert page["pages"] == 2
    assert [m["value"] for m in page["items"]] == [37.0, 37.4]

    page2 = client.get(
        f"/api/samples/{sample['id']}/measurements",
        headers=headers,
        params={"metric": "temperature", "page_size": 2, "page": 2},
    ).json()
    assert [m["value"] for m in page2["items"]] == [38.1]

    ranged = client.get(
        f"/api/samples/{sample['id']}/measurements",
        headers=headers,
        params={"from": "2026-08-31T23:00:00Z", "to": "2026-09-01T00:30:00Z", "order": "desc"},
    ).json()
    assert [m["metric"] for m in ranged["items"]] == ["ph", "temperature"]

    detail = client.get(f"/api/experiments/{experiment['id']}", headers=headers).json()
    assert detail["sample_count"] == 1
    assert client.get(f"/api/samples/{sample['id']}", headers=headers).json()["measurement_count"] == 4
    assert client.get(f"/api/projects/{project['id']}", headers=headers).json()["experiment_count"] == 1

    completed = client.patch(
        f"/api/experiments/{experiment['id']}", headers=headers, json={"status": "completed", "end_date": "2026-09-02"}
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    assert completed.json()["end_date"] == "2026-09-02"

    archived = client.delete(f"/api/experiments/{experiment['id']}", headers=headers)
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    still_there = client.get(f"/api/experiments/{experiment['id']}", headers=headers)
    assert still_there.status_code == 200
    assert still_there.json()["status"] == "archived"

    only_archived = client.get(
        f"/api/projects/{project['id']}/experiments", headers=headers, params={"status": "archived"}
    ).json()
    assert [e["id"] for e in only_archived] == [experiment["id"]]


def test_dashboard_counts_match_database(client, make_tenant):
    tenant = make_tenant("acme")
    headers = login(client, tenant.user.email)
    client.post(f"/api/projects/{tenant.project.id}/experiments", headers=headers, json={"name": "Planned run"})

    dashboard = client.get(f"/api/organizations/{tenant.org.id}/dashboard", headers=headers)
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["organization"]["slug"] == "acme"
    assert body["project_count"] == 1
    assert body["experiment_count"] == 2
    assert body["active_experiment_count"] == 1
    assert body["experiments_by_status"] == {"planned": 1, "running": 1, "completed": 0, "archived": 0}
    assert body["sample_count"] == 1
    assert body["samples_by_status"] == {"pending": 1, "in_progress": 0, "complete": 0}
    assert body["measurement_count"] == 3
    # Fixture measurements are dated 2026-01-01, well outside the last week.
    assert body["measurements_last_7_days"] == 0
    assert body["recent_experiments"][0]["name"] == "Planned run"
    assert body["recent_experiments"][0]["project_name"] == "acme project"
    assert [m["value"] for m in body["recent_measurements"]] == [22.0, 21.0, 20.0]
