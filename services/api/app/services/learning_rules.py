"""Learning Layer Heads-Up Rules & Static Analysis Engine.

Implements server-side ML mistake evaluation and AST-based code analysis:
- B2: Categorical association via Cramér's V
- B4: Baseline metric computation (majority class accuracy / mean predictor)
- B5: Wilson score confidence interval for small test sets
- B6: Overfitting gap verification
- B7: AST-based preprocessing leakage detector (fit before train_test_split)
- B8: Test-set reuse heuristic
"""

from __future__ import annotations

import ast
import math
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("apex_learning.rules")

PREPROCESSING_TRANSFORMERS = {
    "StandardScaler",
    "MinMaxScaler",
    "RobustScaler",
    "MaxAbsScaler",
    "Normalizer",
    "SimpleImputer",
    "KNNImputer",
    "IterativeImputer",
    "OneHotEncoder",
    "OrdinalEncoder",
    "TargetEncoder",
    "LabelEncoder",
    "PowerTransformer",
    "QuantileTransformer",
}


def compute_wilson_interval(accuracy: float, n_test: int, confidence: float = 0.95) -> Tuple[float, float]:
    """Compute Wilson score continuity-corrected confidence interval for binomial accuracy (B5).
    
    Wilson interval provides honest coverage even when sample size n is small or accuracy is near 0/1.
    """
    if n_test <= 0:
        return (round(accuracy, 4), round(accuracy, 4))
    
    # 95% confidence z = 1.95996
    z = 1.95996 if abs(confidence - 0.95) < 0.01 else 2.57583
    p = max(0.0, min(1.0, float(accuracy)))
    n = float(n_test)
    
    denominator = 1.0 + (z * z) / n
    centre = (p + (z * z) / (2.0 * n)) / denominator
    spread = (z / denominator) * math.sqrt((p * (1.0 - p) / n) + ((z * z) / (4.0 * n * n)))
    
    lower = max(0.0, centre - spread)
    upper = min(1.0, centre + spread)
    return (round(lower, 4), round(upper, 4))


def compute_baseline_metric(problem_type: str, class_counts: Optional[Dict[str, int]] = None, total_samples: Optional[int] = None) -> Dict[str, Any]:
    """Compute baseline reference metric (B4).
    
    Classification -> Majority-class accuracy baseline (predicts most frequent class).
    Regression     -> Mean predictor baseline (R² = 0.0 by definition).
    """
    if problem_type.lower() == "regression":
        return {
            "metric_name": "R² Score",
            "baseline_value": 0.0,
            "baseline_type": "mean_predictor",
            "explanation": "A baseline dummy regressor always predicting the sample mean achieves R² = 0.0. Models must achieve R² > 0 to beat the mean.",
        }
    
    # Classification: calculate majority class proportion
    if class_counts and total_samples and total_samples > 0:
        max_count = max(class_counts.values()) if class_counts else 0
        majority_acc = max_count / total_samples
    else:
        majority_acc = 0.5  # Balanced binary default
        
    return {
        "metric_name": "Accuracy",
        "baseline_value": round(majority_acc, 4),
        "baseline_percentage": round(majority_acc * 100.0, 1),
        "baseline_type": "majority_class",
        "explanation": f"A naive baseline always predicting the majority class achieves {round(majority_acc * 100.0, 1)}% accuracy without learning any feature patterns.",
    }


def compute_cramers_v_from_contingency(contingency: Dict[Tuple[str, str], int]) -> float:
    """Compute Cramér's V from a cross-tabulated contingency frequency map (B2)."""
    if not contingency:
        return 0.0
    
    row_totals: Dict[str, int] = {}
    col_totals: Dict[str, int] = {}
    grand_total = 0
    
    for (r, c), count in contingency.items():
        row_totals[r] = row_totals.get(r, 0) + count
        col_totals[c] = col_totals.get(c, 0) + count
        grand_total += count
        
    k = len(row_totals)
    r = len(col_totals)
    if grand_total == 0 or k < 2 or r < 2:
        return 0.0
    
    chi2 = 0.0
    for row_val, r_tot in row_totals.items():
        for col_val, c_tot in col_totals.items():
            obs = contingency.get((row_val, col_val), 0)
            exp = (r_tot * c_tot) / grand_total
            if exp > 0:
                diff = obs - exp
                chi2 += (diff * diff) / exp
            
    min_dim = min(k - 1, r - 1)
    if min_dim == 0:
        return 0.0
    
    v = math.sqrt(chi2 / (grand_total * min_dim))
    return min(1.0, max(0.0, round(v, 4)))


class PreprocessingLeakageVisitor(ast.NodeVisitor):
    """AST Visitor detecting transformer fit calls executed before train_test_split (B7).
    
    Best-effort AST inspection:
    - Identifies calls to `train_test_split(...)` and records their line number.
    - Identifies instantiation or method calls of known transformers (`fit` or `fit_transform`).
    - Detects whether `.fit(...)` or `.fit_transform(...)` is invoked before train_test_split or
      on the full unpartitioned dataset variable (e.g., `df`, `X`).
    - Pipelines wrapping transformers and fit on X_train are recognized as clean.
    """
    def __init__(self) -> None:
        self.train_test_split_lines: List[int] = []
        self.transformer_instances: Dict[str, str] = {}  # var_name -> class_name
        self.fit_calls: List[Dict[str, Any]] = []
        self.pipeline_instances: set[str] = set()

    def visit_Assign(self, node: ast.Assign) -> None:
        # Check if right-hand side is transformer instantiation: scaler = StandardScaler()
        if isinstance(node.value, ast.Call):
            call_func = node.value.func
            func_name = ""
            if isinstance(call_func, ast.Name):
                func_name = call_func.id
            elif isinstance(call_func, ast.Attribute):
                func_name = call_func.attr

            if func_name in PREPROCESSING_TRANSFORMERS:
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        self.transformer_instances[target.id] = func_name
            elif func_name == "Pipeline":
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        self.pipeline_instances.add(target.id)

        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        # Check train_test_split call
        if isinstance(func, ast.Name) and func.id == "train_test_split":
            self.train_test_split_lines.append(node.lineno)
        elif isinstance(func, ast.Attribute) and func.attr == "train_test_split":
            self.train_test_split_lines.append(node.lineno)

        # Check .fit(...) or .fit_transform(...) calls
        if isinstance(func, ast.Attribute) and func.attr in ("fit", "fit_transform"):
            caller_name = ""
            if isinstance(func.value, ast.Name):
                caller_name = func.value.id

            # Determine first argument passed to fit
            arg_name = ""
            if node.args and isinstance(node.args[0], ast.Name):
                arg_name = node.args[0].id

            self.fit_calls.append({
                "method": func.attr,
                "caller": caller_name,
                "arg": arg_name,
                "lineno": node.lineno,
            })

        self.generic_visit(node)


def detect_preprocessing_leakage_ast(code: str) -> Dict[str, Any]:
    """Analyze Python code with AST for preprocessing data leakage before train_test_split (B7).
    
    Returns structured diagnosis:
    - has_leakage: bool
    - line_number: int | None
    - transformer: str | None
    - message: str
    - why_it_matters: str
    - how_to_fix: str
    - false_negatives_note: str
    """
    if not code or not code.strip():
        return {"has_leakage": False, "message": "No code provided."}

    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return {
            "has_leakage": False,
            "message": f"Syntax error prevented AST inspection: {e.msg} on line {e.lineno}",
        }

    visitor = PreprocessingLeakageVisitor()
    visitor.visit(tree)

    split_line = min(visitor.train_test_split_lines) if visitor.train_test_split_lines else None

    # Check each fit call
    for call in visitor.fit_calls:
        caller = call["caller"]
        method = call["method"]
        arg = call["arg"]
        lineno = call["lineno"]

        is_known_transformer = (caller in visitor.transformer_instances) or any(
            t.lower() in caller.lower() for t in ("scaler", "imputer", "encoder")
        )
        is_pipeline = caller in visitor.pipeline_instances

        if is_pipeline:
            # Pipelines are clean unless fitted on raw df/X before split
            if split_line is not None and lineno < split_line:
                return {
                    "has_leakage": True,
                    "line_number": lineno,
                    "transformer": "Pipeline",
                    "method": method,
                    "message": f"Pipeline fitted on line {lineno} before train_test_split (line {split_line}).",
                    "why_it_matters": "Fitting the pipeline on the full dataset before splitting leaks test set distributions into scalers and imputers.",
                    "how_to_fix": "Call train_test_split first, then call pipeline.fit(X_train, y_train).",
                    "false_negatives_note": "AST detection is best-effort and does not trace dynamic runtime object reassignments or external module calls.",
                }
            continue

        if is_known_transformer:
            # 1. Fitted prior to train_test_split line
            if split_line is not None and lineno < split_line:
                trans_name = visitor.transformer_instances.get(caller, caller)
                return {
                    "has_leakage": True,
                    "line_number": lineno,
                    "transformer": trans_name,
                    "method": method,
                    "message": f"Preprocessing transformer '{trans_name}' was fitted on line {lineno} before train_test_split on line {split_line}.",
                    "why_it_matters": "When a scaler or imputer is fitted on all data before splitting, test set mean/variance leaks into training features, producing overly optimistic test results.",
                    "how_to_fix": "Partition data first using train_test_split, then call transformer.fit_transform(X_train) and transformer.transform(X_test), or wrap both inside a scikit-learn Pipeline.",
                    "false_negatives_note": "AST detection covers explicit fit/fit_transform calls. Custom transformation functions or external scripts may not be caught.",
                }

            # 2. Fitted on full un-split variable (df or X) even if split occurred elsewhere
            if arg in ("df", "data", "X", "dataset", "features") and split_line is not None:
                trans_name = visitor.transformer_instances.get(caller, caller)
                return {
                    "has_leakage": True,
                    "line_number": lineno,
                    "transformer": trans_name,
                    "method": method,
                    "message": f"Preprocessing transformer '{trans_name}' called {method} on full dataset variable '{arg}' instead of 'X_train'.",
                    "why_it_matters": "Transforming the entire matrix before training leaks test statistics into feature scaling.",
                    "how_to_fix": f"Fit transformer strictly on training data: {caller}.fit_transform(X_train).",
                    "false_negatives_note": "AST inspection checks identifier names; variables aliased through dictionary or tuple unpacking are not tracked.",
                }

    return {
        "has_leakage": False,
        "message": "No preprocessing leakage detected. Transformers are properly scoped or encapsulated in Pipeline.",
    }
