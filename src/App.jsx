import { useState } from "react";
import DataUpload from "./components/DataUpload";
import DataPreview from "./components/DataPreview";

function App() {
  const [dataset, setDataset] = useState(null);

  return (
    <main>
      <h1>MLPlayground</h1>

      <DataUpload onDataLoaded={setDataset} />
      <DataPreview dataset={dataset} />
    </main>
  );
}

export default App;