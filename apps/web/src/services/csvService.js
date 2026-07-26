import Papa from "papaparse";
import { validateParsedCsv } from "../utils/validation.js";

export function createDatasetFromParseResults(results, fileName) {
  return {
    rows: results.data,
    columns: results.meta.fields,
    fileName,
  };
}

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        const validation = validateParsedCsv(results);
        if (!validation.valid) {
          reject(new Error(validation.message));
          return;
        }

        resolve(createDatasetFromParseResults(results, file.name));
      },
      error: () => {
        reject(new Error("Unable to read the CSV file."));
      },
    });
  });
}
