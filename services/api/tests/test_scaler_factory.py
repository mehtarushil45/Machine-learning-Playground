"""Contract tests for every published feature scaler."""

from __future__ import annotations

import numpy as np
import pytest

from app.ml.scaler_factory import SCALER_REGISTRY, get_scaler


@pytest.mark.parametrize("key", list(SCALER_REGISTRY), ids=list(SCALER_REGISTRY))
def test_registered_scaler_transforms_unscaled_features(key):
    features = np.array([[10.0, 100.0], [20.0, 300.0], [40.0, 600.0], [80.0, 1000.0]])

    transformed = get_scaler(key).fit_transform(features)

    assert transformed.shape == features.shape
    assert np.isfinite(transformed).all()
    assert not np.allclose(transformed, features)


def test_unknown_scaler_is_rejected():
    with pytest.raises(ValueError, match="Unknown scaler"):
        get_scaler("not-a-scaler")
