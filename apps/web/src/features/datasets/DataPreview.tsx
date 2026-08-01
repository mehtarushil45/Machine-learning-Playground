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
    return dataset.rows.slice(0, 12)
  }, [dataset])

  // Mini-histogram distribution calculator per column
  const columnStats = useMemo(() => {
    if (!dataset) return {}
    const stats: Record<string, { missingCount: number; fillRatio: number; bars: number[] }> = {}

    dataset.columns.forEach((col) => {
      let missing = 0
      const vals: number[] = []

      dataset.rows.forEach((row) => {
        const v = row[col]
        if (v === null || v === undefined || v === '' || v === 'N/A' || v === 'NaN') {
          missing++
        } else {
          const num = Number(v)
          if (!isNaN(num)) vals.push(num)
        }
      })

      // Generate 5 mini-histogram bins
      let bars = [40, 60, 90, 50, 30]
      if (vals.length > 0) {
        const min = Math.min(...vals)
        const max = Math.max(...vals)
        const range = max - min || 1
        const binCounts = [0, 0, 0, 0, 0]
        vals.forEach((v) => {
          const idx = Math.min(Math.floor(((v - min) / range) * 5), 4)
          binCounts[idx]++
        })
        const maxBin = Math.max(...binCounts) || 1
        bars = binCounts.map((c) => Math.max(15, Math.round((c / maxBin) * 100)))
      }

      stats[col] = {
        missingCount: missing,
        fillRatio: (dataset.rows.length - missing) / (dataset.rows.length || 1),
        bars,
      }
    })

    return stats
  }, [dataset])

  if (!dataset) {
    return (
      <Card variant="outline" className="mb-6 border-dashed p-8 text-center bg-slate-900/40">
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="p-3 rounded-full bg-slate-800 text-slate-400">
            <Icon name="table" size={24} />
          </div>
          <p className="text-sm font-medium text-slate-400">
            No dataset uploaded yet. Upload a CSV file above to preview data rows.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card variant="default" className="bg-slate-900/80 border-slate-800">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Icon name="table" size={20} />
            </div>
            <div>
              <CardTitle className="text-white font-bold">Sticky Dataset Data Grid</CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Previewing top {previewRows.length} rows out of {dataset.rows.length} total rows with column distribution mini-histograms.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="primary" icon="file-text">
              {dataset.fileName}
            </Badge>
            <Badge variant="outline" className="text-slate-300 border-slate-700">
              {dataset.rows.length} Rows
            </Badge>
            <Badge variant="outline" className="text-slate-300 border-slate-700">
              {dataset.columns.length} Columns
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[500px] border-t border-slate-800">
          <Table className="w-full">
            <TableHeader className="bg-slate-950 sticky top-0 z-10">
              <TableRow className="border-b border-slate-800 hover:bg-transparent">
                {dataset.columns.map((column) => {
                  const stat = columnStats[column]
                  return (
                    <TableHead key={column} className="p-3 text-left">
                      <div className="space-y-1.5 min-w-[120px]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-200 truncate">{column}</span>
                          {stat?.missingCount > 0 && (
                            <span className="text-[10px] text-amber-400 font-mono font-semibold">
                              {stat.missingCount} null
                            </span>
                          )}
                        </div>
                        {/* Column Distribution Mini-Histogram */}
                        <div className="flex items-end gap-0.5 h-4 bg-slate-900 p-0.5 rounded border border-slate-800">
                          {stat?.bars.map((h, i) => (
                            <div
                              key={i}
                              style={{ height: `${h}%` }}
                              className="flex-1 bg-gradient-to-t from-indigo-600 to-cyan-400 rounded-xs"
                            />
                          ))}
                        </div>
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-slate-800/60 bg-slate-950/40">
              {previewRows.map((row, rowIndex) => (
                <TableRow key={rowIndex} className="hover:bg-slate-900/60 transition-colors">
                  {dataset.columns.map((column) => {
                    const val = row[column]
                    const isCellMissing =
                      val === null ||
                      val === undefined ||
                      val === '' ||
                      val === 'N/A' ||
                      val === 'NaN'

                    return (
                      <TableCell key={`${rowIndex}-${column}`} className="p-3">
                        {isCellMissing ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                            Missing
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-slate-200">
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
        </div>
      </CardContent>
    </Card>
  )
})
