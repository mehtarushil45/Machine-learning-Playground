import { useState } from "react";
import DataUpload from "./components/DataUpload";
import DataPreview from "./components/DataPreview";
import ColumnSelector from "./components/ColumnSelector";

function App() {
  const [dataset, setDataset] = useState(null);
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);

  const handleDataLoaded = (loadedDataset) => {
    setDataset(loadedDataset);
    setSelectedFeatures([]);
    setSelectedTarget(null);
  };

  return (
    <main>
      <h1>MLPlayground</h1>

      <DataUpload onDataLoaded={handleDataLoaded} />
      <DataPreview dataset={dataset} />
      {dataset ? (
        <ColumnSelector
          dataset={dataset}
          selectedFeatures={selectedFeatures}
          selectedTarget={selectedTarget}
          onSelectedFeaturesChange={setSelectedFeatures}
          onSelectedTargetChange={setSelectedTarget}
        />
      ) : null}
    </main>
  );
}

export default App;
