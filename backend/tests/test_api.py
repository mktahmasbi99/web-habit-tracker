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


def test_api_creates_and_lists_downloadable_backup(monkeypatch, tmp_path):
    monkeypatch.setenv("TZ", "Europe/Warsaw")
    monkeypatch.setenv("WEB_HABIT_TRACKER_DB", str(tmp_path / "backups.sqlite3"))
    import app.main
    module = importlib.reload(app.main)
    with TestClient(module.app) as client:
        response = client.post("/api/backups")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/vnd.sqlite3"
        backups = client.get("/api/backups").json()
        assert backups[0]["category"] == "on-demand"
        assert client.get(f"/api/backups/{backups[0]['filename']}/download").status_code == 200


def test_api_updates_backup_schedule(monkeypatch, tmp_path):
    monkeypatch.setenv("WEB_HABIT_TRACKER_DB", str(tmp_path / "settings.sqlite3"))
    import app.main
    module = importlib.reload(app.main)
    payload = module.database.backup_settings()
    payload.update({"dailyTime": "03:15", "weeklyDay": 2})
    with TestClient(module.app) as client:
        response = client.put("/api/backups/settings", json=payload)
        assert response.status_code == 200
        assert response.json()["dailyTime"] == "03:15"
        assert response.json()["weeklyDay"] == 2
