function isMissing(value) {
  return value === null || value === undefined || value === "";
}

export function isNumericColumn(column, rows) {
  let hasNonMissingValue = false;

  for (const row of rows) {
    const value = row[column];

    if (isMissing(value)) {
      continue;
    }

    hasNonMissingValue = true;

    if (typeof value !== "number" || Number.isNaN(value)) {
      return false;
    }
  }

  return hasNonMissingValue;
}

export function getNumericColumns(columns, rows) {
  return columns.filter((column) => isNumericColumn(column, rows));
}
