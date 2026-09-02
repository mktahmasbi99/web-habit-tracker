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


def test_api_habit_management_workflow(monkeypatch, tmp_path):
    monkeypatch.setenv("TZ", "Europe/Warsaw")
    monkeypatch.setenv("WEB_HABIT_TRACKER_DB", str(tmp_path / "management.sqlite3"))
    import app.main
    module = importlib.reload(app.main)
    with TestClient(module.app) as client:
        today = client.get("/api/config").json()["today"]
        habit_id = client.post("/api/habits", json={"name": "Read", "startDate": today}).json()["id"]
        assert client.patch(f"/api/habits/{habit_id}", json={"name": "Books"}).json()["name"] == "Books"
        assert client.post(f"/api/habits/{habit_id}/archive").json()["archived"] is True
        assert len(client.get(f"/api/habits/{habit_id}/archive-periods").json()) == 1
        assert client.post(f"/api/habits/{habit_id}/restore").json()["archived"] is False
        deleted = client.request("DELETE", f"/api/habits/{habit_id}", json={"confirmation": "DELETE"})
        assert deleted.status_code == 200
        assert deleted.json()["backup"].startswith("pre-delete-")


def test_api_note_detail_distinguishes_missing_and_existing_notes(monkeypatch, tmp_path):
    monkeypatch.setenv("TZ", "Europe/Warsaw")
    monkeypatch.setenv("WEB_HABIT_TRACKER_DB", str(tmp_path / "notes.sqlite3"))
    import app.main
    module = importlib.reload(app.main)
    with TestClient(module.app) as client:
        today = client.get("/api/config").json()["today"]
        habit_id = client.post("/api/habits", json={"name": "Read", "startDate": today}).json()["id"]
        missing = client.get(f"/api/habits/{habit_id}/days/{today}/note").json()
        assert missing == {"habitId": habit_id, "habitName": "Read", "date": today, "body": "", "exists": False, "archived": False}
        assert client.put(f"/api/habits/{habit_id}/days/{today}/note", json={"body": "A chapter"}).status_code == 204
        existing = client.get(f"/api/habits/{habit_id}/days/{today}/note").json()
        assert existing["body"] == "A chapter"
        assert existing["exists"] is True
