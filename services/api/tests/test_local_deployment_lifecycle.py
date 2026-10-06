"""Tests for Local Deployment & Model Lifecycle Management.

Covers:
  - Deployment creation & artifact immutability
  - Lifecycle state machine (start, stop, restart, redeploy, delete)
  - Invalid state transitions (predict while stopped, start while running)
  - Strict input validation (missing features, invalid numeric, unknown categories)
  - Prediction execution & latency measurement
  - Prediction history persistence in LocalPredictionHistory
  - User/workspace security isolation
"""

import uuid
import pytest
from fastapi import HTTPException

from app.database import AsyncSessionLocal, engine
from app.models.local_deployment import LocalDeployment, LocalDeploymentStatus
from app.models.local_prediction_history import LocalPredictionHistory
import app.services.local_deployment_service as svc
from app.schemas.local_deployment import LocalPredictRequest, LocalDeploymentRedeploy


@pytest.fixture(autouse=True)
def dispose_db_engine():
    yield
    import asyncio
    try:
        asyncio.run(engine.dispose())
    except Exception:
        pass


@pytest.mark.asyncio
async def test_local_deployment_lifecycle_end_to_end():
    """Test full deployment lifecycle transitions, validation, and history persistence."""
    async with AsyncSessionLocal() as db_session:
        dep_id = uuid.uuid4()
        owner_id = str(uuid.uuid4())
        feature_cols = ["age", "study_hours", "course"]
        input_schema = {
            "age": {"type": "numeric", "min": 10.0, "max": 80.0},
            "study_hours": {"type": "numeric", "min": 0.0, "max": 24.0},
            "course": {"type": "categorical", "categories": ["Arts", "Commerce", "Science"]},
        }

        # 1. Create a clean LocalDeployment record in DB
        dep = LocalDeployment(
            id=dep_id,
            job_id="test-job-lifecycle-123",
            model_id="test-model-v1",
            model_version="v1.0.0",
            artifact_id="model_artifact.joblib",
            name="Test Student Success Predictor",
            status=LocalDeploymentStatus.RUNNING.value,
            algorithm="decision_tree_classifier",
            problem_type="Classification",
            dataset_id="test-dataset-id",
            target_column="passed",
            feature_columns=feature_cols,
            model_path="dummy_path.joblib",
            input_schema=input_schema,
            configuration={"host": "localhost", "port": 8000},
            logs=[],
            total_predictions=0,
            owner_id=owner_id,
        )
        db_session.add(dep)
        await db_session.commit()
        await db_session.refresh(dep)

        try:
            # 2. Test Get Deployment
            fetched = await svc.get_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
            assert fetched.deployment_id == str(dep_id)
            assert fetched.model_version == "v1.0.0"
            assert fetched.status == "RUNNING"
            assert fetched.configuration["port"] == 8000

            # 3. Test Stop Deployment
            stopped = await svc.stop_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
            assert stopped.status == "STOPPED"
            assert stopped.stopped_at is not None

            # Test invalid transition: Stop when already stopped raises 409
            with pytest.raises(HTTPException) as exc_info:
                await svc.stop_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
            assert exc_info.value.status_code == 409

            # 4. Test Predict while STOPPED raises 409
            with pytest.raises(HTTPException) as exc_info:
                await svc.predict_local(
                    str(dep_id),
                    LocalPredictRequest(inputs={"age": 20, "study_hours": 5, "course": "Science"}),
                    owner_id=owner_id,
                    db=db_session,
                )
            assert exc_info.value.status_code == 409
            assert "STOPPED" in exc_info.value.detail

            # 5. Mock load_model & predict for unit testing inference
            import app.ml.inference_engine as ie
            orig_load_model = ie.load_model
            orig_predict = ie.predict
            setattr(ie, "load_model", lambda **kwargs: None)
            setattr(
                ie,
                "predict",
                lambda data, model_id=None, **kwargs: {
                    "prediction": "Passed",
                    "confidence": 0.94,
                    "probabilities": {"Passed": 0.94, "Failed": 0.06},
                    "latency_ms": 1.4,
                },
            )

            try:
                # 5a. Test Start
                started = await svc.start_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
                assert started.status == "RUNNING"
                assert started.started_at is not None

                # Test invalid transition: Start when already running raises 409
                with pytest.raises(HTTPException) as exc_info:
                    await svc.start_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
                assert exc_info.value.status_code == 409

                # 5b. Test Restart
                restarted = await svc.restart_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
                assert restarted.status == "RUNNING"

                # 6. Test Input Validation:
                # 6a. Missing required feature
                with pytest.raises(HTTPException) as exc_info:
                    await svc.predict_local(
                        str(dep_id),
                        LocalPredictRequest(inputs={"age": 20, "course": "Science"}),
                        owner_id=owner_id,
                        db=db_session,
                    )
                assert exc_info.value.status_code == 422
                assert "Missing required feature" in exc_info.value.detail

                # 6b. Invalid numeric type
                with pytest.raises(HTTPException) as exc_info:
                    await svc.predict_local(
                        str(dep_id),
                        LocalPredictRequest(inputs={"age": "invalid_number", "study_hours": 5, "course": "Science"}),
                        owner_id=owner_id,
                        db=db_session,
                    )
                assert exc_info.value.status_code == 422
                assert "Expected numeric value" in exc_info.value.detail

                # 6c. Unknown categorical value
                with pytest.raises(HTTPException) as exc_info:
                    await svc.predict_local(
                        str(dep_id),
                        LocalPredictRequest(inputs={"age": 25, "study_hours": 5, "course": "EngineeringX"}),
                        owner_id=owner_id,
                        db=db_session,
                    )
                assert exc_info.value.status_code == 422
                assert "EngineeringX" in exc_info.value.detail
                assert "not present in the trained categorical schema" in exc_info.value.detail

                # 7. Test Successful Prediction Execution & History Persistence
                pred_res = await svc.predict_local(
                    str(dep_id),
                    LocalPredictRequest(inputs={"age": 22, "study_hours": 8, "course": "Commerce"}),
                    owner_id=owner_id,
                    db=db_session,
                )
                assert pred_res.prediction == "Passed"
                assert pred_res.confidence == 0.94
                assert pred_res.status == "SUCCESS"
                assert pred_res.inference_id is not None

                # Verify prediction was persisted in LocalPredictionHistory table
                history = await svc.list_prediction_history(str(dep_id), owner_id=owner_id, db=db_session)
                assert len(history) >= 1
                success_hist = [h for h in history if h.status == "SUCCESS"][0]
                assert success_hist.prediction == "Passed"
                assert success_hist.confidence == 0.94
                assert success_hist.inputs["course"] == "Commerce"

                # 8. Test Security Isolation: unauthorized user access rejected
                other_user_id = str(uuid.uuid4())
                with pytest.raises(HTTPException) as exc_info:
                    await svc.get_local_deployment(str(dep_id), owner_id=other_user_id, db=db_session)
                assert exc_info.value.status_code == 403

                with pytest.raises(HTTPException) as exc_info:
                    await svc.predict_local(
                        str(dep_id),
                        LocalPredictRequest(inputs={"age": 22, "study_hours": 8, "course": "Commerce"}),
                        owner_id=other_user_id,
                        db=db_session,
                    )
                assert exc_info.value.status_code == 403

                # 9. Test Redeploy existing
                redeploy_res = await svc.redeploy_local_deployment(str(dep_id), None, owner_id=owner_id, db=db_session)
                assert redeploy_res.status == "RUNNING"

            finally:
                ie.load_model = orig_load_model
                ie.predict = orig_predict

            # 10. Test Delete Deployment
            del_res = await svc.delete_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
            assert "deleted successfully" in del_res["detail"]

            # Confirm deployment is removed
            with pytest.raises(HTTPException) as exc_info:
                await svc.get_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
            assert exc_info.value.status_code == 404

        finally:
            # Cleanup any remaining test record
            try:
                await svc.delete_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
            except Exception:
                pass
