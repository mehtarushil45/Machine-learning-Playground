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


@pytest.mark.asyncio
async def test_local_deployment_batch_scoring_and_template():
    """Test batch CSV scoring, template generation, state guards, and enriched CSV output."""
    import io
    import os
    import pandas as pd
    from sklearn.tree import DecisionTreeClassifier
    import app.ml.inference_engine as ie
    from app.ml.inference_engine import _MODEL_CACHE, ModelContainer, _PREDICTIONS_OUTPUT_DIR

    async with AsyncSessionLocal() as db_session:
        dep_id = uuid.uuid4()
        owner_id = str(uuid.uuid4())
        feature_cols = ["age", "study_hours", "course"]
        input_schema = {
            "age": {"type": "numeric", "min": 10.0, "max": 80.0},
            "study_hours": {"type": "numeric", "min": 0.0, "max": 24.0},
            "course": {"type": "categorical", "categories": ["Arts", "Commerce", "Science"]},
        }

        dep = LocalDeployment(
            id=dep_id,
            job_id="test-job-batch-456",
            model_id="test-model-batch-v1",
            model_version="v1.0.0",
            artifact_id="batch_artifact.joblib",
            name="Batch Scoring Deployment",
            status=LocalDeploymentStatus.RUNNING.value,
            algorithm="decision_tree_classifier",
            problem_type="Classification",
            dataset_id="test-dataset-batch",
            target_column="passed",
            feature_columns=feature_cols,
            model_path="dummy_batch_path.joblib",
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
            # 1. Test generate_template_csv
            template_csv = await svc.generate_template_csv(str(dep_id), owner_id=owner_id, db=db_session)
            assert isinstance(template_csv, str)
            df_template = pd.read_csv(io.StringIO(template_csv))
            assert list(df_template.columns) == feature_cols
            assert len(df_template) == 3
            # Check categorical column contains allowed values
            for course_val in df_template["course"]:
                assert course_val in ["Arts", "Commerce", "Science"]

            # 2. Test predict_batch_local with mocked predict_batch
            orig_predict_batch = ie.predict_batch
            ie.predict_batch = lambda data, model_id=None, **kwargs: {
                "total_samples": 3,
                "successful_predictions": 3,
                "failed_predictions": 0,
                "predictions": [
                    {"prediction": "Passed", "confidence": 0.95, "probabilities": {"Passed": 0.95, "Failed": 0.05}},
                    {"prediction": "Failed", "confidence": 0.88, "probabilities": {"Passed": 0.12, "Failed": 0.88}},
                    {"prediction": "Passed", "confidence": 0.91, "probabilities": {"Passed": 0.91, "Failed": 0.09}},
                ],
                "latency_ms": 14.2,
                "csv_download_url": "/api/v1/predict/download/prediction_batch_test.csv",
            }

            try:
                raw_csv = b"age,study_hours,course\n22,8,Commerce\n19,2,Arts\n25,12,Science\n"
                batch_res = await svc.predict_batch_local(
                    str(dep_id),
                    data=raw_csv,
                    owner_id=owner_id,
                    db=db_session,
                    batch_size=1000,
                    return_probabilities=True,
                )

                assert batch_res.status == "SUCCESS"
                assert batch_res.total_samples == 3
                assert batch_res.successful_predictions == 3
                assert batch_res.failed_predictions == 0
                assert len(batch_res.predictions_preview) == 3
                assert batch_res.class_distribution == {"Passed": 2, "Failed": 1}
                assert batch_res.download_url == "/api/v1/predict/download/prediction_batch_test.csv"
                assert batch_res.avg_confidence is not None
                assert round(batch_res.avg_confidence, 2) == 0.91

                # Check deployment telemetry update
                await db_session.refresh(dep)
                assert dep.total_predictions == 3
                assert any(
                    log.get("event") == "BATCH_PREDICTION_COMPLETED"
                    for log in (dep.logs or [])
                )

                # 3. Test Security Isolation on batch predict
                other_user_id = str(uuid.uuid4())
                with pytest.raises(HTTPException) as exc_info:
                    await svc.predict_batch_local(
                        str(dep_id),
                        data=raw_csv,
                        owner_id=other_user_id,
                        db=db_session,
                    )
                assert exc_info.value.status_code == 403

                # 4. Test STOPPED guard on batch predict
                await svc.stop_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
                with pytest.raises(HTTPException) as exc_info:
                    await svc.predict_batch_local(
                        str(dep_id),
                        data=raw_csv,
                        owner_id=owner_id,
                        db=db_session,
                    )
                assert exc_info.value.status_code == 409
                assert "STOPPED" in exc_info.value.detail

            finally:
                ie.predict_batch = orig_predict_batch

            # 5. Real End-to-End Batch CSV Scoring through inference_engine
            clf = DecisionTreeClassifier(random_state=42)
            X_train = pd.DataFrame({"age": [20, 25, 18, 30], "study_hours": [5.0, 2.0, 8.0, 1.0]})
            y_train = ["Passed", "Failed", "Passed", "Failed"]
            clf.fit(X_train, y_train)

            container = ModelContainer(
                model_id="e2e-batch-model",
                model_pipeline=clf,
                metadata={
                    "model_version": "v1.0.0",
                    "feature_columns": ["age", "study_hours"],
                    "target_column": "passed",
                    "problem_type": "Classification",
                    "algorithm": "decision_tree_classifier",
                },
            )
            _MODEL_CACHE["e2e-batch-model"] = container

            created_csv_path = None
            try:
                test_csv_bytes = b"age,study_hours\n22,6.0\n28,1.5\n19,9.0\n"
                real_batch_res = ie.predict_batch(
                    data=test_csv_bytes,
                    model_id="e2e-batch-model",
                    return_probabilities=True,
                    save_csv=True,
                )

                assert real_batch_res["total_samples"] == 3
                assert real_batch_res["successful_predictions"] == 3
                assert len(real_batch_res["predictions"]) == 3
                assert real_batch_res["csv_download_url"] is not None

                # Verify enriched CSV on disk
                csv_filename = os.path.basename(real_batch_res["csv_download_url"])
                created_csv_path = os.path.join(_PREDICTIONS_OUTPUT_DIR, csv_filename)
                assert os.path.exists(created_csv_path)

                df_enriched = pd.read_csv(created_csv_path)
                assert "prediction" in df_enriched.columns
                assert "confidence" in df_enriched.columns
                assert len(df_enriched) == 3
                assert df_enriched["prediction"].iloc[0] == "Passed"
                assert df_enriched["confidence"].iloc[0] > 0.5
            finally:
                _MODEL_CACHE.pop("e2e-batch-model", None)
                if created_csv_path and os.path.exists(created_csv_path):
                    try:
                        os.remove(created_csv_path)
                    except Exception:
                        pass

        finally:
            try:
                await svc.delete_local_deployment(str(dep_id), owner_id=owner_id, db=db_session)
            except Exception:
                pass

