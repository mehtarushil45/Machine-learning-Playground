"""Contract tests for every published missing-value imputer."""

from __future__ import annotations

import numpy as np
import pytest

from app.ml.imputer_factory import CONSTANT_FILL_VALUE, IMPUTER_REGISTRY, get_imputer


@pytest.mark.parametrize("key", list(IMPUTER_REGISTRY), ids=list(IMPUTER_REGISTRY))
def test_registered_imputer_removes_missing_values(key):
    features = np.array(
        [[1.0, np.nan], [2.0, 3.0], [np.nan, 5.0], [4.0, 7.0], [5.0, 9.0], [6.0, 11.0]]
    )

    transformed = get_imputer(key).fit_transform(features)

    assert transformed.shape == features.shape
    assert not np.isnan(transformed).any()
    if key == "constant":
        assert CONSTANT_FILL_VALUE in transformed


def test_unknown_imputer_is_rejected():
    with pytest.raises(ValueError, match="Unknown imputer"):
        get_imputer("not-an-imputer")
