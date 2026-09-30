from datetime import UTC, datetime, timedelta

import pytest

from app.models import Measurement, Sample
from tests.conftest import login

T0 = datetime(2026, 5, 1, tzinfo=UTC)


@pytest.fixture
def experiment_with_series(db, make_tenant):
    tenant = make_tenant("acme")
    s1, s2 = tenant.sample, Sample(experiment_id=tenant.experiment.id, name="acme sample 2", type="buffer")
    db.add(s2)
    db.flush()
    # s1 already has temperature 20/21/22 at 2026-01-01 00:00-02:00.
    db.add_all(
        [
            Measurement(sample_id=s1.id, timestamp=T0 + timedelta(hours=i), metric="yield", value=v, unit="%")
            for i, v in enumerate([10.0, 30.0, 50.0])
        ]
        + [
            Measurement(sample_id=s2.id, timestamp=T0 + timedelta(hours=i), metric="yield", value=v, unit="%")
            for i, v in enumerate([5.0, 15.0])
        ]
    )
    db.commit()
    return tenant, s1, s2


def test_analytics_groups_by_sample_and_metric(client, experiment_with_series):
    tenant, s1, s2 = experiment_with_series
    headers = login(client, tenant.user.email)
    response = client.get(f"/api/experiments/{tenant.experiment.id}/analytics", headers=headers)
    assert response.status_code == 200
    body = response.json()

    assert body["experiment_id"] == str(tenant.experiment.id)
    assert body["available_metrics"] == ["temperature", "yield"]
    keys = [(s["sample_name"], s["metric"]) for s in body["series"]]
    assert keys == [("acme sample", "temperature"), ("acme sample", "yield"), ("acme sample 2", "yield")]

    s1_yield = body["series"][1]
    assert s1_yield["sample_id"] == str(s1.id)
    assert s1_yield["unit"] == "%"
    assert s1_yield["stats"] == {"count": 3, "min": 10.0, "max": 50.0, "mean": 30.0}
    assert [p["value"] for p in s1_yield["points"]] == [10.0, 30.0, 50.0]
    timestamps = [p["timestamp"] for p in s1_yield["points"]]
    assert timestamps == sorted(timestamps)
    assert set(s1_yield["points"][0]) == {"timestamp", "value"}


def test_analytics_filters(client, experiment_with_series):
    tenant, s1, s2 = experiment_with_series
    headers = login(client, tenant.user.email)
    url = f"/api/experiments/{tenant.experiment.id}/analytics"

    by_metric = client.get(url, headers=headers, params={"metric": "yield"}).json()
    assert [s["sample_name"] for s in by_metric["series"]] == ["acme sample", "acme sample 2"]
    assert by_metric["available_metrics"] == ["temperature", "yield"]

    by_sample = client.get(url, headers=headers, params={"sample_ids": str(s2.id)}).json()
    assert [(s["sample_id"], s["metric"]) for s in by_sample["series"]] == [(str(s2.id), "yield")]

    both = client.get(url, headers=headers, params={"sample_ids": f"{s1.id},{s2.id}", "metric": "yield"}).json()
    assert len(both["series"]) == 2

    windowed = client.get(
        url,
        headers=headers,
        params={
            "metric": "yield",
            "from": (T0 + timedelta(minutes=30)).isoformat(),
            "to": (T0 + timedelta(hours=1)).isoformat(),
        },
    ).json()
    assert [(s["sample_name"], [p["value"] for p in s["points"]]) for s in windowed["series"]] == [
        ("acme sample", [30.0]),
        ("acme sample 2", [15.0]),
    ]

    empty = client.get(url, headers=headers, params={"metric": "pressure"}).json()
    assert empty["series"] == []
