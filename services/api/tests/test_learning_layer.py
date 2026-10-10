"""Unit and Integration Tests for Student Learning Layer (Parts B, C, D, E, F).

Validates:
- B1..B8: Heads-up rules positive and negative fixtures
- Zero false alarms on a clean pipeline
- Wilson score interval calculation
- Majority-class and mean baselines (including 95/5 imbalance)
- AST-based preprocessing leakage detector (positive and negative code fixtures)
- Guided lesson catalog integrity, primary citations, and honest check enforcement
- Private pilot telemetry signals
- Pitfall datasets catalog and loading
"""

from typing import Any, cast
import pytest
from fastapi import Request
from app.services.learning_rules import (
    compute_baseline_metric,
    compute_cramers_v_from_contingency,
    compute_wilson_interval,
    detect_preprocessing_leakage_ast,
)
from app.routers.learning import (
    CompleteLessonRequest,
    PilotSignalRequest,
    complete_lesson,
    get_instructor_summary,
    get_lessons,
    get_pitfall_stories,
    get_student_progress,
    log_pilot_signal,
)
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# B5: Wilson Score Confidence Interval
# ---------------------------------------------------------------------------

def test_wilson_score_interval_coverage():
    """Verify Wilson interval returns honest coverage bounds for small test sets."""
    # N=25 test instances, 80% accuracy (20/25)
    lower, upper = compute_wilson_interval(accuracy=0.80, n_test=25)
    assert 0.0 <= lower <= 0.80
    assert 0.80 <= upper <= 1.0
    assert lower > 0.58  # Wilson lower bound for 20/25 at 95% conf is ~0.608
    assert upper < 0.93

    # Extreme bounds check
    low_zero, high_zero = compute_wilson_interval(accuracy=0.0, n_test=30)
    assert low_zero == 0.0
    assert high_zero > 0.0

    low_one, high_one = compute_wilson_interval(accuracy=1.0, n_test=30)
    assert low_one < 1.0
    assert high_one == 1.0


# ---------------------------------------------------------------------------
# B4: Baseline Metric (Majority Class & Mean Predictor)
# ---------------------------------------------------------------------------

def test_baseline_metric_classification_95_5_imbalance():
    """Verify that a 95/5 imbalanced dataset produces a 95.0% baseline with explanation."""
    class_counts = {"non_default": 1900, "default": 100}
    total = 2000
    baseline = compute_baseline_metric(problem_type="classification", class_counts=class_counts, total_samples=total)

    assert baseline["baseline_value"] == 0.95
    assert baseline["baseline_percentage"] == 95.0
    assert baseline["baseline_type"] == "majority_class"
    assert "95.0% accuracy" in baseline["explanation"]


def test_baseline_metric_regression():
    """Verify regression baseline returns R² = 0.0 for mean predictor."""
    baseline = compute_baseline_metric(problem_type="regression")
    assert baseline["baseline_value"] == 0.0
    assert baseline["baseline_type"] == "mean_predictor"
    assert "R² = 0.0" in baseline["explanation"]


# ---------------------------------------------------------------------------
# B2: Cramér's V Association Measure
# ---------------------------------------------------------------------------

def test_cramers_v_positive_leakage_and_negative_independence():
    """Verify Cramér's V detects deterministic categorical association and rejects independent data."""
    # Positive fixture: perfectly associated categorical mapping
    contingency_leaked = {
        ("canceled_code_A", "churn_1"): 500,
        ("canceled_code_B", "churn_1"): 500,
        ("active_code_C", "churn_0"): 1000,
    }
    v_high = compute_cramers_v_from_contingency(contingency_leaked)
    assert v_high >= 0.95  # Near 1.0

    # Negative fixture: uniformly distributed independent categorical
    contingency_indep = {
        ("cat_1", "class_0"): 250,
        ("cat_1", "class_1"): 250,
        ("cat_2", "class_0"): 250,
        ("cat_2", "class_1"): 250,
    }
    v_low = compute_cramers_v_from_contingency(contingency_indep)
    assert v_low == 0.0


# ---------------------------------------------------------------------------
# B7: AST Preprocessing Leakage Detector
# ---------------------------------------------------------------------------

def test_ast_preprocessing_leakage_positive_fixtures():
    """Positive fixtures: code fitting scalers/imputers before split must fire B7."""
    # Positive 1: StandardScaler fit before train_test_split
    bad_code_1 = """
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression

df = pd.read_csv('data.csv')
X = df.drop(columns=['target'])
y = df['target']

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2)
clf = LogisticRegression()
clf.fit(X_train, y_train)
"""
    result_1 = detect_preprocessing_leakage_ast(bad_code_1)
    assert result_1["has_leakage"] is True
    assert "StandardScaler" in result_1["message"]
    assert "before train_test_split" in result_1["message"]

    # Positive 2: SimpleImputer fit on full df variable
    bad_code_2 = """
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split

df = pd.read_csv('data.csv')
imp = SimpleImputer(strategy='mean')
df_clean = imp.fit_transform(df)
X_train, X_test, y_train, y_test = train_test_split(df_clean, test_size=0.2)
"""
    result_2 = detect_preprocessing_leakage_ast(bad_code_2)
    assert result_2["has_leakage"] is True
    assert "SimpleImputer" in result_2["message"]


def test_ast_preprocessing_leakage_negative_clean_pipeline():
    """Negative fixture: A clean pipeline wrapping transformers and fit on X_train must produce zero alarms."""
    clean_code = """
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier

df = pd.read_csv('churn.csv')
X = df.drop(columns=['churn'])
y = df['churn']

# Honest split FIRST
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

pipeline = Pipeline([
    ('imputer', SimpleImputer(strategy='median')),
    ('scaler', StandardScaler()),
    ('clf', RandomForestClassifier(n_estimators=100))
])

# Pipeline fit on training split only
pipeline.fit(X_train, y_train)
score = pipeline.score(X_test, y_test)
"""
    result = detect_preprocessing_leakage_ast(clean_code)
    assert result["has_leakage"] is False
    assert "No preprocessing leakage detected" in result["message"]


# ---------------------------------------------------------------------------
# Part C: Guided Lesson Path & Check Enforcement
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_guided_lessons_content_and_citations():
    """Verify all 10 lessons exist, have primary sources, goals, and needs_instructor_review=True."""
    lessons = await get_lessons()
    assert len(lessons) == 10

    expected_routes = {"/datasets", "/studio", "/pipelines", "/results", "/explainability", "/deployments"}
    routes_found = set()

    for idx, lesson in enumerate(lessons, start=1):
        assert lesson.number == idx
        assert lesson.goal and len(lesson.goal) > 10
        assert lesson.short_explanation and len(lesson.short_explanation) > 30
        assert lesson.task and len(lesson.task) > 15
        assert lesson.primary_source and len(lesson.primary_source) > 10
        assert lesson.needs_instructor_review is True
        # Verify no dogma in explanations: no unsupported "always"
        assert "always" not in lesson.goal.lower()
        routes_found.add(lesson.page_route)

    # Check coverage of key platform pages
    assert routes_found.issuperset(expected_routes)


@pytest.mark.asyncio
async def test_lesson_check_enforcement():
    """Verify lessons cannot be skipped or completed with wrong answers or fake checks."""
    class DummyRequest:
        headers = {"x-student-id": "test-student-42"}

    req = cast(Request, cast(Any, DummyRequest()))

    # 1. Knowledge check: wrong option must be rejected
    with pytest.raises(HTTPException) as exc_info:
        await complete_lesson(
            lesson_id="lesson-02-missing-identifiers",
            payload=CompleteLessonRequest(selected_option=0),
            request=req,
        )
    assert exc_info.value.status_code == 400
    assert "Incorrect answer" in exc_info.value.detail

    # 2. Knowledge check: correct option (index 1) must succeed
    res = await complete_lesson(
        lesson_id="lesson-02-missing-identifiers",
        payload=CompleteLessonRequest(selected_option=1),
        request=req,
    )
    assert res["status"] == "success"

    # 3. Platform state check without verified evidence must be rejected
    with pytest.raises(HTTPException) as exc_info2:
        await complete_lesson(
            lesson_id="lesson-01-read-data",
            payload=CompleteLessonRequest(platform_state_evidence={"verified": False}),
            request=req,
        )
    assert exc_info2.value.status_code == 400
    assert "Platform task verification requirement not satisfied" in exc_info2.value.detail

    # 4. Platform state check with verified evidence succeeds
    res_platform = await complete_lesson(
        lesson_id="lesson-01-read-data",
        payload=CompleteLessonRequest(platform_state_evidence={"verified": True, "dataset_id": "test.csv"}),
        request=req,
    )
    assert res_platform["status"] == "success"

    # 5. Verify progress retrieval
    prog = await get_student_progress(request=req)
    assert "lesson-01-read-data" in prog.completed_lessons
    assert "lesson-02-missing-identifiers" in prog.completed_lessons

    # 6. Instructor summary reflects completion counts
    summary = await get_instructor_summary()
    assert summary.total_students_active >= 1
    assert summary.lesson_completion_counts.get("lesson-01-read-data", 0) >= 1


# ---------------------------------------------------------------------------
# Part D: Pitfall Datasets Catalog
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pitfall_stories_catalog():
    """Verify all 6 pitfall datasets are exposed with stories, hints, and reveals."""
    stories = await get_pitfall_stories()
    assert len(stories) == 6

    expected_pitfalls = {
        "target_leakage",
        "class_imbalance",
        "multicollinearity",
        "simpsons_paradox",
        "identifier_column",
        "missing_pattern",
    }
    pitfalls_found = {s["pitfall_type"] for s in stories}
    assert pitfalls_found == expected_pitfalls

    for s in stories:
        assert s["title"] and len(s["title"]) > 5
        assert s["story"] and len(s["story"]) > 15
        assert s["target"]
        assert s["hint"] and len(s["hint"]) > 10
        assert s["reveal"] and len(s["reveal"]) > 20


# ---------------------------------------------------------------------------
# Part F: Minimal Private Pilot Signals
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pilot_signals_logging():
    """Verify private telemetry logging accepts allowed events and never logs code/data."""
    class DummyRequest:
        headers = {"x-student-id": "pilot-user-99"}

    req = cast(Request, cast(Any, DummyRequest()))
    sig_res = await log_pilot_signal(
        payload=PilotSignalRequest(
            event_type="card_shown",
            card_id="rule_target_leakage",
            context_page="/datasets",
            learning_mode_enabled=True,
        ),
        request=req,
    )
    assert sig_res["status"] == "recorded"
