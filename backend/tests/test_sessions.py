from datetime import date, datetime, timedelta, timezone

from app.routers.sessions import compute_streak

REP_A = {"score": 90, "rom": 100, "posture": 80, "tempo": 100, "duration_ms": 2000, "min_angle": 85}
REP_B = {"score": 70, "rom": 60, "posture": 100, "tempo": 80, "duration_ms": 1500, "min_angle": 98}


def make_user(client, email="a@example.com") -> dict[str, str]:
    res = client.post("/api/auth/register", json={"name": "A", "email": email, "password": "correct-horse-1"})
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def payload(started_at: datetime | None = None, **overrides):
    started_at = started_at or datetime.now(timezone.utc) - timedelta(minutes=10)
    body = {
        "exercise": "squat",
        "started_at": started_at.isoformat(),
        "duration_sec": 90,
        "reps": [REP_A, REP_B],
    }
    return {**body, **overrides}


def create(client, headers, **kwargs):
    return client.post("/api/sessions", json=payload(**kwargs), headers=headers)


# ---------------------------------------------------------------- creating

def test_create_session_computes_totals_on_the_server(client):
    res = create(client, make_user(client))
    assert res.status_code == 201
    body = res.json()
    assert body["rep_count"] == 2
    assert body["avg_score"] == 80.0
    assert body["avg_rom"] == 80.0
    assert body["avg_posture"] == 90.0
    assert body["avg_tempo"] == 90.0
    assert [r["rep_index"] for r in body["reps"]] == [1, 2]
    assert body["started_at"].endswith("Z")  # labelled as UTC so the browser converts it correctly


def test_create_session_ignores_totals_sent_by_the_client(client):
    res = create(client, make_user(client), rep_count=999, avg_score=100)
    assert res.json()["rep_count"] == 2
    assert res.json()["avg_score"] == 80.0


def test_create_session_validation(client):
    h = make_user(client)
    assert create(client, h, reps=[]).status_code == 422
    assert create(client, h, exercise="deadlift").status_code == 422
    assert create(client, h, reps=[{**REP_A, "score": 101}]).status_code == 422
    assert create(client, h, reps=[{**REP_A, "min_angle": -1}]).status_code == 422
    assert create(client, h, duration_sec=-5).status_code == 422
    assert create(client, h, reps=[REP_A] * 501).status_code == 422


def test_create_session_rejects_start_time_in_the_future(client):
    future = datetime.now(timezone.utc) + timedelta(hours=2)
    assert create(client, make_user(client), started_at=future).status_code == 422


def test_all_session_endpoints_require_login(client):
    assert client.post("/api/sessions", json=payload()).status_code == 401
    assert client.get("/api/sessions").status_code == 401
    assert client.get("/api/sessions/1").status_code == 401
    assert client.delete("/api/sessions/1").status_code == 401
    assert client.get("/api/stats").status_code == 401


# ---------------------------------------------------------------- reading

def test_list_is_newest_first_and_paginated(client):
    h = make_user(client)
    now = datetime.now(timezone.utc)
    for days_ago in (3, 1, 2):
        create(client, h, started_at=now - timedelta(days=days_ago))
    listed = client.get("/api/sessions", headers=h).json()
    starts = [s["started_at"] for s in listed]
    assert starts == sorted(starts, reverse=True) and len(listed) == 3
    assert "reps" not in listed[0]  # list view is a summary

    page = client.get("/api/sessions?limit=1&offset=1", headers=h).json()
    assert len(page) == 1 and page[0]["id"] == listed[1]["id"]
    assert client.get("/api/sessions?limit=0", headers=h).status_code == 422


def test_get_one_session_includes_reps(client):
    h = make_user(client)
    sid = create(client, h).json()["id"]
    detail = client.get(f"/api/sessions/{sid}", headers=h).json()
    assert len(detail["reps"]) == 2 and detail["reps"][0]["score"] == 90


def test_users_cannot_see_or_delete_each_others_sessions(client):
    alice = make_user(client, "alice@example.com")
    bob = make_user(client, "bob@example.com")
    sid = create(client, alice).json()["id"]

    assert client.get(f"/api/sessions/{sid}", headers=bob).status_code == 404
    assert client.delete(f"/api/sessions/{sid}", headers=bob).status_code == 404
    assert client.get("/api/sessions", headers=bob).json() == []
    assert client.get(f"/api/sessions/{sid}", headers=alice).status_code == 200  # still there


def test_delete_session_removes_it_and_its_reps(client):
    h = make_user(client)
    sid = create(client, h).json()["id"]
    assert client.delete(f"/api/sessions/{sid}", headers=h).status_code == 204
    assert client.get(f"/api/sessions/{sid}", headers=h).status_code == 404
    assert client.get("/api/stats", headers=h).json()["total_reps"] == 0


# ---------------------------------------------------------------- stats

def test_stats_for_a_new_user_are_empty(client):
    stats = client.get("/api/stats", headers=make_user(client)).json()
    assert stats == {
        "total_sessions": 0,
        "total_reps": 0,
        "sessions_last_7_days": 0,
        "average_score": None,
        "streak_days": 0,
    }


def test_stats_totals_and_streak(client):
    h = make_user(client)
    now = datetime.now(timezone.utc)
    create(client, h, started_at=now - timedelta(minutes=5))             # today
    create(client, h, started_at=now - timedelta(days=1))                # yesterday
    create(client, h, started_at=now - timedelta(days=3))                # breaks the streak
    create(client, h, started_at=now - timedelta(days=20))               # outside the 7-day window
    stats = client.get("/api/stats", headers=h).json()
    assert stats["total_sessions"] == 4
    assert stats["total_reps"] == 8
    assert stats["sessions_last_7_days"] == 3
    assert stats["average_score"] == 80.0
    assert stats["streak_days"] == 2


def test_stats_only_count_the_current_user(client):
    alice = make_user(client, "alice@example.com")
    bob = make_user(client, "bob@example.com")
    create(client, alice)
    assert client.get("/api/stats", headers=bob).json()["total_sessions"] == 0


def test_stats_apply_the_time_zone_consistently(client):
    h = make_user(client)
    create(client, h, started_at=datetime.now(timezone.utc) - timedelta(minutes=5))
    # A session from 5 minutes ago is "today" in every time zone, so the streak is 1 for all of them.
    for tz_offset in (-720, 0, 180, 840):
        stats = client.get(f"/api/stats?tz_offset={tz_offset}", headers=h).json()
        assert stats["streak_days"] == 1 and stats["sessions_last_7_days"] == 1
    assert client.get("/api/stats?tz_offset=9999", headers=h).status_code == 422


def test_compute_streak():
    today = date(2026, 10, 9)
    day = lambda n: today - timedelta(days=n)  # noqa: E731
    assert compute_streak(set(), today) == 0
    assert compute_streak({day(0)}, today) == 1
    assert compute_streak({day(0), day(1), day(2)}, today) == 3
    assert compute_streak({day(1), day(2)}, today) == 2       # trained yesterday, not yet today
    assert compute_streak({day(2)}, today) == 0               # missed yesterday: streak is over
    assert compute_streak({day(0), day(1), day(3)}, today) == 2  # gap stops the count
