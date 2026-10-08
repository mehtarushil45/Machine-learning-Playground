"""Integration Test for University Lab Exam Classroom: Manual Code Execution, Singleton In-Place Deployment, and Rubric Grading.

Verifies:
1. Lab Exam retrieval with problem statements, datasets, and rubrics.
2. Sandboxed execution producing serialized scikit-learn pipeline artifact.
3. Initial deployment creation to dedicated lab slot.
4. In-Place Singleton Redeployment: modifies code / model and re-deploys.
   Verifies NO new deployment is formed; deployment_id is identical and is_updated_in_place is True.
5. Automated test rubric evaluation scoring and feedback.
6. Exam submission finalization and locking.
"""

import asyncio
import os
import tempfile
import pytest
import pandas as pd
import numpy as np

from app.database import AsyncSessionLocal, engine
from app.services.code_execution_service import start_execution, get_execution
from app.routers.classrooms import (
    CURATED_LAB_EXAMS,
    list_lab_exams,
    get_lab_exam,
    deploy_lab_model,
    evaluate_lab_model,
    submit_lab_exam,
)
from app.schemas.classroom import (
    LabDeployRequest,
    LabEvaluateRequest,
    LabSubmitRequest,
)


@pytest.fixture(autouse=True)
def dispose_db():
    yield
    import asyncio
    try:
        asyncio.run(engine.dispose())
    except Exception:
        pass


@pytest.mark.asyncio
async def test_university_lab_exam_singleton_lifecycle():
    """Verify entire university lab exam workflow with in-place deployment guarantee."""
    
    # 1. Verify Lab Exams Listing
    exams = await list_lab_exams()
    assert len(exams) >= 1
    exam_id = "lab-exam-01"
    exam = await get_lab_exam(exam_id)
    assert exam.id == exam_id
    assert "churn" in exam.target_column
    assert exam.starter_code is not None

    # 2. Simulate Student Writing Code Manually
    # Create dataset in a temporary location or use existing
    student_code_v1 = """
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.compose import ColumnTransformer

# Synthetic lab training
np.random.seed(42)
X = pd.DataFrame({
    'tenure': np.random.randint(1, 60, size=50),
    'monthly_charges': np.random.uniform(20.0, 100.0, size=50),
    'total_charges': np.random.uniform(100.0, 5000.0, size=50),
})
y = np.random.choice([0, 1], size=50)

prep = ColumnTransformer([
    ('num', StandardScaler(), ['tenure', 'monthly_charges', 'total_charges'])
])
pipe = Pipeline([
    ('preprocessor', prep),
    ('classifier', RandomForestClassifier(n_estimators=10, random_state=42))
])
pipe.fit(X, y)
joblib.dump(pipe, 'trained_model_pipeline.joblib')
print("[Student Script] Trained and exported model v1 successfully.")
"""

    rec1 = await start_execution(code=student_code_v1, filename="student_exam_v1.py", prefer_celery=False)
    assert rec1.exec_id is not None

    model_id_v1 = None
    for _ in range(30):
        await asyncio.sleep(1)
        res = get_execution(rec1.exec_id)
        if res and res.status in ("completed", "failed", "timeout"):
            assert res.status == "completed", f"Execution 1 failed: {res.error} | {res.stderr}"
            model_id_v1 = res.registered_model_id
            break

    assert model_id_v1 is not None, "Model v1 must be registered in ModelRegistry upon exit 0"

    # 3. First Deployment to Lab Slot
    async with AsyncSessionLocal() as db:
        deploy_res_1 = await deploy_lab_model(
            exam_id=exam_id,
            payload=LabDeployRequest(
                model_id=model_id_v1,
                code=student_code_v1,
                name="Student Lab Model",
            ),
            current_user=None,
            db=db,
        )
        assert deploy_res_1.deployment_id is not None
        assert deploy_res_1.status == "RUNNING"
        assert deploy_res_1.is_updated_in_place is False
        first_deployment_id = deploy_res_1.deployment_id

    # 4. Student Modifies Code and Re-executes (Model V2)
    student_code_v2 = """
import pandas as pd
import numpy as np
import joblib
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.compose import ColumnTransformer

# V2: Improved hyperparameter tuning (n_estimators=30)
np.random.seed(99)
X = pd.DataFrame({
    'tenure': np.random.randint(1, 60, size=50),
    'monthly_charges': np.random.uniform(20.0, 100.0, size=50),
    'total_charges': np.random.uniform(100.0, 5000.0, size=50),
})
y = np.random.choice([0, 1], size=50)

prep = ColumnTransformer([
    ('num', StandardScaler(), ['tenure', 'monthly_charges', 'total_charges'])
])
pipe = Pipeline([
    ('preprocessor', prep),
    ('classifier', RandomForestClassifier(n_estimators=30, random_state=99))
])
pipe.fit(X, y)
joblib.dump(pipe, 'trained_model_pipeline.joblib')
print("[Student Script] Trained and exported model v2 with updated hyperparameters.")
"""

    rec2 = await start_execution(code=student_code_v2, filename="student_exam_v2.py", prefer_celery=False)
    model_id_v2 = None
    for _ in range(30):
        await asyncio.sleep(1)
        res = get_execution(rec2.exec_id)
        if res and res.status in ("completed", "failed", "timeout"):
            assert res.status == "completed", f"Execution 2 failed: {res.error} | {res.stderr}"
            model_id_v2 = res.registered_model_id
            break

    assert model_id_v2 is not None

    # 5. CRITICAL TEST: Redeploy Model (Singleton Guarantee)
    # The student changes code and clicks Deploy again.
    # NO new deployment should form! Changes should be shown in the PREVIOUS deployment only.
    async with AsyncSessionLocal() as db:
        deploy_res_2 = await deploy_lab_model(
            exam_id=exam_id,
            payload=LabDeployRequest(
                model_id=model_id_v2,
                code=student_code_v2,
            ),
            current_user=None,
            db=db,
        )

        # Assertions for Singleton Guarantee:
        assert deploy_res_2.deployment_id == first_deployment_id, (
            f"Deployment ID must remain identical! Expected {first_deployment_id}, got {deploy_res_2.deployment_id}"
        )
        assert deploy_res_2.is_updated_in_place is True, "Must be flagged as in-place update"
        assert deploy_res_2.version_count >= 2, "Version count must increment on update"
        assert deploy_res_2.model_id == model_id_v2, "Deployed model must be updated to V2"

    # 6. Automated Benchmark Evaluation against Rubric
    async with AsyncSessionLocal() as db:
        eval_res = await evaluate_lab_model(
            exam_id=exam_id,
            payload=LabEvaluateRequest(deployment_id=first_deployment_id),
            current_user=None,
            db=db,
        )
        assert eval_res.score > 0
        assert eval_res.percentage > 0
        assert len(eval_res.criteria_results) >= 4
        # At least serving health and inference test must pass
        assert any(c.criterion == "Serving Health & Availability" and c.passed for c in eval_res.criteria_results)

    # 7. Final Submission Gateway
    async with AsyncSessionLocal() as db:
        sub_res = await submit_lab_exam(
            exam_id=exam_id,
            payload=LabSubmitRequest(
                code=student_code_v2,
                deployment_id=first_deployment_id,
            ),
            current_user=None,
            db=db,
        )
        assert sub_res.status == "SUBMITTED"
        assert sub_res.submission_id is not None
        assert sub_res.grade_score is not None
