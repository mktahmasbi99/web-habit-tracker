import importlib

from fastapi.testclient import TestClient


def test_api_workflow(monkeypatch, tmp_path):
    monkeypatch.setenv("TZ", "Europe/Warsaw")
    monkeypatch.setenv("WEB_HABIT_TRACKER_DB", str(tmp_path / "api.sqlite3"))
    import app.main
    module = importlib.reload(app.main)
    client = TestClient(module.app)

    config = client.get("/api/config")
    assert config.status_code == 200
    today = config.json()["today"]

    created = client.post("/api/habits", json={"name": "Read", "startDate": today})
    assert created.status_code == 201
    habit_id = created.json()["id"]
    response = client.put(
        f"/api/habits/{habit_id}/days/{today}/status", json={"status": "done"}
    )
    assert response.status_code == 204
    assert client.get(f"/api/days/{today}/habits").json()[0]["status"] == "done"


def test_api_returns_consistent_domain_error(monkeypatch, tmp_path):
    monkeypatch.setenv("WEB_HABIT_TRACKER_DB", str(tmp_path / "errors.sqlite3"))
    import app.main
    module = importlib.reload(app.main)
    client = TestClient(module.app)
    response = client.post("/api/habits", json={"name": "  ", "startDate": "2026-01-01"})
    assert response.status_code == 400
    assert response.json() == {"detail": "Habit names cannot be empty."}

