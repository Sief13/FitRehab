"""The Premium adaptive plan.

It is deliberately rule-based, not a black box, so every decision can be explained to the
user (and in your report). The plan is built from the user's own workouts of the last 30 days:

  * volume starts from what the user actually does per workout;
  * volume grows week by week ("progressive overload"), except when form is poor;
  * week 4 is a lighter recovery week;
  * the weakest form area (depth, posture or tempo) decides the coaching focus;
  * the weaker exercise gets one extra technique day in weeks 1-3.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import WorkoutSession
from app.schemas import (
    MonthlyPlanDay,
    MonthlyPlanExercise,
    MonthlyPlanInsight,
    MonthlyPlanOut,
    MonthlyPlanWeek,
)
from app.timeutil import as_utc

EXERCISES = ("squat", "bicep_curl")
LABELS = {"squat": "Squat", "bicep_curl": "Bicep curl"}
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
AREA_LABELS = {"rom": "depth / range of motion", "posture": "posture", "tempo": "tempo"}

FOCUS = {
    "rom": {
        "squat": "Depth: lower until your thighs are parallel to the floor.",
        "bicep_curl": "Range: curl all the way up and lower fully.",
    },
    "posture": {
        "squat": "Posture: keep your chest up and your back straight.",
        "bicep_curl": "Posture: keep your elbow pinned to your side.",
    },
    "tempo": {
        "squat": "Tempo: take about 3 seconds to lower, then stand up smoothly.",
        "bicep_curl": "Tempo: lift and lower slowly, without swinging.",
    },
}
BALANCED_FOCUS = "Form: keep every rep as clean as the last one."
BEGINNER_FOCUS = "Technique: move slowly and learn the movement."

STRUGGLING_BELOW = 65  # average score under this: no extra volume until form improves
GOOD_FORM_FROM = 85  # a form area at or above this is not considered a weakness
TRAINING_DAYS = {0: ("squat",), 2: ("bicep_curl",), 4: ("squat", "bicep_curl")}  # Mon, Wed, Fri
EXTRA_DAY = 3  # Thursday: technique practice for the weaker exercise


@dataclass(frozen=True)
class ExerciseStats:
    """What the user's recent workouts of one exercise look like (rep-weighted averages)."""

    exercise: str
    sessions: int
    reps: int
    avg_score: float
    avg_rom: float
    avg_posture: float
    avg_tempo: float

    @property
    def reps_per_session(self) -> float:
        return self.reps / self.sessions


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def weakest_area(stats: ExerciseStats) -> str | None:
    """'rom', 'posture' or 'tempo', or None when all three are good."""
    areas = {"rom": stats.avg_rom, "posture": stats.avg_posture, "tempo": stats.avg_tempo}
    area = min(areas, key=areas.__getitem__)
    return area if areas[area] < GOOD_FORM_FROM else None


def _is_struggling(stats: ExerciseStats | None) -> bool:
    return stats is not None and stats.avg_score < STRUGGLING_BELOW


def _base_prescription(stats: ExerciseStats | None) -> tuple[int, int]:
    """(sets, reps per set) for week 1."""
    if stats is None:
        return 3, 8  # beginner start
    total_reps = _clamp(round(stats.reps_per_session), 8, 40)
    return 3, _clamp(round(total_reps / 3), 6, 12)


def _week_prescription(stats: ExerciseStats | None, week: int) -> tuple[int, int]:
    sets, reps = _base_prescription(stats)
    if week == 4:  # recovery week: one set fewer
        return max(2, sets - 1), reps
    if stats is None or _is_struggling(stats):
        return sets, reps  # no progression yet
    return sets, min(15, reps + (week - 1))  # +1 rep per set each week


def _target_score(stats: ExerciseStats | None) -> int:
    if stats is None:
        return 70
    return _clamp(round(stats.avg_score) + 5, 60, 95)


def _focus(exercise: str, stats: ExerciseStats | None) -> str:
    if stats is None:
        return BEGINNER_FOCUS
    area = weakest_area(stats)
    return FOCUS[area][exercise] if area else BALANCED_FOCUS


def _insight(exercise: str, stats: ExerciseStats | None) -> MonthlyPlanInsight:
    label = LABELS[exercise]
    if stats is None:
        return MonthlyPlanInsight(
            exercise=exercise,
            message=f"No {label.lower()} workouts in the last 30 days, so this plan starts at a beginner level.",
        )
    area = weakest_area(stats)
    values = {"rom": stats.avg_rom, "posture": stats.avg_posture, "tempo": stats.avg_tempo}
    text = f"{label}: average score {round(stats.avg_score)}/100 over {stats.sessions} workout(s). "
    text += (
        f"Weakest area: {AREA_LABELS[area]} ({round(values[area])}/100)."
        if area
        else "Your form is balanced, so the plan adds volume gradually."
    )
    if _is_struggling(stats):
        text += " Your score is below 65, so there is no extra volume until your form improves."
    return MonthlyPlanInsight(exercise=exercise, message=text)


def build_monthly_plan(
    stats_by_exercise: dict[str, ExerciseStats], now: datetime, window_days: int = 30
) -> MonthlyPlanOut:
    stats = {e: stats_by_exercise.get(e) for e in EXERCISES}

    # The exercise with the lowest score (if below "good") gets an extra technique day.
    weaker_candidates = [e for e in EXERCISES if stats[e] is not None and stats[e].avg_score < GOOD_FORM_FROM]
    weaker = min(weaker_candidates, key=lambda e: stats[e].avg_score) if weaker_candidates else None

    def exercise_item(exercise: str, week: int, technique_day: bool = False) -> MonthlyPlanExercise:
        sets, reps = _week_prescription(stats[exercise], week)
        focus = _focus(exercise, stats[exercise])
        if technique_day:
            sets, focus = 2, f"Extra practice. {focus}"
        return MonthlyPlanExercise(
            exercise=exercise,
            sets=sets,
            reps_per_set=reps,
            target_score=_target_score(stats[exercise]),
            focus=focus,
        )

    any_struggling = any(_is_struggling(s) for s in stats.values())
    titles = {1: "Foundation", 2: "Build", 3: "Consolidate" if any_struggling else "Push", 4: "Recovery"}

    weeks = []
    for week in range(1, 5):
        days = []
        for index, name in enumerate(WEEKDAYS):
            items = [exercise_item(e, week) for e in TRAINING_DAYS.get(index, ())]
            if index == EXTRA_DAY and weaker is not None and week < 4:
                items = [exercise_item(weaker, week, technique_day=True)]
            days.append(MonthlyPlanDay(day=name, items=items))
        weeks.append(MonthlyPlanWeek(week=week, title=titles[week], days=days))

    return MonthlyPlanOut(
        generated_at=now,
        window_days=window_days,
        based_on_sessions=sum(s.sessions for s in stats.values() if s is not None),
        insights=[_insight(e, stats[e]) for e in EXERCISES],
        weeks=weeks,
    )


def collect_exercise_stats(
    db: Session, user_id: int, now: datetime, window_days: int = 30
) -> dict[str, ExerciseStats]:
    """Summarises the user's workouts of the last `window_days` days, per exercise."""
    since = now - timedelta(days=window_days)
    sessions = db.scalars(
        select(WorkoutSession).where(WorkoutSession.user_id == user_id, WorkoutSession.started_at >= since)
    )

    grouped: dict[str, list[WorkoutSession]] = {}
    for s in sessions:
        if as_utc(s.started_at) >= since:
            grouped.setdefault(s.exercise, []).append(s)

    result = {}
    for exercise, rows in grouped.items():
        reps = sum(s.rep_count for s in rows)

        def weighted(field: str) -> float:
            return sum(getattr(s, field) * s.rep_count for s in rows) / reps

        result[exercise] = ExerciseStats(
            exercise=exercise,
            sessions=len(rows),
            reps=reps,
            avg_score=weighted("avg_score"),
            avg_rom=weighted("avg_rom"),
            avg_posture=weighted("avg_posture"),
            avg_tempo=weighted("avg_tempo"),
        )
    return result
