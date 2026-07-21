import Papa from "papaparse";

function DataUpload({ onDataLoaded }) {
  const handleFileChange = (event) => {
    const file = event.target.files[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a valid CSV file.");
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        if (!results.data.length || !results.meta.fields?.length) {
          alert("The CSV file is empty or invalid.");
          return;
        }

        onDataLoaded({
          rows: results.data,
          columns: results.meta.fields,
          fileName: file.name,
        });
      },
      error: () => {
        alert("Unable to read the CSV file.");
      },
    });
  };

  return (
    <section>
      <h2>Upload Dataset</h2>
      <input type="file" accept=".csv" onChange={handleFileChange} />
    </section>
  );
}

export default DataUpload;