import React, { useState, useRef } from 'react'
import { parseCsvFile } from '../../services/csvService'
import { validateCsvFile, formatBytes } from '../../utils/validation'
import { apiClient } from '../../services/apiClient'
import type { Dataset } from '../../types/dataset'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { Toast } from '../../components/ui/Toast'
import { Badge } from '../../components/ui/Badge'

export interface ApiUploadResponse {
  dataset_id: string
  filename: string
  size_bytes: number
  uploaded_at: string
  status: string
  row_count?: number
  column_count?: number
}

export interface DataUploadProps {
  onDataLoaded: (dataset: Dataset) => void
}

export function DataUpload({ onDataLoaded }: DataUploadProps) {
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadedFileMeta, setUploadedFileMeta] = useState<ApiUploadResponse | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFileToApi = async (file: File): Promise<ApiUploadResponse | null> => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const data = await apiClient.upload<ApiUploadResponse>('/datasets/upload', formData)
      return data
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw err
      }
      return null
    }
  }

  const processFile = async (file: File) => {
    setError(null)
    setUploadedFileMeta(null)

    // 1. Client Validation
    const fileValidation = validateCsvFile(file)
    if (!fileValidation.valid) {
      setError(fileValidation.message ?? 'Invalid CSV file.')
      return
    }

    try {
      setIsProcessing(true)
      setUploadProgress(20)

      // 2. Client Parse for Instant Preview & Column Selection
      const dataset = await parseCsvFile(file)
      setUploadProgress(60)

      // 3. API Endpoint Upload via Authenticated ApiClient
      let apiResponse: ApiUploadResponse | null = null
      try {
        apiResponse = await uploadFileToApi(file)
        setUploadProgress(90)
      } catch (apiErr) {
        // Backend returned a specific validation or size error
        if (apiErr instanceof Error) {
          setError(`API Error: ${apiErr.message}`)
          setIsProcessing(false)
          setUploadProgress(0)
          return
        }
      }

      setUploadProgress(100)

      // Construct metadata if API server was unreachable or in offline mode
      const finalMeta: ApiUploadResponse = apiResponse || {
        dataset_id: `ds-${Date.now().toString(36)}`,
        filename: file.name,
        size_bytes: file.size,
        uploaded_at: new Date().toISOString(),
        status: 'uploaded',
        row_count: dataset.rows.length,
        column_count: dataset.columns.length,
      }

      setUploadedFileMeta(finalMeta)
      const enrichedDataset: Dataset = {
        ...dataset,
        datasetId: finalMeta.dataset_id,
        rowCount: finalMeta.row_count ?? dataset.rows.length,
      }
      onDataLoaded(enrichedDataset)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown parsing error.')
    } finally {
      setIsProcessing(false)
      setTimeout(() => setUploadProgress(0), 500)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fileInputRef.current?.click()
    }
  }

  const resetUpload = () => {
    setUploadedFileMeta(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Card variant="glass" className="mb-6 border-indigo-500/20 shadow-md">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Icon name="upload" size={20} />
            </div>
            <div>
              <CardTitle>Enterprise Dataset Upload</CardTitle>
              <CardDescription>
                Drag & drop or browse a CSV dataset to validate headers, extract metadata, and prepare ML models.
              </CardDescription>
            </div>
          </div>

          {uploadedFileMeta && (
            <Badge variant="success" icon="check">
              Upload Complete
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload CSV File"
        />

        {/* Upload State 1: Success File Card */}
        {uploadedFileMeta ? (
          <div className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-500 mt-0.5">
                  <Icon name="file-text" size={24} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    {uploadedFileMeta.filename}
                    <Badge variant="outline" size="sm">
                      {formatBytes(uploadedFileMeta.size_bytes)}
                    </Badge>
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Uploaded at {new Date(uploadedFileMeta.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ID:{' '}
                    <span className="font-mono text-[10px]">{uploadedFileMeta.dataset_id.slice(0, 8)}...</span>
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                leftIcon="refresh-cw"
              >
                Replace File
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-emerald-500/20 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Status</span>
                <span className="font-semibold text-emerald-500 capitalize">{uploadedFileMeta.status}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">File Size</span>
                <span className="font-mono font-medium">{formatBytes(uploadedFileMeta.size_bytes)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Rows Detected</span>
                <span className="font-mono font-medium">{uploadedFileMeta.row_count ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Columns</span>
                <span className="font-mono font-medium">{uploadedFileMeta.column_count ?? '—'}</span>
              </div>
            </div>
          </div>
        ) : (
          /* Upload State 2: Drag & Drop Zone */
          <div
            role="button"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Drag and drop CSV file here or press enter to browse"
            className={`group relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer text-center outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              isDragOver
                ? 'border-primary bg-primary/10 scale-[1.01] shadow-lg'
                : 'border-border hover:border-primary/60 bg-muted/20 hover:bg-primary/5'
            }`}
          >
            <div className="mb-3 p-3.5 rounded-full bg-secondary group-hover:scale-110 transition-transform duration-200 shadow-xs">
              <Icon name="upload" size={26} className="text-primary" />
            </div>

            <p className="text-sm font-semibold text-foreground mb-1">
              Drag & drop your CSV dataset here
            </p>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm">
              Supports CSV files up to 50 MB with header rows and numerical feature columns.
            </p>

            <Button
              variant="primary"
              size="sm"
              isLoading={isProcessing}
              leftIcon="search"
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              Browse Files
            </Button>
          </div>
        )}

        {/* Upload Progress Bar */}
        {isProcessing || uploadProgress > 0 ? (
          <div className="mt-4 space-y-1.5" aria-live="polite">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Icon name="loader-2" size={14} className="animate-spin text-primary" />
                Uploading & parsing CSV file...
              </span>
              <span className="font-mono">{uploadProgress}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Error Notification */}
        {error ? (
          <div className="mt-4">
            <Toast
              variant="error"
              title="Upload Validation Error"
              description={error}
              onClose={() => setError(null)}
            >
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetUpload}
                  className="text-xs h-7"
                >
                  Try Again
                </Button>
              </div>
            </Toast>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
