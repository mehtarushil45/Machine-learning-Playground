"""Model Factory compatibility shim.

This file previously contained a simplified duplicate of the ML model factory.
It now delegates to the canonical implementation at:

    services/api/app/ml/model_factory.py

ALL imports from the canonical factory are deferred inside function bodies to
break the circular import chain:

    app.ml.dataset_loader
        → services.worker.core.dataset_loader (find_dataset_path)
            → services.worker.core.__init__
                → services.worker.core.model_factory  ← this file
                    ↳ (lazy) → app.ml.model_factory → app.ml.problem_detector
                                → app.ml.dataset_loader  [already initialized by then]

Compatibility adapter:
    The canonical create_model() signature is (algorithm, problem_type, random_state).
    The legacy worker call-sites use (algorithm, random_seed=42).
    The adapter below preserves backward-compatibility while routing through the
    full registry (XGBoost, LightGBM, Ridge, Lasso, etc.).
"""

from __future__ import annotations

from typing import Any


def create_model(algorithm: str, random_seed: int = 42) -> Any:
    """Compatibility shim for legacy (algorithm, random_seed) call-sites.

    Delegates to the canonical model factory with automatic problem-type
    inference from the algorithm name: names containing 'Regressor' or
    'Regression' use ProblemType.REGRESSION; all others use
    ProblemType.BINARY_CLASSIFICATION.

    All imports are deferred to avoid circular imports at module load time.
    """
    # Deferred imports — do NOT hoist these to module level
    from app.ml.model_factory import create_model as _canonical_create_model  # noqa: PLC0415
    from app.ml.problem_detector import ProblemType  # noqa: PLC0415

    algo_lower = algorithm.lower()
    if "regressor" in algo_lower or "regression" in algo_lower:
        problem_type = ProblemType.REGRESSION
    else:
        problem_type = ProblemType.BINARY_CLASSIFICATION

    return _canonical_create_model(
        algorithm=algorithm,
        problem_type=problem_type,
        random_state=random_seed,
    )


def list_supported_algorithms() -> dict:
    """Return supported algorithm names grouped by task.

    Deferred import to avoid circular references at module load time.
    """
    from app.ml.model_factory import list_supported_algorithms as _list  # noqa: PLC0415
    return _list()
