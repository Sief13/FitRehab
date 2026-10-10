from datetime import datetime, timedelta, timezone

DOCTOR_EMAIL = "dr.salma@example.com"
REP_A = {"score": 90, "rom": 100, "posture": 80, "tempo": 100, "duration_ms": 2000, "min_angle": 85}
REP_B = {"score": 70, "rom": 60, "posture": 100, "tempo": 80, "duration_ms": 1500, "min_angle": 98}
PLAN = {
    "title": "Knee recovery",
    "notes": "  Slow and controlled  ",
    "items": [
        {"exercise": "squat", "sets": 3, "reps_per_set": 10, "target_score": 80},
        {"exercise": "bicep_curl", "sets": 2, "reps_per_set": 12, "target_score": 70},
    ],
}


def register(client, email, role="user", name="Test") -> dict[str, str]:
    res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "correct-horse-1", "role": role},
    )
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def connect(client, patient_email="patient@example.com", doctor_email=DOCTOR_EMAIL):
    """Patient requests, physiatrist accepts. Returns (patient_headers, doctor_headers, link_id)."""
    patient = register(client, patient_email, name="Pat Patient")
    doctor = register(client, doctor_email, role="physiatrist", name="Dr Salma")
    link = client.post("/api/rehab/links", json={"physiatrist_email": doctor_email}, headers=patient).json()
    assert client.post(f"/api/rehab/links/{link['id']}/accept", headers=doctor).status_code == 200
    return patient, doctor, link["id"]


def assign(client, doctor, link_id, plan=PLAN):
    return client.post(f"/api/rehab/patients/{link_id}/plans", json=plan, headers=doctor)


def save_session(client, headers, plan_item_id=None, exercise="squat", reps=(REP_A, REP_B)):
    body = {
        "exercise": exercise,
        "started_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
        "duration_sec": 60,
        "reps": list(reps),
        "plan_item_id": plan_item_id,
    }
    return client.post("/api/sessions", json=body, headers=headers)


# ---------------------------------------------------------------- linking

def test_patient_requests_link_and_both_sides_see_it(client):
    patient = register(client, "patient@example.com", name="Pat Patient")
    doctor = register(client, DOCTOR_EMAIL, role="physiatrist", name="Dr Salma")

    res = client.post("/api/rehab/links", json={"physiatrist_email": DOCTOR_EMAIL.upper()}, headers=patient)
    assert res.status_code == 201
    assert res.json()["status"] == "pending"
    assert res.json()["person"]["name"] == "Dr Salma"  # patient sees the doctor

    seen_by_doctor = client.get("/api/rehab/links", headers=doctor).json()
    assert len(seen_by_doctor) == 1
    assert seen_by_doctor[0]["person"]["email"] == "patient@example.com"  # doctor sees the patient
    assert seen_by_doctor[0]["created_at"].endswith("Z")


def test_cannot_link_to_someone_who_is_not_a_physiatrist(client):
    patient = register(client, "patient@example.com")
    register(client, "other.member@example.com")
    assert client.post("/api/rehab/links", json={"physiatrist_email": "other.member@example.com"}, headers=patient).status_code == 404
    assert client.post("/api/rehab/links", json={"physiatrist_email": "nobody@example.com"}, headers=patient).status_code == 404


def test_duplicate_request_is_rejected(client):
    patient, _, _ = connect(client)
    res = client.post("/api/rehab/links", json={"physiatrist_email": DOCTOR_EMAIL}, headers=patient)
    assert res.status_code == 409


def test_physiatrists_cannot_request_links_and_patients_cannot_accept(client):
    patient = register(client, "patient@example.com")
    doctor = register(client, DOCTOR_EMAIL, role="physiatrist")
    assert client.post("/api/rehab/links", json={"physiatrist_email": DOCTOR_EMAIL}, headers=doctor).status_code == 403
    link_id = client.post("/api/rehab/links", json={"physiatrist_email": DOCTOR_EMAIL}, headers=patient).json()["id"]
    assert client.post(f"/api/rehab/links/{link_id}/accept", headers=patient).status_code == 403


def test_only_the_addressed_physiatrist_can_accept(client):
    patient = register(client, "patient@example.com")
    register(client, DOCTOR_EMAIL, role="physiatrist")
    stranger = register(client, "stranger.dr@example.com", role="physiatrist")
    link_id = client.post("/api/rehab/links", json={"physiatrist_email": DOCTOR_EMAIL}, headers=patient).json()["id"]
    assert client.post(f"/api/rehab/links/{link_id}/accept", headers=stranger).status_code == 404


def test_accepting_twice_fails_the_second_time(client):
    _, doctor, link_id = connect(client)
    assert client.post(f"/api/rehab/links/{link_id}/accept", headers=doctor).status_code == 404


def test_either_side_can_end_a_link_but_nobody_else(client):
    patient, doctor, link_id = connect(client)
    stranger = register(client, "stranger@example.com")
    assert client.delete(f"/api/rehab/links/{link_id}", headers=stranger).status_code == 404
    assert client.delete(f"/api/rehab/links/{link_id}", headers=doctor).status_code == 204
    assert client.get("/api/rehab/links", headers=patient).json() == []
    assert client.delete(f"/api/rehab/links/{link_id}", headers=patient).status_code == 404


def test_link_endpoints_require_login(client):
    assert client.get("/api/rehab/links").status_code == 401
    assert client.get("/api/rehab/my-plans").status_code == 401
    assert client.get("/api/rehab/patients/1").status_code == 401


# ---------------------------------------------------------------- plans

def test_physiatrist_assigns_a_plan_and_patient_sees_it(client):
    patient, doctor, link_id = connect(client)
    res = assign(client, doctor, link_id)
    assert res.status_code == 201
    assert res.json()["notes"] == "Slow and controlled"  # whitespace trimmed

    plans = client.get("/api/rehab/my-plans", headers=patient).json()
    assert len(plans) == 1
    plan = plans[0]
    assert plan["title"] == "Knee recovery" and plan["physiatrist"]["name"] == "Dr Salma"
    assert [i["exercise"] for i in plan["items"]] == ["squat", "bicep_curl"]  # order kept
    assert plan["items"][0]["progress"] == {"sessions": 0, "total_reps": 0, "average_score": None, "last_done_at": None}


def test_a_new_plan_replaces_the_current_one(client):
    patient, doctor, link_id = connect(client)
    assign(client, doctor, link_id)
    assign(client, doctor, link_id, {**PLAN, "title": "Phase 2"})
    plans = client.get("/api/rehab/my-plans", headers=patient).json()
    assert [p["title"] for p in plans] == ["Phase 2"]


def test_plan_requires_an_active_link_and_the_right_role(client):
    patient = register(client, "patient@example.com")
    doctor = register(client, DOCTOR_EMAIL, role="physiatrist")
    link_id = client.post("/api/rehab/links", json={"physiatrist_email": DOCTOR_EMAIL}, headers=patient).json()["id"]
    assert assign(client, doctor, link_id).status_code == 404  # still pending
    client.post(f"/api/rehab/links/{link_id}/accept", headers=doctor)
    assert client.post(f"/api/rehab/patients/{link_id}/plans", json=PLAN, headers=patient).status_code == 403
    other_dr = register(client, "other.dr@example.com", role="physiatrist")
    assert assign(client, other_dr, link_id).status_code == 404  # not their patient


def test_plan_validation(client):
    _, doctor, link_id = connect(client)
    item = PLAN["items"][0]
    assert assign(client, doctor, link_id, {**PLAN, "items": []}).status_code == 422
    assert assign(client, doctor, link_id, {**PLAN, "title": "   "}).status_code == 422
    assert assign(client, doctor, link_id, {**PLAN, "items": [{**item, "sets": 0}]}).status_code == 422
    assert assign(client, doctor, link_id, {**PLAN, "items": [{**item, "reps_per_set": 51}]}).status_code == 422
    assert assign(client, doctor, link_id, {**PLAN, "items": [{**item, "exercise": "deadlift"}]}).status_code == 422
    assert assign(client, doctor, link_id, {**PLAN, "items": [{**item, "target_score": 101}]}).status_code == 422


def test_disconnecting_removes_the_plan_but_keeps_the_patients_workouts(client):
    patient, doctor, link_id = connect(client)
    item_id = assign(client, doctor, link_id).json()["items"][0]["id"]
    session_id = save_session(client, patient, plan_item_id=item_id).json()["id"]

    client.delete(f"/api/rehab/links/{link_id}", headers=patient)

    assert client.get("/api/rehab/my-plans", headers=patient).json() == []
    kept = client.get(f"/api/sessions/{session_id}", headers=patient)
    assert kept.status_code == 200 and kept.json()["plan_item_id"] is None


# ---------------------------------------------------------------- workouts done for a plan

def test_workout_for_a_plan_item_updates_progress(client):
    patient, doctor, link_id = connect(client)
    item_id = assign(client, doctor, link_id).json()["items"][0]["id"]

    assert save_session(client, patient, plan_item_id=item_id).status_code == 201
    assert save_session(client, patient, plan_item_id=item_id, reps=(REP_A,)).status_code == 201
    save_session(client, patient)  # a free workout does not count for the plan

    progress = client.get("/api/rehab/my-plans", headers=patient).json()[0]["items"][0]["progress"]
    assert progress["sessions"] == 2
    assert progress["total_reps"] == 3
    assert progress["average_score"] == round((90 + 70 + 90) / 3, 1)
    assert progress["last_done_at"].endswith("Z")
    other_item = client.get("/api/rehab/my-plans", headers=patient).json()[0]["items"][1]["progress"]
    assert other_item["sessions"] == 0


def test_plan_item_must_belong_to_the_user_and_match_the_exercise(client):
    patient, doctor, link_id = connect(client)
    item_id = assign(client, doctor, link_id).json()["items"][0]["id"]  # a squat item

    assert save_session(client, patient, plan_item_id=item_id, exercise="bicep_curl").status_code == 422
    assert save_session(client, patient, plan_item_id=99999).status_code == 422

    other_patient = register(client, "someone.else@example.com")
    assert save_session(client, other_patient, plan_item_id=item_id).status_code == 422


def test_replaced_plan_items_can_no_longer_be_used(client):
    patient, doctor, link_id = connect(client)
    old_item = assign(client, doctor, link_id).json()["items"][0]["id"]
    assign(client, doctor, link_id, {**PLAN, "title": "Phase 2"})
    assert save_session(client, patient, plan_item_id=old_item).status_code == 422


# ---------------------------------------------------------------- physiatrist's view of a patient

def test_physiatrist_overview_shows_plan_progress_stats_and_sessions(client):
    patient, doctor, link_id = connect(client)
    item_id = assign(client, doctor, link_id).json()["items"][0]["id"]
    save_session(client, patient, plan_item_id=item_id)
    save_session(client, patient)  # free workout: also visible to a connected physiatrist

    overview = client.get(f"/api/rehab/patients/{link_id}?tz_offset=120", headers=doctor).json()
    assert overview["link"]["person"]["email"] == "patient@example.com"
    assert overview["stats"]["total_sessions"] == 2 and overview["stats"]["total_reps"] == 4
    assert overview["plan"]["items"][0]["progress"]["sessions"] == 1
    assert len(overview["sessions"]) == 2
    assert {s["plan_item_id"] for s in overview["sessions"]} == {item_id, None}


def test_overview_without_a_plan(client):
    _, doctor, link_id = connect(client)
    assert client.get(f"/api/rehab/patients/{link_id}", headers=doctor).json()["plan"] is None


def test_physiatrist_cannot_see_patients_they_are_not_connected_to(client):
    patient = register(client, "patient@example.com")
    doctor = register(client, DOCTOR_EMAIL, role="physiatrist")
    other_dr = register(client, "other.dr@example.com", role="physiatrist")
    link_id = client.post("/api/rehab/links", json={"physiatrist_email": DOCTOR_EMAIL}, headers=patient).json()["id"]

    # pending: not even the addressed physiatrist can see anything yet
    assert client.get(f"/api/rehab/patients/{link_id}", headers=doctor).status_code == 404
    client.post(f"/api/rehab/links/{link_id}/accept", headers=doctor)
    assert client.get(f"/api/rehab/patients/{link_id}", headers=doctor).status_code == 200
    assert client.get(f"/api/rehab/patients/{link_id}", headers=other_dr).status_code == 404
    assert client.get(f"/api/rehab/patients/{link_id}", headers=patient).status_code == 403  # wrong role


def test_access_ends_immediately_when_the_patient_disconnects(client):
    patient, doctor, link_id = connect(client)
    session_id = save_session(client, patient).json()["id"]
    assert client.get(f"/api/rehab/patients/{link_id}/sessions/{session_id}", headers=doctor).status_code == 200
    client.delete(f"/api/rehab/links/{link_id}", headers=patient)
    assert client.get(f"/api/rehab/patients/{link_id}", headers=doctor).status_code == 404
    assert client.get(f"/api/rehab/patients/{link_id}/sessions/{session_id}", headers=doctor).status_code == 404


def test_physiatrist_can_open_a_session_with_its_reps_but_only_the_patients_own(client):
    patient, doctor, link_id = connect(client)
    session_id = save_session(client, patient).json()["id"]
    detail = client.get(f"/api/rehab/patients/{link_id}/sessions/{session_id}", headers=doctor).json()
    assert [r["rep_index"] for r in detail["reps"]] == [1, 2] and detail["reps"][0]["score"] == 90

    stranger = register(client, "stranger@example.com")
    foreign_id = save_session(client, stranger).json()["id"]
    assert client.get(f"/api/rehab/patients/{link_id}/sessions/{foreign_id}", headers=doctor).status_code == 404
