import { useState } from 'react'
import { parseCsvFile } from '../services/csvService'
import { validateCsvFile } from '../utils/validation'
import type { Dataset } from '../types/dataset'

interface DataUploadProps {
  onDataLoaded: (dataset: Dataset) => void
}

function DataUpload({ onDataLoaded }: DataUploadProps) {
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    setError(null)

    if (!file) return

    const fileValidation = validateCsvFile(file)
    if (!fileValidation.valid) {
      setError(fileValidation.message ?? 'Invalid file.')
      return
    }

    try {
      const dataset = await parseCsvFile(file)
      onDataLoaded(dataset)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error.')
    }
  }

  return (
    <section>
      <h2>Upload Dataset</h2>
      <input type="file" accept=".csv" onChange={handleFileChange} />
      {error ? <p>{error}</p> : null}
    </section>
  )
}

export default DataUpload
