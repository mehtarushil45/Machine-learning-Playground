import React, { useState, useRef } from 'react'
import { parseCsvFile } from '../../services/csvService'
import { validateCsvFile, formatBytes } from '../../utils/validation'
import { apiClient } from '../../services/apiClient'
import type { Dataset } from '../../types/dataset'

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

/* ── Brand tokens ──────────────────────────────────────────────────────── */
const BB = {
  base:        '#0B0912',
  surface:     '#1B1530',
  elevated:    '#2A2247',
  border:      'rgba(107,92,166,0.18)',
  borderHover: 'rgba(107,92,166,0.38)',
  primary:     '#4B3B7C',
  primaryLight:'#6C5CA6',
  maroon:      '#6E1423',
  maroonLight: '#B23A4E',
  gold:        '#C9A24B',
  text:        '#F5F1EC',
  muted:       '#9E93B8',
  disabled:    '#3D3558',
  success:     '#22c55e',
} as const;

/* ── Curated Benchmark Datasets ────────────────────────────────────────── */
interface BenchmarkDataset {
  id:         string;
  emoji:      string;
  name:       string;
  task:       'Regression' | 'Classification';
  rows:       number;
  cols:       number;
  target:     string;
  features:   string[];
  headerRow:  string;
  sampleRows: string[];
}

const BENCHMARK_DATASETS: BenchmarkDataset[] = [
  {
    id:      'student_exams',
    emoji:   '🎓',
    name:    'Student Performance',
    task:    'Regression',
    rows:    15,
    cols:    9,
    target:  'study_hours',
    features:['age', 'attendance_percent', 'final_score', 'course'],
    headerRow:  'student_id,age,study_hours,attendance_percent,final_score,city,course,passed,remarks',
    sampleRows: [
      '1001,18,2.5,72,48,Vadodara,Science,0,Needs support',
      '1002,19,4.0,85,67,Ahmedabad,Commerce,1,Regular learner',
      '1003,18,6.5,92,84,Surat,Science,1,Strong performance',
      '1004,20,,78,55,Rajkot,Arts,0,Study hours missing',
      '1005,19,5.0,88,73,Vadodara,Commerce,1,',
      '1006,21,1.5,65,39,Ahmedabad,Arts,0,Low attendance',
      '1007,20,7.0,95,91,Surat,Science,1,Excellent',
      '1008,18,3.5,,61,Rajkot,Commerce,1,Attendance missing',
      '1009,19,2.0,70,,Vadodara,Arts,0,Score missing',
      '1010,20,4.5,80,72,Ahmedabad,Science,1,',
      '1011,18,3.0,68,52,Surat,Commerce,0,Needs support',
      '1012,21,5.5,90,80,Rajkot,Science,1,Good performance',
      '1013,19,1.0,60,35,Vadodara,Arts,0,Low attendance',
      '1014,20,6.0,88,85,Ahmedabad,Science,1,',
      '1015,18,4.0,75,63,Surat,Commerce,1,Regular learner',
    ],
  },
  {
    id:      'california_housing',
    emoji:   '🏠',
    name:    'Housing Prices',
    task:    'Regression',
    rows:    20,
    cols:    9,
    target:  'median_house_value',
    features:['longitude', 'latitude', 'housing_median_age', 'total_rooms', 'total_bedrooms', 'population', 'households', 'median_income'],
    headerRow:  'longitude,latitude,housing_median_age,total_rooms,total_bedrooms,population,households,median_income,median_house_value',
    sampleRows: [
      '-122.23,37.88,41,880,129,322,126,8.3252,452600',
      '-122.22,37.86,21,7099,1106,2401,1138,8.3014,358500',
      '-122.24,37.85,52,1467,190,496,177,7.2574,352100',
      '-122.25,37.85,52,1274,235,558,219,5.6431,341300',
      '-122.25,37.85,52,1627,280,565,259,3.8462,342200',
      '-122.25,37.85,52,919,213,413,193,4.0368,269700',
      '-122.25,37.84,52,2535,489,1094,514,3.6591,299200',
      '-122.25,37.84,52,3104,687,1157,647,3.12,241400',
      '-122.26,37.84,42,2555,665,1206,595,2.0804,226700',
      '-122.25,37.84,52,3549,707,1551,714,3.6912,261100',
      '-122.26,37.85,52,2202,434,910,402,3.2031,281500',
      '-122.26,37.85,52,3503,752,1504,734,3.2705,241800',
      '-122.26,37.85,52,2491,474,1098,468,3.075,213500',
      '-122.26,37.84,52,696,191,345,174,2.6736,191300',
      '-122.26,37.85,52,2643,626,1212,620,1.9167,159200',
      '-122.26,37.85,50,1120,283,697,264,2.125,140000',
      '-122.27,37.85,52,1966,347,793,331,2.775,152500',
      '-122.27,37.85,52,1228,293,648,303,2.1202,155500',
      '-122.26,37.84,50,2239,455,990,419,1.9911,158700',
      '-122.27,37.84,52,1503,298,690,275,2.6033,162500',
    ],
  },
  {
    id:      'titanic',
    emoji:   '🚢',
    name:    'Titanic Survival',
    task:    'Classification',
    rows:    20,
    cols:    8,
    target:  'Survived',
    features:['Pclass', 'Age', 'SibSp', 'Parch', 'Fare'],
    headerRow:  'PassengerId,Survived,Pclass,Name,Sex,Age,SibSp,Parch,Fare',
    sampleRows: [
      '1,0,3,Braund Mr. Owen Harris,male,22,1,0,7.25',
      '2,1,1,Cumings Mrs. John Bradley,female,38,1,0,71.2833',
      '3,1,3,Heikkinen Miss. Laina,female,26,0,0,7.925',
      '4,1,1,Futrelle Mrs. Jacques Heath,female,35,1,0,53.1',
      '5,0,3,Allen Mr. William Henry,male,35,0,0,8.05',
      '6,0,3,Moran Mr. James,male,,0,0,8.4583',
      '7,0,1,McCarthy Mr. Timothy J,male,54,0,0,51.8625',
      '8,0,3,Palsson Master. Gosta Leonard,male,2,3,1,21.075',
      '9,1,3,Johnson Mrs. Oscar W,female,27,0,2,11.1333',
      '10,1,2,Nasser Mrs. Nicholas,female,14,1,0,30.0708',
      '11,1,3,Sandstrom Miss. Marguerite Rut,female,4,1,1,16.7',
      '12,1,1,Bonnell Miss. Elizabeth,female,58,0,0,26.55',
      '13,0,3,Saundercock Mr. William Henry,male,20,0,0,8.05',
      '14,0,3,Andersson Mr. Anders Johan,male,39,1,5,31.275',
      '15,0,3,Vestrom Miss. Hulda Amanda Adolfina,female,14,0,0,7.8542',
      '16,1,2,Hewlett Mrs. Mary D Kingcome,female,55,0,0,16.0',
      '17,0,3,Rice Master. Eugene,male,2,4,1,29.125',
      '18,1,2,Williams Mr. Charles Eugene,male,,0,0,13.0',
      '19,0,3,Vander Planke Mrs. Julius,female,31,1,0,18.0',
      '20,1,3,Masselmani Mrs. Fatima,female,,0,0,7.225',
    ],
  },
];

function buildCsvBlob(ds: BenchmarkDataset): File {
  const content = [ds.headerRow, ...ds.sampleRows].join('\n');
  const blob = new Blob([content], { type: 'text/csv' });
  return new File([blob], `${ds.id}.csv`, { type: 'text/csv' });
}

export function DataUpload({ onDataLoaded }: DataUploadProps) {
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadedFileMeta, setUploadedFileMeta] = useState<ApiUploadResponse | null>(null)
  const [loadingBenchmark, setLoadingBenchmark] = useState<string | null>(null)
  const [hoveredBenchmark, setHoveredBenchmark] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFileToApi = async (file: File): Promise<ApiUploadResponse | null> => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const data = await apiClient.upload<ApiUploadResponse>('/datasets/upload', formData)
      return data
    } catch (err: unknown) {
      if (err instanceof Error) throw err
      return null
    }
  }

  const processFile = async (file: File) => {
    setError(null)
    setUploadedFileMeta(null)
    const fileValidation = validateCsvFile(file)
    if (!fileValidation.valid) {
      setError(fileValidation.message ?? 'Invalid CSV file.')
      return
    }
    try {
      setIsProcessing(true)
      setUploadProgress(20)
      const dataset = await parseCsvFile(file)
      setUploadProgress(60)
      let apiResponse: ApiUploadResponse | null = null
      try {
        apiResponse = await uploadFileToApi(file)
        setUploadProgress(90)
      } catch (apiErr) {
        if (apiErr instanceof Error) {
          setError(`API Error: ${apiErr.message}`)
          setIsProcessing(false)
          setUploadProgress(0)
          return
        }
      }
      setUploadProgress(100)
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

  const handleBenchmarkLoad = async (ds: BenchmarkDataset) => {
    setLoadingBenchmark(ds.id)
    setError(null)
    try {
      const file = buildCsvBlob(ds)
      await processFile(file)
    } finally {
      setLoadingBenchmark(null)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) processFile(file)
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        fontFamily: 'var(--font-ui)',
        width: '100%',
      }}
    >
      {/* ── Upload Zone ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: BB.surface,
          border: `1px solid ${BB.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: `1px solid ${BB.border}`,
            background: BB.elevated,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(107,92,166,0.18)',
              border: `1px solid ${BB.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" fill="none" stroke={BB.primaryLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: BB.text }}>Enterprise Dataset Upload</div>
            <div style={{ fontSize: 10, color: BB.muted, marginTop: 1 }}>
              Drag & drop a CSV to extract schema, compute quality metrics, and prepare ML pipelines.
            </div>
          </div>
          {uploadedFileMeta && (
            <div
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 9px',
                borderRadius: 20,
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.35)',
                fontSize: 10,
                fontWeight: 700,
                color: BB.success,
              }}
            >
              <svg width="10" height="10" fill={BB.success} viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10" fill="none" stroke={BB.success} strokeWidth="2"/></svg>
              Loaded
            </div>
          )}
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          aria-label="Upload CSV File"
        />

        {/* Drop Zone */}
        {!uploadedFileMeta ? (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Drag and drop CSV file here or press enter to browse"
            style={{
              padding: '32px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              transition: 'background 200ms',
              background: isDragOver
                ? 'rgba(107,92,166,0.10)'
                : 'transparent',
              border: isDragOver
                ? `2px dashed ${BB.primaryLight}`
                : '2px dashed transparent',
              outline: 'none',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: isDragOver ? 'rgba(107,92,166,0.22)' : BB.elevated,
                border: `1px solid ${isDragOver ? BB.primaryLight : BB.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 200ms',
                boxShadow: isDragOver ? '0 0 24px rgba(107,92,166,0.4)' : 'none',
              }}
            >
              <svg width="22" height="22" fill="none" stroke={isDragOver ? BB.primaryLight : BB.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: BB.text, marginBottom: 3 }}>
                Drag & drop your CSV dataset here
              </div>
              <div style={{ fontSize: 11, color: BB.muted }}>
                Supports CSV files up to 50 MB with header rows and numerical feature columns.
              </div>
            </div>
            <button
              disabled={isProcessing}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 18px',
                borderRadius: 7,
                border: 'none',
                background: `linear-gradient(135deg, ${BB.maroon} 0%, #A01830 100%)`,
                color: BB.text,
                fontSize: 12,
                fontWeight: 700,
                cursor: isProcessing ? 'wait' : 'pointer',
                boxShadow: '0 3px 12px rgba(110,20,35,0.35)',
                marginTop: 2,
              }}
            >
              {isProcessing ? (
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              )}
              <span>{isProcessing ? 'Processing…' : 'Browse Files'}</span>
            </button>
          </div>
        ) : (
          /* Upload Success State */
          <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <svg width="18" height="18" fill="none" stroke={BB.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: BB.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {uploadedFileMeta.filename}
                </div>
                <div style={{ fontSize: 10, color: BB.muted, marginTop: 1 }}>
                  {formatBytes(uploadedFileMeta.size_bytes)} · {uploadedFileMeta.row_count ?? '?'} rows · {uploadedFileMeta.column_count ?? '?'} cols
                </div>
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 6,
                border: `1px solid ${BB.border}`,
                background: 'transparent',
                color: BB.muted,
                fontSize: 10,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Replace
            </button>
          </div>
        )}

        {/* Progress Bar */}
        {(isProcessing || uploadProgress > 0) && (
          <div style={{ padding: '0 18px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: BB.muted, marginBottom: 4 }}>
              <span>Uploading & parsing CSV…</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{uploadProgress}%</span>
            </div>
            <div style={{ height: 4, background: BB.elevated, borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 2,
                  background: `linear-gradient(to right, ${BB.maroon}, ${BB.primaryLight})`,
                  width: `${uploadProgress}%`,
                  transition: 'width 300ms ease-out',
                }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              margin: '0 18px 14px',
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(110,20,35,0.18)',
              border: '1px solid rgba(178,58,78,0.3)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 11,
              color: '#B23A4E',
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Divider with "OR" ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0' }}>
        <div style={{ flex: 1, height: 1, background: BB.border }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: BB.disabled, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          or load a benchmark
        </span>
        <div style={{ flex: 1, height: 1, background: BB.border }} />
      </div>

      {/* ── Benchmark Dataset Quick-Loaders ─────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {BENCHMARK_DATASETS.map((ds) => {
          const isLoading  = loadingBenchmark === ds.id;
          const isHovered  = hoveredBenchmark === ds.id;
          return (
            <button
              key={ds.id}
              disabled={!!loadingBenchmark}
              onClick={() => handleBenchmarkLoad(ds)}
              onMouseEnter={() => setHoveredBenchmark(ds.id)}
              onMouseLeave={() => setHoveredBenchmark(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 9,
                border: `1px solid ${isHovered ? BB.primaryLight : BB.border}`,
                background: isHovered ? 'rgba(107,92,166,0.10)' : BB.surface,
                cursor: loadingBenchmark ? 'wait' : 'pointer',
                transition: 'all 150ms ease',
                textAlign: 'left',
                boxShadow: isHovered ? '0 4px 20px rgba(107,92,166,0.18)' : 'none',
                transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{ds.emoji}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: BB.text }}>{ds.name}</div>
                  <div style={{ fontSize: 10, color: BB.muted, marginTop: 2 }}>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{ds.rows} rows · {ds.cols} cols</span>
                    {' · Target: '}
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#B23A4E' }}>{ds.target}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    background: ds.task === 'Regression'
                      ? 'rgba(201,162,75,0.15)'
                      : 'rgba(107,92,166,0.18)',
                    color: ds.task === 'Regression' ? '#C9A24B' : '#6C5CA6',
                    border: ds.task === 'Regression'
                      ? '1px solid rgba(201,162,75,0.3)'
                      : '1px solid rgba(107,92,166,0.3)',
                  }}
                >
                  {ds.task}
                </span>
                {isLoading ? (
                  <svg width="14" height="14" fill="none" stroke={BB.primaryLight} strokeWidth="2" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" fill="none" stroke={isHovered ? BB.primaryLight : BB.disabled} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ transition: 'stroke 150ms' }}>
                    <path d="M5 12h14m-7-7 7 7-7 7"/>
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* CSS keyframes for spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
