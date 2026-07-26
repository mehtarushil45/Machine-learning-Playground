import { useState } from "react";
import { parseCsvFile } from "../services/csvService.js";
import { validateCsvFile } from "../utils/validation.js";

function DataUpload({ onDataLoaded }) {
  const [error, setError] = useState(null);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];

    setError(null);

    if (!file) return;

    const fileValidation = validateCsvFile(file);
    if (!fileValidation.valid) {
      setError(fileValidation.message);
      return;
    }

    try {
      const dataset = await parseCsvFile(file);
      onDataLoaded(dataset);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section>
      <h2>Upload Dataset</h2>
      <input type="file" accept=".csv" onChange={handleFileChange} />
      {error ? <p>{error}</p> : null}
    </section>
  );
}

export default DataUpload;
