from tests.conftest import PASSWORD, login


def test_login_returns_token_and_user(client, make_tenant):
    tenant = make_tenant("acme")
    response = client.post("/api/auth/login", json={"email": "ADMIN@acme.example.com", "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "admin@acme.example.com"
    assert body["user"]["org_id"] == str(tenant.org.id)
    assert "hashed_password" not in body["user"]


def test_login_rejects_wrong_password_and_unknown_email(client, make_tenant):
    make_tenant("acme")
    wrong = client.post("/api/auth/login", json={"email": "admin@acme.example.com", "password": "nope"})
    unknown = client.post("/api/auth/login", json={"email": "ghost@acme.example.com", "password": PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Incorrect email or password"}


def test_me_requires_valid_token(client, make_tenant):
    tenant = make_tenant("acme")
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401

    me = client.get("/api/auth/me", headers=login(client, tenant.user.email))
    assert me.status_code == 200
    assert me.json()["id"] == str(tenant.user.id)


def test_organizations_lists_only_own_org(client, make_tenant):
    tenant = make_tenant("acme")
    make_tenant("globex")
    response = client.get("/api/organizations", headers=login(client, tenant.user.email))
    assert response.status_code == 200
    assert [o["slug"] for o in response.json()] == ["acme"]
