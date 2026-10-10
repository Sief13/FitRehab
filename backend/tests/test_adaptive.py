from datetime import datetime, timedelta, timezone

from app.adaptive import (
    ExerciseStats,
    GOOD_FORM_FROM,
    build_monthly_plan,
    collect_exercise_stats,
    weakest_area,
)

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)


def stats(exercise="squat", sessions=3, reps=30, score=80.0, rom=80.0, posture=80.0, tempo=80.0):
    return ExerciseStats(exercise, sessions, reps, score, rom, posture, tempo)


def day(plan, week, name):
    return next(d for d in plan.weeks[week - 1].days if d.day == name)


def item(plan, week, name, exercise):
    return next(i for i in day(plan, week, name).items if i.exercise == exercise)


# ---------------------------------------------------------------- shape

def test_plan_always_has_four_weeks_of_seven_days():
    plan = build_monthly_plan({}, NOW)
    assert [w.week for w in plan.weeks] == [1, 2, 3, 4]
    assert all([d.day for d in w.days] == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] for w in plan.weeks)
    assert [w.title for w in plan.weeks] == ["Foundation", "Build", "Push", "Recovery"]


def test_training_days_and_rest_days():
    plan = build_monthly_plan({}, NOW)
    week1 = {d.day: [i.exercise for i in d.items] for d in plan.weeks[0].days}
    assert week1 == {
        "Mon": ["squat"], "Tue": [], "Wed": ["bicep_curl"], "Thu": [],
        "Fri": ["squat", "bicep_curl"], "Sat": [], "Sun": [],
    }


# ---------------------------------------------------------------- no history

def test_user_without_workouts_gets_a_beginner_plan():
    plan = build_monthly_plan({}, NOW)
    assert plan.based_on_sessions == 0
    first = item(plan, 1, "Mon", "squat")
    assert (first.sets, first.reps_per_set, first.target_score) == (3, 8, 70)
    assert "Technique" in first.focus
    assert item(plan, 3, "Mon", "squat").reps_per_set == 8  # no progression without data
    assert all("beginner" in i.message for i in plan.insights)
    assert all(not any(d.items for d in w.days if d.day == "Thu") for w in plan.weeks)  # no extra day


# ---------------------------------------------------------------- adaptation

def test_good_form_gets_progressive_overload_and_a_recovery_week():
    plan = build_monthly_plan({"squat": stats(score=90, rom=90, posture=92, tempo=88, sessions=2, reps=60)}, NOW)
    reps = [item(plan, w, "Mon", "squat").reps_per_set for w in (1, 2, 3, 4)]
    sets = [item(plan, w, "Mon", "squat").sets for w in (1, 2, 3, 4)]
    assert reps == [10, 11, 12, 10]  # +1 each week, back to base in the recovery week
    assert sets == [3, 3, 3, 2]  # one set fewer in week 4
    assert item(plan, 1, "Mon", "squat").target_score == 95
    assert "balanced" in plan.insights[0].message


def test_struggling_form_gets_no_extra_volume():
    plan = build_monthly_plan({"squat": stats(score=55, rom=55, posture=70, tempo=60, sessions=2, reps=60)}, NOW)
    reps = [item(plan, w, "Mon", "squat").reps_per_set for w in (1, 2, 3)]
    assert reps == [10, 10, 10]
    assert item(plan, 1, "Mon", "squat").target_score == 60
    assert plan.weeks[2].title == "Consolidate"
    assert "below 65" in plan.insights[0].message


def test_target_is_five_points_above_the_current_average_within_limits():
    assert item(build_monthly_plan({"squat": stats(score=78)}, NOW), 1, "Mon", "squat").target_score == 83
    assert item(build_monthly_plan({"squat": stats(score=99)}, NOW), 1, "Mon", "squat").target_score == 95


def test_volume_starts_from_what_the_user_actually_does():
    few = build_monthly_plan({"squat": stats(sessions=3, reps=9)}, NOW)    # 3 reps per workout
    many = build_monthly_plan({"squat": stats(sessions=2, reps=120)}, NOW)  # 60 reps per workout
    assert item(few, 1, "Mon", "squat").reps_per_set == 6    # floor
    assert item(many, 1, "Mon", "squat").reps_per_set == 12  # ceiling


def test_weakest_area_decides_the_focus():
    assert weakest_area(stats(rom=60, posture=90, tempo=90)) == "rom"
    assert weakest_area(stats(rom=90, posture=60, tempo=90)) == "posture"
    assert weakest_area(stats(rom=90, posture=90, tempo=60)) == "tempo"
    assert weakest_area(stats(rom=GOOD_FORM_FROM, posture=95, tempo=95)) is None

    plan = build_monthly_plan({"squat": stats(rom=90, posture=60, tempo=90, score=80)}, NOW)
    assert "chest up" in item(plan, 1, "Mon", "squat").focus
    assert "posture" in plan.insights[0].message


def test_weaker_exercise_gets_an_extra_technique_day_in_weeks_one_to_three():
    plan = build_monthly_plan({"squat": stats(score=88), "bicep_curl": stats("bicep_curl", score=70)}, NOW)
    for week in (1, 2, 3):
        thursday = day(plan, week, "Thu").items
        assert len(thursday) == 1 and thursday[0].exercise == "bicep_curl"
        assert thursday[0].sets == 2 and thursday[0].focus.startswith("Extra practice")
    assert day(plan, 4, "Thu").items == []  # recovery week stays light


def test_no_extra_day_when_everything_is_good():
    plan = build_monthly_plan({"squat": stats(score=90), "bicep_curl": stats("bicep_curl", score=88)}, NOW)
    assert all(day(plan, w, "Thu").items == [] for w in (1, 2, 3, 4))


# ---------------------------------------------------------------- reading the database

def _session(client, headers, exercise, days_ago, score, reps=2):
    rep = {"score": score, "rom": score, "posture": score, "tempo": score, "duration_ms": 2000, "min_angle": 90}
    return client.post(
        "/api/sessions",
        json={
            "exercise": exercise,
            "started_at": (datetime.now(timezone.utc) - timedelta(days=days_ago, minutes=5)).isoformat(),
            "duration_sec": 60,
            "reps": [rep] * reps,
        },
        headers=headers,
    )


def _premium(client, email="member@example.com"):
    res = client.post("/api/auth/register", json={"name": "M", "email": email, "password": "correct-horse-1"})
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    client.post("/api/dev/set-role", json={"role": "premium"}, headers=headers)
    return headers


def test_endpoint_is_premium_only(client):
    res = client.post("/api/auth/register", json={"name": "F", "email": "free@example.com", "password": "correct-horse-1"})
    free = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert client.get("/api/plans/monthly", headers=free).status_code == 403
    assert client.get("/api/plans/monthly").status_code == 401


def test_plan_uses_only_the_last_30_days_of_the_users_own_workouts(client):
    h = _premium(client)
    _session(client, h, "squat", days_ago=2, score=90)
    _session(client, h, "squat", days_ago=5, score=70)
    _session(client, h, "squat", days_ago=45, score=10)  # too old: ignored
    other = _premium(client, "other@example.com")
    _session(client, other, "bicep_curl", days_ago=1, score=20)  # someone else's data: ignored

    plan = client.get("/api/plans/monthly", headers=h).json()
    assert plan["based_on_sessions"] == 2 and plan["window_days"] == 30
    assert plan["generated_at"].endswith("Z")
    squat_insight = next(i for i in plan["insights"] if i["exercise"] == "squat")
    assert "80/100" in squat_insight["message"]  # (90 + 70) / 2, weighted by reps
    curl_insight = next(i for i in plan["insights"] if i["exercise"] == "bicep_curl")
    assert "beginner" in curl_insight["message"]


def test_collect_stats_is_weighted_by_rep_count(client):
    h = _premium(client)
    _session(client, h, "squat", days_ago=1, score=100, reps=1)
    _session(client, h, "squat", days_ago=1, score=70, reps=3)
    from app.database import get_db
    from app.main import app
    from sqlalchemy import select
    from app.models import User

    db = next(app.dependency_overrides[get_db]())
    try:
        user = db.scalar(select(User).where(User.email == "member@example.com"))
        result = collect_exercise_stats(db, user.id, datetime.now(timezone.utc))
    finally:
        db.close()
    assert result["squat"].sessions == 2 and result["squat"].reps == 4
    assert result["squat"].avg_score == (100 * 1 + 70 * 3) / 4
