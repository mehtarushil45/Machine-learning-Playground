export function toggleFeatureColumn(
  selectedFeatures: string[],
  column: string,
  selectedTarget: string | null,
): string[] {
  if (column === selectedTarget) {
    return selectedFeatures
  }

  if (selectedFeatures.includes(column)) {
    return selectedFeatures.filter((name) => name !== column)
  }

  return [...selectedFeatures, column]
}

export function selectTargetColumn(
  column: string,
  selectedFeatures: string[],
): { selectedTarget: string; selectedFeatures: string[] } {
  return {
    selectedTarget: column,
    selectedFeatures: selectedFeatures.filter((name) => name !== column),
  }
}
