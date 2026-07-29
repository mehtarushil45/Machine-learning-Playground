import { memo, useMemo } from 'react'
import type { Dataset } from '../../types/dataset'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { Icon } from '../../components/ui/Icon'

export interface DataPreviewProps {
  dataset: Dataset | null
}

export const DataPreview = memo(function DataPreview({ dataset }: DataPreviewProps) {
  const previewRows = useMemo(() => {
    if (!dataset) return []
    return dataset.rows.slice(0, 10)
  }, [dataset])

  if (!dataset) {
    return (
      <Card variant="outline" className="mb-6 border-dashed p-8 text-center">
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="p-3 rounded-full bg-muted/50 text-muted-foreground">
            <Icon name="table" size={24} />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No dataset uploaded yet. Upload a CSV file above to preview data rows.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card variant="default">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Icon name="table" size={20} />
            </div>
            <div>
              <CardTitle>Dataset Preview</CardTitle>
              <CardDescription>
                Previewing top {previewRows.length} rows out of {dataset.rows.length} total rows.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="primary" icon="file-text">
              {dataset.fileName}
            </Badge>
            <Badge variant="outline">
              {dataset.rows.length} Rows
            </Badge>
            <Badge variant="outline">
              {dataset.columns.length} Columns
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {dataset.columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {previewRows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {dataset.columns.map((column) => {
                  const val = row[column]
                  const isCellMissing =
                    val === null ||
                    val === undefined ||
                    val === '' ||
                    val === 'N/A' ||
                    val === 'NaN'

                  return (
                    <TableCell key={`${rowIndex}-${column}`}>
                      {isCellMissing ? (
                        <Badge variant="warning" size="sm">
                          Missing
                        </Badge>
                      ) : (
                        <span className="font-mono text-xs text-foreground/90">
                          {String(val)}
                        </span>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
})
