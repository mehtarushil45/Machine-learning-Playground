"""Bi-Directional "View as Code" Engine — Phase 2.

Converts visual drag-and-drop ML pipeline specifications (DAGs) into clean,
standalone, production-grade Python scripts using scikit-learn and pandas.

Provides:
  - generate_python_code(pipeline, ...) -> CodeGenerationResponse
  - validate_pipeline_dag(pipeline)      -> PipelineValidationResponse
  - get_preset_pipeline_templates()     -> Dict[str, PipelineDAG]
"""

from __future__ import annotations

import ast
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.schemas.pipeline import (
    CodeGenerationRequest,
    CodeGenerationResponse,
    CodeStepExplanation,
    PipelineDAG,
    PipelineNodeConfig,
    PipelineValidationResponse,
)

logger = logging.getLogger("apex_ml.code_generator")


# ---------------------------------------------------------------------------
# Algorithm Mapping for Clean Python Code Imports & Code Lines
# ---------------------------------------------------------------------------
_ALGO_CODE_MAP: Dict[str, Tuple[str, str, str]] = {
    "randomforestclassifier": (
        "from sklearn.ensemble import RandomForestClassifier",
        "RandomForestClassifier",
        "classification",
    ),
    "random_forest_classifier": (
        "from sklearn.ensemble import RandomForestClassifier",
        "RandomForestClassifier",
        "classification",
    ),
    "logisticregression": (
        "from sklearn.linear_model import LogisticRegression",
        "LogisticRegression",
        "classification",
    ),
    "logistic_regression": (
        "from sklearn.linear_model import LogisticRegression",
        "LogisticRegression",
        "classification",
    ),
    "decisiontreeclassifier": (
        "from sklearn.tree import DecisionTreeClassifier",
        "DecisionTreeClassifier",
        "classification",
    ),
    "decision_tree_classifier": (
        "from sklearn.tree import DecisionTreeClassifier",
        "DecisionTreeClassifier",
        "classification",
    ),
    "gradientboostingclassifier": (
        "from sklearn.ensemble import GradientBoostingClassifier",
        "GradientBoostingClassifier",
        "classification",
    ),
    "gradient_boosting_classifier": (
        "from sklearn.ensemble import GradientBoostingClassifier",
        "GradientBoostingClassifier",
        "classification",
    ),
    "xgboostclassifier": (
        "from xgboost import XGBClassifier",
        "XGBClassifier",
        "classification",
    ),
    "xgboost_classifier": (
        "from xgboost import XGBClassifier",
        "XGBClassifier",
        "classification",
    ),
    "lightgbmclassifier": (
        "from lightgbm import LGBMClassifier",
        "LGBMClassifier",
        "classification",
    ),
    "lightgbm_classifier": (
        "from lightgbm import LGBMClassifier",
        "LGBMClassifier",
        "classification",
    ),
    "supportvectormachine(svm)": (
        "from sklearn.svm import SVC",
        "SVC",
        "classification",
    ),
    "svm": (
        "from sklearn.svm import SVC",
        "SVC",
        "classification",
    ),
    "knearestneighbors(knn)": (
        "from sklearn.neighbors import KNeighborsClassifier",
        "KNeighborsClassifier",
        "classification",
    ),
    "knn": (
        "from sklearn.neighbors import KNeighborsClassifier",
        "KNeighborsClassifier",
        "classification",
    ),
    "multilayerperceptron(mlp)": (
        "from sklearn.neural_network import MLPClassifier",
        "MLPClassifier",
        "classification",
    ),
    "mlp": (
        "from sklearn.neural_network import MLPClassifier",
        "MLPClassifier",
        "classification",
    ),
    "ridgeclassifier": (
        "from sklearn.linear_model import RidgeClassifier",
        "RidgeClassifier",
        "classification",
    ),
    "linearregression": (
        "from sklearn.linear_model import LinearRegression",
        "LinearRegression",
        "regression",
    ),
    "linear_regression": (
        "from sklearn.linear_model import LinearRegression",
        "LinearRegression",
        "regression",
    ),
    "randomforestregressor": (
        "from sklearn.ensemble import RandomForestRegressor",
        "RandomForestRegressor",
        "regression",
    ),
    "random_forest_regressor": (
        "from sklearn.ensemble import RandomForestRegressor",
        "RandomForestRegressor",
        "regression",
    ),
    "decisiontreeregressor": (
        "from sklearn.tree import DecisionTreeRegressor",
        "DecisionTreeRegressor",
        "regression",
    ),
    "decision_tree_regressor": (
        "from sklearn.tree import DecisionTreeRegressor",
        "DecisionTreeRegressor",
        "regression",
    ),
    "gradientboostingregressor": (
        "from sklearn.ensemble import GradientBoostingRegressor",
        "GradientBoostingRegressor",
        "regression",
    ),
    "gradient_boosting_regressor": (
        "from sklearn.ensemble import GradientBoostingRegressor",
        "GradientBoostingRegressor",
        "regression",
    ),
    "xgboostregressor": (
        "from xgboost import XGBRegressor",
        "XGBRegressor",
        "regression",
    ),
    "xgboost_regressor": (
        "from xgboost import XGBRegressor",
        "XGBRegressor",
        "regression",
    ),
    "lightgbmregressor": (
        "from lightgbm import LGBMRegressor",
        "LGBMRegressor",
        "regression",
    ),
    "lightgbm_regressor": (
        "from lightgbm import LGBMRegressor",
        "LGBMRegressor",
        "regression",
    ),
    "supportvectorregression(svr)": (
        "from sklearn.svm import SVR",
        "SVR",
        "regression",
    ),
    "svr": (
        "from sklearn.svm import SVR",
        "SVR",
        "regression",
    ),
    "knearestneighborsregressor(knn)": (
        "from sklearn.neighbors import KNeighborsRegressor",
        "KNeighborsRegressor",
        "regression",
    ),
    "multilayerperceptronregressor(mlp)": (
        "from sklearn.neural_network import MLPRegressor",
        "MLPRegressor",
        "regression",
    ),
    "ridge": (
        "from sklearn.linear_model import Ridge",
        "Ridge",
        "regression",
    ),
    "lasso": (
        "from sklearn.linear_model import Lasso",
        "Lasso",
        "regression",
    ),
}

# Canonical training keys are the values emitted by /api/v1/training-options.
# These entries keep generated code aligned with the executable registries.
_ALGO_CODE_MAP.update({
    "random_forest_classifier": ("from sklearn.ensemble import RandomForestClassifier", "RandomForestClassifier", "classification"),
    "logistic_regression": ("from sklearn.linear_model import LogisticRegression", "LogisticRegression", "classification"),
    "decision_tree_classifier": ("from sklearn.tree import DecisionTreeClassifier", "DecisionTreeClassifier", "classification"),
    "k_nearest_neighbors_classifier": ("from sklearn.neighbors import KNeighborsClassifier", "KNeighborsClassifier", "classification"),
    "support_vector_classifier": ("from sklearn.svm import SVC", "SVC", "classification"),
    "gradient_boosting_classifier": ("from sklearn.ensemble import GradientBoostingClassifier", "GradientBoostingClassifier", "classification"),
    "xgboost_classifier": ("from xgboost import XGBClassifier", "XGBClassifier", "classification"),
    "lightgbm_classifier": ("from lightgbm import LGBMClassifier", "LGBMClassifier", "classification"),
    "gaussian_nb": ("from sklearn.naive_bayes import GaussianNB", "GaussianNB", "classification"),
    "ridge_classifier": ("from sklearn.linear_model import RidgeClassifier", "RidgeClassifier", "classification"),
    "random_forest_regressor": ("from sklearn.ensemble import RandomForestRegressor", "RandomForestRegressor", "regression"),
    "linear_regression": ("from sklearn.linear_model import LinearRegression", "LinearRegression", "regression"),
    "decision_tree_regressor": ("from sklearn.tree import DecisionTreeRegressor", "DecisionTreeRegressor", "regression"),
    "k_nearest_neighbors_regressor": ("from sklearn.neighbors import KNeighborsRegressor", "KNeighborsRegressor", "regression"),
    "support_vector_regressor": ("from sklearn.svm import SVR", "SVR", "regression"),
    "gradient_boosting_regressor": ("from sklearn.ensemble import GradientBoostingRegressor", "GradientBoostingRegressor", "regression"),
    "xgboost_regressor": ("from xgboost import XGBRegressor", "XGBRegressor", "regression"),
    "lightgbm_regressor": ("from lightgbm import LGBMRegressor", "LGBMRegressor", "regression"),
    "ridge_regressor": ("from sklearn.linear_model import Ridge", "Ridge", "regression"),
    "lasso_regressor": ("from sklearn.linear_model import Lasso", "Lasso", "regression"),
})


# ---------------------------------------------------------------------------
# 1. Main Code Generation Entry Point
# ---------------------------------------------------------------------------

def generate_python_code(
    pipeline: PipelineDAG,
    include_comments: bool = True,
    include_evaluation: bool = True,
) -> CodeGenerationResponse:
    """Convert visual pipeline DAG into a clean, standalone, executable Python script.

    Args:
        pipeline: PipelineDAG object containing nodes, parameters, and columns.
        include_comments: If True, includes educational Python code comments.
        include_evaluation: If True, appends evaluation metrics calculation & joblib model saving.

    Returns:
        CodeGenerationResponse containing the Python code, step explanations, syntax validation flag, and import list.
    """
    imports: List[str] = [
        "import pandas as pd",
        "import numpy as np",
        "import joblib",
        "from sklearn.model_selection import train_test_split",
        "from sklearn.compose import ColumnTransformer",
        "from sklearn.pipeline import Pipeline",
    ]

    steps_explanation: List[CodeStepExplanation] = []
    code_blocks: List[str] = []
    step_counter = 1

    # Header & Imports
    if include_comments:
        code_blocks.append("# ==============================================================================")
        code_blocks.append("# MLPlayground Auto-Generated Production Machine Learning Pipeline")
        code_blocks.append("# Target Column: " + pipeline.target_column)
        code_blocks.append("# ==============================================================================\n")

    # Resolve algorithm node
    algo_node = _find_node_by_category(pipeline.nodes, ["algorithm", "model", "classifier", "regressor", "estimator"])
    algo_type = "classification"
    algo_class_name = "RandomForestClassifier"

    if algo_node:
        algo_name_param = str(
            algo_node.params.get("algorithm")
            or algo_node.params.get("type")
            or algo_node.name
        ).lower().replace(" ", "").replace("-", "")
        if algo_name_param in _ALGO_CODE_MAP:
            imp_stmt, class_nm, problem_type = _ALGO_CODE_MAP[algo_name_param]
            if imp_stmt not in imports:
                imports.append(imp_stmt)
            algo_class_name = class_nm
            algo_type = problem_type
        else:
            imports.append("from sklearn.ensemble import RandomForestClassifier")
    else:
        imports.append("from sklearn.ensemble import RandomForestClassifier")

    # Step 1: Load Data
    step1_code = f"""# --- Step 1: Load Dataset ---
dataset_path = "{pipeline.dataset_name}"
df = pd.read_csv(dataset_path)

# Separate input features and target column
feature_cols = {pipeline.feature_columns}
target_col = "{pipeline.target_column}"

X = df[feature_cols]
y = df[target_col]"""

    code_blocks.append(step1_code)
    steps_explanation.append(
        CodeStepExplanation(
            step_number=step_counter,
            node_id="data-loader",
            node_type="dataset_loader",
            title="Load Dataset & Separate Features",
            explanation="Reads data from the specified CSV file and separates feature columns (X) from the target column (y) to be predicted.",
            code_snippet=step1_code,
        )
    )
    step_counter += 1

    # Step 2: Data Preprocessing
    transformers_code: List[str] = []
    imputer_node = _find_node_by_category(pipeline.nodes, ["missing_value_handler", "imputer"])
    scaler_node = _find_node_by_category(pipeline.nodes, ["scaler", "scaling"])
    encoder_node = _find_node_by_category(pipeline.nodes, ["encoder", "encoding"])

    num_steps: List[str] = []
    if imputer_node:
        strategy = str(imputer_node.params.get("strategy", "median")).lower().strip().replace("_", "")
        if "knn" in strategy:
            imports.append("from sklearn.impute import KNNImputer")
            num_steps.append("('imputer', KNNImputer(n_neighbors=5))")
        elif "constant" in strategy or "0" in strategy:
            imports.append("from sklearn.impute import SimpleImputer")
            num_steps.append("('imputer', SimpleImputer(strategy='constant', fill_value=0.0))")
        elif "frequent" in strategy or "mode" in strategy:
            imports.append("from sklearn.impute import SimpleImputer")
            num_steps.append("('imputer', SimpleImputer(strategy='most_frequent'))")
        elif "mean" in strategy:
            imports.append("from sklearn.impute import SimpleImputer")
            num_steps.append("('imputer', SimpleImputer(strategy='mean'))")
        else:
            imports.append("from sklearn.impute import SimpleImputer")
            num_steps.append("('imputer', SimpleImputer(strategy='median'))")
    else:
        imports.append("from sklearn.impute import SimpleImputer")
        num_steps.append("('imputer', SimpleImputer(strategy='median'))")

    if scaler_node:
        scaler_type = str(scaler_node.params.get("scaler_type", "standard")).lower().strip().replace("_", "")
        if "none" in scaler_type or "passthrough" in scaler_type or "raw" in scaler_type:
            pass
        elif "minmax" in scaler_type:
            imports.append("from sklearn.preprocessing import MinMaxScaler")
            num_steps.append("('scaler', MinMaxScaler())")
        elif "robust" in scaler_type:
            imports.append("from sklearn.preprocessing import RobustScaler")
            num_steps.append("('scaler', RobustScaler())")
        elif "maxabs" in scaler_type:
            imports.append("from sklearn.preprocessing import MaxAbsScaler")
            num_steps.append("('scaler', MaxAbsScaler())")
        elif "normalizer" in scaler_type:
            imports.append("from sklearn.preprocessing import Normalizer")
            num_steps.append("('scaler', Normalizer())")
        else:
            imports.append("from sklearn.preprocessing import StandardScaler")
            num_steps.append("('scaler', StandardScaler())")

    step2_code = f"""# --- Step 2: Build Preprocessing Pipeline ---
numeric_transformer = Pipeline(steps=[
    {', '.join(num_steps)}
])

preprocessor = ColumnTransformer(
    transformers=[
        ('num', numeric_transformer, feature_cols)
    ]
)"""

    code_blocks.append("\n" + step2_code)
    steps_explanation.append(
        CodeStepExplanation(
            step_number=step_counter,
            node_id="preprocessing",
            node_type="preprocessing",
            title="Configure Preprocessing Transformers",
            explanation="Imputes missing values and scales numeric feature columns to prepare data for model training.",
            code_snippet=step2_code,
        )
    )
    step_counter += 1

    # Step 3: Train / Test Split
    split_node = _find_node_by_category(pipeline.nodes, ["train_test_split", "split"])
    test_size = float(split_node.params.get("test_size", 0.2)) if split_node else 0.2
    random_seed = int(split_node.params.get("random_seed", 42)) if split_node else 42

    step3_code = f"""# --- Step 3: Train-Test Split ---
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size={test_size}, random_state={random_seed}
)"""

    code_blocks.append("\n" + step3_code)
    steps_explanation.append(
        CodeStepExplanation(
            step_number=step_counter,
            node_id="train-test-split",
            node_type="train_test_split",
            title="Partition Data into Train & Test Sets",
            explanation=f"Splits data into {int((1-test_size)*100)}% training and {int(test_size*100)}% testing subsets using seed {random_seed}.",
            code_snippet=step3_code,
        )
    )
    step_counter += 1

    # Step 4: Model Instantiation & Pipeline Fit
    algo_params_str = ""
    if algo_node and algo_node.params:
        params_items = []
        for k, v in algo_node.params.items():
            if k not in ("algorithm", "type"):
                if isinstance(v, str):
                    params_items.append(f"{k}='{v}'")
                else:
                    params_items.append(f"{k}={v}")
        if params_items:
            algo_params_str = ", " + ", ".join(params_items)

    step4_code = f"""# --- Step 4: Model Pipeline Fit ---
model_pipeline = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('classifier', {algo_class_name}(random_state={random_seed}{algo_params_str}))
])

# Train model pipeline
model_pipeline.fit(X_train, y_train)"""

    code_blocks.append("\n" + step4_code)
    steps_explanation.append(
        CodeStepExplanation(
            step_number=step_counter,
            node_id=algo_node.node_id if algo_node else "model-fit",
            node_type="model_fit",
            title="Train Model Pipeline",
            explanation=f"Fits the entire preprocessing and {algo_class_name} model on the training data.",
            code_snippet=step4_code,
        )
    )
    step_counter += 1

    # Step 5: Evaluation & Artifact Saving
    if include_evaluation:
        if algo_type == "classification":
            imports.append("from sklearn.metrics import accuracy_score, classification_report")
            step5_code = """# --- Step 5: Evaluate & Save Model ---
y_pred = model_pipeline.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
print(f"Test Accuracy: {accuracy:.4f}")
print("\\nClassification Report:\\n", classification_report(y_test, y_pred))

# Save trained pipeline artifact
joblib.dump(model_pipeline, "trained_model_pipeline.joblib")
print("Saved model pipeline to 'trained_model_pipeline.joblib'")"""
        else:
            imports.append("from sklearn.metrics import mean_squared_error, r2_score")
            step5_code = """# --- Step 5: Evaluate & Save Model ---
y_pred = model_pipeline.predict(X_test)
r2 = r2_score(y_test, y_pred)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
print(f"Test R² Score: {r2:.4f}")
print(f"Test RMSE: {rmse:.4f}")

# Save trained pipeline artifact
joblib.dump(model_pipeline, "trained_model_pipeline.joblib")
print("Saved model pipeline to 'trained_model_pipeline.joblib'")"""

        code_blocks.append("\n" + step5_code)
        steps_explanation.append(
            CodeStepExplanation(
                step_number=step_counter,
                node_id="evaluation",
                node_type="evaluation",
                title="Model Evaluation & Export",
                explanation="Evaluates the trained model on test data, prints evaluation metrics, and serializes the binary model pipeline.",
                code_snippet=step5_code,
            )
        )

    # Deduplicate imports
    unique_imports = sorted(set(imports))
    full_script = "\n".join(unique_imports) + "\n\n" + "\n".join(code_blocks)

    # Syntax Validation via AST Parsing
    is_valid_syntax = False
    try:
        ast.parse(full_script)
        is_valid_syntax = True
    except SyntaxError as exc:
        logger.error("Generated Python code has syntax error: %s", exc)

    return CodeGenerationResponse(
        python_code=full_script,
        steps_explanation=steps_explanation,
        is_valid_syntax=is_valid_syntax,
        imports=unique_imports,
    )


# ---------------------------------------------------------------------------
# 2. Pipeline DAG Validator
# ---------------------------------------------------------------------------

def validate_pipeline_dag(pipeline: PipelineDAG) -> PipelineValidationResponse:
    """Validate structural integrity of a visual pipeline DAG.

    Checks:
        - Must have target_column specified
        - Must have non-empty feature_columns list
        - Must contain at least one algorithm node
        - Test size within valid range [0.05, 0.9]

    Returns:
        PipelineValidationResponse object with errors and warnings lists.
    """
    errors: List[str] = []
    warnings: List[str] = []

    if not pipeline.target_column or not pipeline.target_column.strip():
        errors.append("Pipeline target_column cannot be empty.")

    if not pipeline.feature_columns:
        errors.append("Pipeline feature_columns list cannot be empty.")
    elif pipeline.target_column in pipeline.feature_columns:
        errors.append(f"Target column '{pipeline.target_column}' cannot be included in feature_columns (target leakage).")

    if not pipeline.nodes:
        errors.append("Pipeline contains no nodes.")

    algo_nodes = [n for n in pipeline.nodes if n.type.lower() in ("algorithm", "model", "classifier", "regressor", "estimator")]
    if not algo_nodes:
        errors.append("Pipeline is missing an algorithm/model node.")

    split_nodes = [n for n in pipeline.nodes if "split" in n.type.lower()]
    for sn in split_nodes:
        ts = sn.params.get("test_size")
        if ts is not None:
            try:
                ts_val = float(ts)
                if not (0.05 <= ts_val <= 0.9):
                    warnings.append(f"test_size {ts_val} is outside standard recommended range [0.1, 0.5].")
            except (ValueError, TypeError):
                errors.append(f"Invalid test_size parameter value '{ts}'.")

    return PipelineValidationResponse(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# 3. Preset Pipeline Templates
# ---------------------------------------------------------------------------

def get_preset_pipeline_templates() -> Dict[str, PipelineDAG]:
    """Return pre-built visual pipeline templates for standard ML problems."""
    return {
        "binary_classification_rf": PipelineDAG(
            dataset_name="dataset.csv",
            target_column="target",
            feature_columns=["age", "income", "credit_score", "debt_ratio"],
            nodes=[
                PipelineNodeConfig(node_id="n1", type="missing_value_handler", name="Median Imputer", params={"strategy": "median"}),
                PipelineNodeConfig(node_id="n2", type="scaler", name="Standard Scaler", params={"scaler_type": "standard"}),
                PipelineNodeConfig(node_id="n3", type="train_test_split", name="80/20 Train-Test Split", params={"test_size": 0.2, "random_seed": 42}),
                PipelineNodeConfig(node_id="n4", type="algorithm", name="Random Forest Classifier", params={"algorithm": "RandomForestClassifier", "n_estimators": 100}),
            ],
        ),
        "regression_decision_tree": PipelineDAG(
            dataset_name="housing.csv",
            target_column="price",
            feature_columns=["sqft", "bedrooms", "bathrooms", "year_built"],
            nodes=[
                PipelineNodeConfig(node_id="n1", type="missing_value_handler", name="Mean Imputer", params={"strategy": "mean"}),
                PipelineNodeConfig(node_id="n2", type="scaler", name="MinMax Scaler", params={"scaler_type": "minmax"}),
                PipelineNodeConfig(node_id="n3", type="train_test_split", name="75/25 Train-Test Split", params={"test_size": 0.25, "random_seed": 42}),
                PipelineNodeConfig(node_id="n4", type="algorithm", name="Decision Tree Regressor", params={"algorithm": "DecisionTreeRegressor", "max_depth": 10}),
            ],
        ),
    }


# ---------------------------------------------------------------------------
# Internal Helper
# ---------------------------------------------------------------------------

def _find_node_by_category(nodes: List[PipelineNodeConfig], categories: List[str]) -> Optional[PipelineNodeConfig]:
    cat_set = set(c.lower() for c in categories)
    for node in nodes:
        if node.type.lower() in cat_set or any(cat in node.name.lower() for cat in cat_set):
            return node
    return None
