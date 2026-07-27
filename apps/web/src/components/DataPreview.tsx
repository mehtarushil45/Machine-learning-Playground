import type { Dataset } from '../types/dataset'

interface DataPreviewProps {
  dataset: Dataset | null
}

function DataPreview({ dataset }: DataPreviewProps) {
  if (!dataset) {
    return <p>No dataset uploaded yet.</p>
  }

  const previewRows = dataset.rows.slice(0, 10)

  return (
    <section>
      <h2>Dataset Preview</h2>

      <p>
        <strong>File:</strong> {dataset.fileName}
      </p>

      <p>
        <strong>Rows:</strong> {dataset.rows.length} |{' '}
        <strong>Columns:</strong> {dataset.columns.length}
      </p>

      <div style={{ overflowX: 'auto' }}>
        {/* border / cellPadding are numeric attrs in React's HTMLTableElement */}
        <table border={1} cellPadding={8}>
          <thead>
            <tr>
              {dataset.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {dataset.columns.map((column) => (
                  <td key={`${rowIndex}-${column}`}>
                    {row[column] === null ||
                    row[column] === undefined ||
                    row[column] === ''
                      ? 'Missing'
                      : String(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default DataPreview
