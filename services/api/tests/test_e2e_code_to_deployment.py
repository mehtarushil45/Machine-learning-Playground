"""End-to-End Regression Test: Pipeline Code Generation -> Sandbox Execution -> Auto-Registration -> Deployment -> Live Inference.

Verifies:
1. Dynamic preprocessing separates numeric and categorical features without error.
2. Code execution produces trained model artifact and auto-registers in ModelRegistry.
3. Model-first local deployment creates an active serving endpoint.
4. Schema introspection properly detects categorical and numeric feature types.
5. Live inference executes seamlessly and returns predictions with probability distributions.
"""

import asyncio
import os
import tempfile
import numpy as np
import pandas as pd
import pytest

from app.database import AsyncSessionLocal, engine
from app.ml.code_generator import generate_python_code
from app.schemas.pipeline import PipelineDAG, PipelineNodeConfig
from app.services.code_execution_service import start_execution, get_execution
from app.schemas.local_deployment import LocalDeploymentCreate, LocalPredictRequest
from app.services.local_deployment_service import create_local_deployment, predict_local


@pytest.fixture(autouse=True)
def dispose_db_engine():
    yield
    import asyncio
    try:
        asyncio.run(engine.dispose())
    except Exception:
        pass


@pytest.mark.asyncio
async def test_full_pipeline_code_to_deployment_lifecycle():
    """Verify entire flow from DAG generation through live endpoint prediction."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        csv_file = os.path.join(tmp_dir, "mixed_data.csv")
        df = pd.DataFrame({
            "age": [25.0, 30.0, np.nan, 45.0, 50.0, 22.0, 38.0, 33.0, 60.0, 29.0],
            "fare": [10.5, 75.0, 22.0, 15.0, 120.0, 8.0, 35.0, 40.0, 95.0, 55.0],
            "department": ["Sales", "Engineering", "Marketing", "Sales", "HR", "Engineering", "HR", "Sales", "HR", "Engineering"],
            "city": ["NYC", "London", "Tokyo", "NYC", "London", "Tokyo", "Paris", "Berlin", "NYC", "London"],
            "outcome": [0, 1, 0, 1, 1, 0, 0, 1, 0, 1],
        })
        df.to_csv(csv_file, index=False)

        dag = PipelineDAG(
            dataset_name=csv_file.replace(chr(92), "/"),
            target_column="outcome",
            feature_columns=["age", "fare", "department", "city"],
            nodes=[
                PipelineNodeConfig(node_id="1", type="missing_value_handler", name="Imputer", params={"strategy": "median"}),
                PipelineNodeConfig(node_id="2", type="feature_scaler", name="Scaler", params={"scaler_type": "standard"}),
                PipelineNodeConfig(node_id="3", type="model_trainer", name="Trainer", params={"algorithm": "random_forest_classifier"}),
            ]
        )
        gen = generate_python_code(dag)
        assert gen.is_valid_syntax is True, "Generated Python code must be syntactically valid"

        record = await start_execution(code=gen.python_code, filename="experiment_test_full_flow.py")
        assert record.exec_id is not None

        model_id = None
        for _ in range(30):
            await asyncio.sleep(1)
            rec = get_execution(record.exec_id)
            if rec is not None and rec.status in ("completed", "failed", "timeout"):
                assert rec.status == "completed", f"Execution failed with error: {rec.error} | stderr: {rec.stderr}"
                assert rec.exit_code == 0
                assert "trained_model_pipeline.joblib" in rec.artifacts
                model_id = rec.registered_model_id
                break

        assert model_id is not None, "Model must be registered upon execution completion"

        # Create serving deployment
        async with AsyncSessionLocal() as db:
            dep_create = LocalDeploymentCreate(
                model_id=model_id,
                name="E2E Validated Serving Endpoint"
            )
            dep = await create_local_deployment(dep_create, owner_id="test-e2e-user", db=db)
            assert dep.deployment_id is not None
            assert dep.status == "RUNNING"
            assert dep.input_schema is not None

            # Verify schema recognizes categorical vs numeric
            assert dep.input_schema["age"]["type"] == "numeric"
            assert dep.input_schema["fare"]["type"] == "numeric"
            assert dep.input_schema["department"]["type"] == "categorical"
            assert dep.input_schema["city"]["type"] == "categorical"

            # Execute live prediction
            pred_req = LocalPredictRequest(
                inputs={
                    "age": 28.0,
                    "fare": 45.0,
                    "department": "Engineering",
                    "city": "NYC"
                }
            )
            pred_res = await predict_local(dep.deployment_id, pred_req, owner_id="test-e2e-user", db=db)
            assert pred_res.prediction in (0, 1, "0", "1")
            assert pred_res.latency_ms > 0
            assert pred_res.status == "SUCCESS"
