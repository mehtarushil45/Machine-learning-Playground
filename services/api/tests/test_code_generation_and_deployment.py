"""Regression & Validation Tests for Pipeline Code Generation & Model-First Deployment.

Ensures:
1. Code generation handles mixed numeric/categorical features without data type mismatch errors
2. ColumnTransformer partitions features into numeric (imputer + scaler) and categorical (imputer + onehot)
3. Generated code executes seamlessly on raw datasets with missing values
4. LocalDeploymentCreate schema supports model-first deployments without requiring job_id
"""

import ast
import os
import tempfile
import numpy as np
import pandas as pd
import pytest

from app.ml.code_generator import generate_python_code
from app.schemas.pipeline import PipelineDAG, PipelineNodeConfig
from app.schemas.local_deployment import LocalDeploymentCreate


def test_code_generator_mixed_types_partitioning():
    """Verify code generator dynamically separates numeric and categorical columns."""
    dag = PipelineDAG(
        dataset_name="dummy_mixed.csv",
        target_column="outcome",
        feature_columns=["age", "fare", "department", "city"],
        nodes=[
            PipelineNodeConfig(
                node_id="imputer-1",
                type="missing_value_handler",
                name="Impute Missing",
                params={"strategy": "median"},
            ),
            PipelineNodeConfig(
                node_id="scaler-1",
                type="feature_scaler",
                name="Scale Numeric",
                params={"scaler_type": "standard"},
            ),
            PipelineNodeConfig(
                node_id="model-1",
                type="model_trainer",
                name="Train Classifier",
                params={"algorithm": "random_forest_classifier", "test_size": 0.25},
            ),
        ],
    )

    response = generate_python_code(dag)

    assert response.is_valid_syntax is True
    assert "numeric_features = [col for col in feature_cols if col in df.columns and pd.api.types.is_numeric_dtype(df[col])]" in response.python_code
    assert "categorical_features = [col for col in feature_cols if col in df.columns and col not in numeric_features]" in response.python_code
    assert "ColumnTransformer" in response.python_code
    assert "OneHotEncoder" in response.python_code

    # Verify execution against mixed DataFrame with missing values
    with tempfile.TemporaryDirectory() as tmp_dir:
        csv_path = os.path.join(tmp_dir, "dummy_mixed.csv")
        artifact_path = os.path.join(tmp_dir, "trained_model_pipeline.joblib")

        df = pd.DataFrame({
            "age": [25.0, 30.0, np.nan, 45.0, 50.0, 22.0, 38.0, np.nan, 60.0, 29.0],
            "fare": [10.5, 75.0, 22.0, np.nan, 120.0, 8.0, 35.0, 40.0, np.nan, 55.0],
            "department": ["Sales", "Engineering", "Marketing", "Sales", np.nan, "Engineering", "HR", "Sales", "HR", "Engineering"],
            "city": ["NYC", "London", "Tokyo", "NYC", "London", "Tokyo", "Paris", np.nan, "NYC", "London"],
            "outcome": [0, 1, 0, 1, 1, 0, 0, 1, 0, 1],
        })
        df.to_csv(csv_path, index=False)

        # Replace hardcoded paths in generated code to run in tmpdir
        test_code = response.python_code.replace('"dummy_mixed.csv"', f'"{csv_path.replace(chr(92), "/")}"')
        test_code = test_code.replace('"trained_model_pipeline.joblib"', f'"{artifact_path.replace(chr(92), "/")}"')

        exec_globals = {}
        exec(test_code, exec_globals)

        assert os.path.exists(artifact_path), "Model pipeline artifact must be successfully serialized"
        assert "model_pipeline" in exec_globals


def test_local_deployment_create_schema_model_first():
    """Verify LocalDeploymentCreate supports both job_id and model_id deployments."""
    # From model registry / Code Studio without job_id
    dep_model_only = LocalDeploymentCreate(
        model_id="reg_model_98765",
        name="Serving from Code Studio Model",
        configuration={"port": 8000},
    )
    assert dep_model_only.model_id == "reg_model_98765"
    assert dep_model_only.job_id is None

    # From training job with job_id
    dep_job = LocalDeploymentCreate(
        job_id="job_12345",
        name="Serving from Training Job",
    )
    assert dep_job.job_id == "job_12345"
    assert dep_job.model_id is None


def test_code_generator_imports_clean_no_unused_numpy():
    """Verify classification code does not import unused numpy, avoiding pyflakes warnings."""
    dag_clf = PipelineDAG(
        dataset_name="data.csv",
        target_column="course",
        feature_columns=["study_hours", "attendance"],
        nodes=[
            PipelineNodeConfig(
                node_id="model-1",
                type="model_trainer",
                name="Classifier",
                params={"algorithm": "random_forest_classifier"},
            ),
        ],
    )
    resp_clf = generate_python_code(dag_clf)
    assert "import numpy as np" not in resp_clf.python_code

    dag_reg = PipelineDAG(
        dataset_name="data.csv",
        target_column="score",
        feature_columns=["study_hours", "attendance"],
        nodes=[
            PipelineNodeConfig(
                node_id="model-1",
                type="model_trainer",
                name="Regressor",
                params={"algorithm": "random_forest_regressor"},
            ),
        ],
    )
    resp_reg = generate_python_code(dag_reg)
    assert "import numpy as np" in resp_reg.python_code
