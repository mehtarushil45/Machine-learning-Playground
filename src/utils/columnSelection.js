export function toggleFeatureColumn(selectedFeatures, column, selectedTarget) {
  if (column === selectedTarget) {
    return selectedFeatures;
  }

  if (selectedFeatures.includes(column)) {
    return selectedFeatures.filter((name) => name !== column);
  }

  return [...selectedFeatures, column];
}

export function selectTargetColumn(column, selectedFeatures) {
  return {
    selectedTarget: column,
    selectedFeatures: selectedFeatures.filter((name) => name !== column),
  };
}
