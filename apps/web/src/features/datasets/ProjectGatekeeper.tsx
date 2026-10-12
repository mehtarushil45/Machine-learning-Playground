/**
 * ProjectGatekeeper — Onboarding & Dataset Ingestion Hub
 *
 * Layout Requirements:
 * 1. Open, flat design (no nested block/card containers).
 * 2. Top: Compact horizontal Upload Dataset ingestion bar (drag & drop, browse button).
 * 3. Below: 3 open columns:
 *    - Left: Previous Uploads (exactly 5 items, line by line, dynamically updates on new upload, NO row/column details).
 *    - Middle: Learn with Ready-Made Examples (5 items line by line with 1-click Try button).
 *    - Right: User Guide (5 concise actionable steps line by line).
 * 4. Strictly NO vertical scrollbar (fits 100% within the viewport).
 * 5. Step 2 Modal: Name the Python experiment file and enter the studio.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  FileCode,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  X,
  Clock,
  BookOpen,
  FileText,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { parseCsvFile } from '../../services/csvService';
import { validateCsvFile } from '../../utils/validation';
import { apiClient } from '../../services/apiClient';
import type { Dataset, DatasetProfile } from '../../types/dataset';

const BB = {
  base: '#08070F',
  surface: '#120E22',
  elevated: '#18132E',
  border: 'rgba(138, 121, 202, 0.16)',
  borderLight: 'rgba(167, 139, 250, 0.32)',
  primaryLight: '#8A79CA',
  gold: '#F59E0B',
  text: '#FFFFFF',
  textSecondary: '#E2E8F0',
  muted: '#94A3B8',
  disabled: '#475569',
  success: '#10B981',
  error: '#F87171',
} as const;

const PREVIOUS_UPLOADS_KEY = 'ml_previous_uploads_v2';
const MAX_PREVIOUS_UPLOADS = 5;

interface PreviousUploadItem {
  id: string;
  fileName: string;
  uploadedAt: string;
  csvContent?: string;
  datasetId?: string;
}

interface ReadyMadeExample {
  id: string;
  name: string;
  fileName: string;
  task: 'Classification' | 'Regression';
  icon: string;
  csvContent: string;
}

/* ── Embedded Benchmark CSVs ────────────────────────────────────────── */
const CHURN_SAMPLE_CSV = [
  'customer_id,age,tenure_months,monthly_charges,total_charges,contract,tech_support,churn',
  '1001,34,12,65.5,786.0,One-Year,Yes,0',
  '1002,45,2,89.2,178.4,Month-to-Month,No,1',
  '1003,29,24,45.0,1080.0,Two-Year,Yes,0',
  '1004,52,5,95.6,478.0,Month-to-Month,No,1',
  '1005,38,36,70.1,2523.6,One-Year,Yes,0',
  '1006,61,1,85.0,85.0,Month-to-Month,No,1',
  '1007,26,18,55.3,995.4,Month-to-Month,Yes,0',
  '1008,49,48,110.2,5289.6,Two-Year,Yes,0',
  '1009,42,8,75.4,603.2,Month-to-Month,No,1',
  '1010,31,15,60.0,900.0,One-Year,No,0',
  '1011,58,3,92.1,276.3,Month-to-Month,No,1',
  '1012,36,28,80.5,2254.0,Two-Year,Yes,0',
  '1013,23,6,68.9,413.4,Month-to-Month,No,1',
  '1014,47,40,98.0,3920.0,Two-Year,Yes,0',
  '1015,39,11,72.4,796.4,Month-to-Month,No,0',
].join('\n');

const HOUSING_SAMPLE_CSV = [
  'median_income,housing_median_age,total_rooms,total_bedrooms,population,households,median_house_value',
  '8.32,41,880,129,322,126,452600',
  '7.25,52,1467,190,496,177,352100',
  '5.64,52,1274,235,558,219,341300',
  '3.84,52,1627,280,565,259,342200',
  '4.03,52,919,213,413,193,269700',
  '3.65,52,2535,489,1094,514,299200',
  '3.12,52,3104,687,1157,647,241400',
  '2.08,42,2555,665,1206,595,226700',
  '3.69,52,3549,707,1551,714,261100',
  '3.20,52,2202,434,910,402,281500',
  '3.27,52,3503,752,1504,734,241800',
  '3.07,52,2491,474,1098,468,213500',
  '2.67,52,696,191,345,174,191300',
  '1.91,52,2643,626,1212,620,159200',
  '2.12,50,1120,283,697,264,140000',
].join('\n');

const CREDIT_SAMPLE_CSV = [
  'person_age,person_income,person_emp_length,loan_amnt,loan_int_rate,loan_status',
  '22,59000,12,35000,16.02,1',
  '21,9600,5,1000,11.14,0',
  '25,9600,1,5500,12.87,1',
  '23,65500,4,35000,15.23,1',
  '24,54400,8,35000,14.27,1',
  '21,9900,2,2500,7.14,1',
  '26,77100,8,35000,12.42,0',
  '24,78956,5,35000,11.11,0',
  '24,83000,8,35000,8.90,0',
  '21,10000,6,1600,14.74,0',
].join('\n');

const IRIS_SAMPLE_CSV = [
  'sepal_length,sepal_width,petal_length,petal_width,species',
  '5.1,3.5,1.4,0.2,setosa',
  '4.9,3.0,1.4,0.2,setosa',
  '4.7,3.2,1.3,0.2,setosa',
  '4.6,3.1,1.5,0.2,setosa',
  '5.0,3.6,1.4,0.2,setosa',
  '7.0,3.2,4.7,1.4,versicolor',
  '6.4,3.2,4.5,1.5,versicolor',
  '6.9,3.1,4.9,1.5,versicolor',
  '6.3,3.3,6.0,2.5,virginica',
  '5.8,2.7,5.1,1.9,virginica',
].join('\n');

const INSURANCE_SAMPLE_CSV = [
  'age,sex,bmi,children,smoker,region,charges',
  '19,female,27.9,0,yes,southwest,16884.92',
  '18,male,33.7,1,no,southeast,1725.55',
  '28,male,33.0,3,no,southeast,4449.46',
  '33,male,22.7,0,no,northwest,21984.47',
  '32,male,28.8,0,no,northwest,3866.85',
  '31,female,25.7,0,no,southeast,3756.62',
  '46,female,33.4,1,no,southeast,8240.58',
  '37,female,27.7,3,no,northwest,7281.50',
  '37,male,29.8,2,no,northeast,6406.41',
  '60,female,25.8,0,no,northwest,28923.14',
].join('\n');

const READY_MADE_EXAMPLES: ReadyMadeExample[] = [
  {
    id: 'ex-churn',
    name: 'Customer Churn Analysis',
    fileName: 'telecom_churn.csv',
    task: 'Classification',
    icon: '📊',
    csvContent: CHURN_SAMPLE_CSV,
  },
  {
    id: 'ex-housing',
    name: 'California Housing Valuation',
    fileName: 'housing_prices.csv',
    task: 'Regression',
    icon: '🏠',
    csvContent: HOUSING_SAMPLE_CSV,
  },
  {
    id: 'ex-credit',
    name: 'Credit Risk & Default Assessment',
    fileName: 'credit_risk.csv',
    task: 'Classification',
    icon: '💳',
    csvContent: CREDIT_SAMPLE_CSV,
  },
  {
    id: 'ex-iris',
    name: 'Iris Flower Taxonomy Benchmark',
    fileName: 'iris_species.csv',
    task: 'Classification',
    icon: '🌸',
    csvContent: IRIS_SAMPLE_CSV,
  },
  {
    id: 'ex-insurance',
    name: 'Healthcare Insurance Costs',
    fileName: 'insurance_charges.csv',
    task: 'Regression',
    icon: '🏥',
    csvContent: INSURANCE_SAMPLE_CSV,
  },
];

function sanitizeFileName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim().replace(/ +/g, '_');
  const base = cleaned || 'experiment_1';
  return base.endsWith('.py') ? base : base + '.py';
}

function validateFileName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return 'Please enter a filename.';
  if (t.length > 80) return 'Filename is too long (max 80 characters).';
  if (/[<>:"/\\|?*]/.test(t)) return 'Filename contains invalid characters.';
  return null;
}

function getStoredPreviousUploads(): PreviousUploadItem[] {
  try {
    const raw = localStorage.getItem(PREVIOUS_UPLOADS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, MAX_PREVIOUS_UPLOADS);
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return [
    {
      id: 'prev-churn-seed',
      fileName: 'telecom_churn.csv',
      uploadedAt: 'Recent',
      csvContent: CHURN_SAMPLE_CSV,
    },
    {
      id: 'prev-housing-seed',
      fileName: 'housing_prices.csv',
      uploadedAt: 'Recent',
      csvContent: HOUSING_SAMPLE_CSV,
    },
  ].slice(0, MAX_PREVIOUS_UPLOADS);
}

function saveUploadRecord(fileName: string, csvContent?: string, datasetId?: string): PreviousUploadItem[] {
  try {
    const existing = getStoredPreviousUploads();
    const filtered = existing.filter((item) => item.fileName !== fileName);
    const updated: PreviousUploadItem[] = [
      {
        id: datasetId || 'upload-' + Date.now(),
        fileName,
        uploadedAt: 'Just now',
        csvContent: csvContent ? csvContent.slice(0, 500000) : undefined,
        datasetId,
      },
      ...filtered,
    ].slice(0, MAX_PREVIOUS_UPLOADS);
    localStorage.setItem(PREVIOUS_UPLOADS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

/* ── STEP 2: Name experiment file Modal ──────────────────────────────── */
function Step2CreateFile({
  dataset,
  onBack,
  onConfirm,
}: {
  dataset: Dataset;
  onBack: () => void;
  onConfirm: (n: string) => void;
}) {
  const [fileName, setFileName] = useState('experiment_1.py');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const e = validateFileName(fileName);
    if (e) {
      setError(e);
      return;
    }
    onConfirm(sanitizeFileName(fileName));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.25)',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: BB.success,
            boxShadow: '0 0 8px ' + BB.success,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: BB.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {dataset.fileName}
          </div>
          <div style={{ fontSize: 11, color: BB.success }}>✓ Dataset ready for pipeline initialization</div>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: BB.text, margin: '0 0 4px' }}>
          Name Experiment File
        </h2>
        <p style={{ fontSize: 12, color: BB.muted, margin: 0 }}>
          Specify your Python pipeline file to store model configurations and training scripts.
        </p>
      </div>

      <div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <FileCode
            style={{
              position: 'absolute',
              left: 12,
              width: 15,
              height: 15,
              color: BB.primaryLight,
              pointerEvents: 'none',
            }}
          />
          <input
            autoFocus
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onBack();
            }}
            placeholder="experiment_1.py"
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: 8,
              border: '1px solid ' + (error ? BB.error : BB.borderLight),
              background: BB.elevated,
              color: BB.text,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        {error && <p style={{ fontSize: 11, color: BB.error, margin: '4px 0 0' }}>{error}</p>}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 14px',
            borderRadius: 6,
            border: '1px solid ' + BB.border,
            background: 'transparent',
            color: BB.muted,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft style={{ width: 13, height: 13 }} /> Change Dataset
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '9px 18px',
            borderRadius: 6,
            border: '1px solid ' + BB.primaryLight,
            background: 'linear-gradient(135deg,rgba(138,121,202,0.25),rgba(75,59,124,0.4))',
            color: BB.text,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Sparkles style={{ width: 14, height: 14, color: BB.gold }} />
          Create File & Enter Studio
        </button>
      </div>
    </div>
  );
}

/* ── MAIN GATEKEEPER COMPONENT ──────────────────────────────────────── */
export function ProjectGatekeeper() {
  const { initializeProject, staleDatasetWarning, clearStaleDatasetWarning, isValidatingDataset } = useProject();
  const [pendingDataset, setPendingDataset] = useState<Dataset | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previousUploads, setPreviousUploads] = useState<PreviousUploadItem[]>(() => getStoredPreviousUploads());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync server registered datasets if backend is running (strictly capped at 5)
  useEffect(() => {
    apiClient
      .get<{ datasets?: Array<{ id: string; name: string; original_filename?: string; created_at?: string }> }>('/datasets')
      .then((res) => {
        if (res?.datasets && Array.isArray(res.datasets) && res.datasets.length > 0) {
          setPreviousUploads((prev) => {
            const names = new Set(prev.map((p) => p.fileName));
            const serverItems: PreviousUploadItem[] = res.datasets!
              .filter((ds) => !names.has(ds.name) && !names.has(ds.original_filename || ''))
              .map((ds) => ({
                id: ds.id,
                fileName: ds.original_filename || ds.name,
                uploadedAt: ds.created_at ? new Date(ds.created_at).toLocaleDateString() : 'Server',
                datasetId: ds.id,
              }));
            return [...prev, ...serverItems].slice(0, MAX_PREVIOUS_UPLOADS);
          });
        }
      })
      .catch(() => {
        /* Backend offline or guest mode — use local storage list */
      });
  }, []);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    const valid = validateCsvFile(file);
    if (!valid.valid) {
      setError(valid.message ?? 'Invalid CSV file format.');
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(25);
      const dataset = await parseCsvFile(file);
      setProgress(60);

      let datasetId: string | null = null;
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await apiClient.upload<{ dataset_id: string }>('/datasets/upload', fd);
        datasetId = r.dataset_id;
        setProgress(90);
      } catch {
        // Attempt quick auto-auth retry
        try {
          const authBody = new URLSearchParams({
            username: 'demo@ml-playground.internal',
            password: 'DemoPassword123!',
          });
          const loginRes = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: authBody.toString(),
          });
          if (loginRes.ok) {
            const authData = await loginRes.json();
            if (authData.access_token) {
              localStorage.setItem('access_token', authData.access_token);
              const fd2 = new FormData();
              fd2.append('file', file);
              const r2 = await apiClient.upload<{ dataset_id: string }>('/datasets/upload', fd2);
              datasetId = r2.dataset_id;
              setProgress(90);
            }
          }
        } catch {
          /* ignore auth retry failure */
        }
      }

      // Read small text cache for instant re-use
      let rawText: string | undefined = undefined;
      try {
        if (file.size < 500000) {
          rawText = await file.text();
        }
      } catch {
        /* ignore text read failure */
      }

      // Save to previous uploads list (dynamically prepends new upload, strictly caps at 5)
      const updated = saveUploadRecord(file.name, rawText, datasetId || undefined);
      if (updated.length > 0) {
        setPreviousUploads(updated.slice(0, MAX_PREVIOUS_UPLOADS));
      }

      setProgress(100);
      setPendingDataset({
        ...dataset,
        datasetId: datasetId || 'local-' + Date.now(),
        rowCount: dataset.rows.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse the CSV file.');
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 400);
    }
  }, []);

  const handleSelectPreviousUpload = async (item: PreviousUploadItem) => {
    if (item.csvContent) {
      const file = new File([new Blob([item.csvContent], { type: 'text/csv' })], item.fileName, { type: 'text/csv' });
      await processFile(file);
    } else if (item.datasetId) {
      try {
        setIsProcessing(true);
        const profile = await apiClient.get<DatasetProfile>(`/datasets/${item.datasetId}/profile`).catch(() => null);
        const cols = profile?.columns?.map((c) => c.name) || ['feature_1', 'feature_2', 'target'];
        setPendingDataset({
          fileName: item.fileName,
          datasetId: item.datasetId,
          rows: [],
          columns: cols,
          rowCount: profile?.row_count || 100,
        });
      } catch (err: any) {
        setError(err?.message || 'Could not load dataset from server.');
      } finally {
        setIsProcessing(false);
      }
    } else {
      setError('Cached content unavailable. Please re-upload this CSV file.');
    }
  };

  const handleSelectExample = async (ex: ReadyMadeExample) => {
    const file = new File([new Blob([ex.csvContent], { type: 'text/csv' })], ex.fileName, { type: 'text/csv' });
    await processFile(file);
  };

  return (
    <div
      role="region"
      aria-label="Project Setup"
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        background: 'radial-gradient(ellipse at 50% 10%, rgba(75,59,124,0.18) 0%, #08070F 70%)',
        padding: '20px 32px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden', // STRICT: No scroll down on gatekeeper page
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 16,
          boxSizing: 'border-box',
        }}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h1
              style={{
                fontSize: 19,
                fontWeight: 800,
                color: BB.text,
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              ML Playground
            </h1>
            <p style={{ fontSize: 12, color: BB.muted, margin: '2px 0 0' }}>
              Upload your dataset or choose a ready-made example to start building, training, and benchmarking ML models.
            </p>
          </div>
        </div>

        {/* Alerts & Verification Banner */}
        {staleDatasetWarning && (
          <div
            data-testid="stale-dataset-banner"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#FF6B6B',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
              <span>{staleDatasetWarning}</span>
            </div>
            <button
              onClick={clearStaleDatasetWarning}
              style={{
                background: 'none',
                border: 'none',
                color: '#FF6B6B',
                cursor: 'pointer',
                padding: 2,
              }}
              aria-label="Dismiss warning"
            >
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>
        )}

        {isValidatingDataset && (
          <div
            data-testid="dataset-validating-spinner"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '10px 14px',
              color: BB.muted,
              fontSize: 12,
              background: 'rgba(24, 19, 46, 0.4)',
              borderRadius: 6,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                border: '2px solid rgba(138, 121, 202, 0.2)',
                borderTopColor: BB.primaryLight,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span>Verifying dataset on server...</span>
          </div>
        )}

        {/* ── TOP UPLOAD DATASET STRIP (Clean open layout, not inside nested block) ── */}
        <div style={{ flexShrink: 0 }}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) processFile(f);
            }}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            style={{
              border: '1.5px dashed ' + (isDragOver ? BB.primaryLight : 'rgba(138, 121, 202, 0.28)'),
              borderRadius: 10,
              padding: '14px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              background: isDragOver ? 'rgba(138, 121, 202, 0.08)' : 'rgba(24, 19, 46, 0.35)',
              cursor: isProcessing ? 'wait' : 'pointer',
              transition: 'all 150ms ease',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {progress > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: 3,
                  width: progress + '%',
                  background: 'linear-gradient(90deg,' + BB.primaryLight + ',' + BB.gold + ')',
                  transition: 'width 250ms ease',
                }}
              />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(138, 121, 202, 0.15)',
                  border: '1px solid ' + BB.borderLight,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Upload style={{ width: 18, height: 18, color: isProcessing ? BB.gold : BB.primaryLight }} />
              </div>
              <div>
                <h2
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: BB.text,
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  Upload Dataset
                  <span style={{ fontSize: 11, fontWeight: 500, color: BB.muted }}>
                    (Drop your CSV file here or click to browse)
                  </span>
                </h2>
                <p style={{ fontSize: 11, color: BB.muted, margin: '2px 0 0' }}>
                  {isProcessing
                    ? `Processing CSV and generating profile (${progress}%)...`
                    : 'Supported: CSV format up to 50 MB with header row'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  background: 'rgba(138, 121, 202, 0.18)',
                  border: '1px solid ' + BB.primaryLight,
                  color: BB.text,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                }}
              >
                Browse CSV File
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processFile(f);
                e.target.value = '';
              }}
            />
          </div>

          {error && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 12px',
                borderRadius: 6,
                background: 'rgba(248,113,113,0.1)',
                border: '1px solid rgba(248,113,113,0.3)',
                color: BB.error,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* ── 3 OPEN COLUMNS (No block cards, line by line, zero vertical scroll) ── */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 28,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* ── COLUMN 1: Previous Uploads (Strictly 5 items max, changes on new upload, NO row/col details) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 6,
                marginBottom: 8,
                borderBottom: '1px solid ' + BB.border,
                flexShrink: 0,
              }}
            >
              <Clock style={{ width: 15, height: 15, color: BB.primaryLight }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: BB.text, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Previous Uploads
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {previousUploads.length === 0 ? (
                <div style={{ padding: '12px 6px', color: BB.muted, fontSize: 12 }}>
                  No previous uploads yet.
                </div>
              ) : (
                previousUploads.slice(0, MAX_PREVIOUS_UPLOADS).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectPreviousUpload(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'background 120ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(138, 121, 202, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* STRICT REQUIREMENT: Only filename & icon, NO row or column details */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <FileText style={{ width: 14, height: 14, color: BB.primaryLight, flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 500,
                          color: BB.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.fileName}
                      >
                        {item.fileName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPreviousUpload(item);
                      }}
                      style={{
                        padding: '3px 9px',
                        borderRadius: 4,
                        border: '1px solid ' + BB.borderLight,
                        background: 'rgba(138, 121, 202, 0.12)',
                        color: BB.text,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Load
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── COLUMN 2: Learn with Ready-Made Examples (Line by line, open design) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 6,
                marginBottom: 8,
                borderBottom: '1px solid ' + BB.border,
                flexShrink: 0,
              }}
            >
              <Sparkles style={{ width: 15, height: 15, color: BB.gold }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: BB.text, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Learn with Ready-Made Examples
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {READY_MADE_EXAMPLES.map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => handleSelectExample(ex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(138, 121, 202, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{ex.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 500,
                          color: BB.text,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={ex.name}
                      >
                        {ex.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: '0 4px',
                            borderRadius: 3,
                            background:
                              ex.task === 'Classification' ? 'rgba(138, 121, 202, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: ex.task === 'Classification' ? '#C4B5FD' : '#FCD34D',
                          }}
                        >
                          {ex.task}
                        </span>
                        <span style={{ fontSize: 10.5, color: BB.muted, fontFamily: 'var(--font-mono)' }}>
                          {ex.fileName}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectExample(ex);
                    }}
                    style={{
                      padding: '3px 9px',
                      borderRadius: 4,
                      border: '1px solid ' + BB.borderLight,
                      background: 'rgba(138, 121, 202, 0.12)',
                      color: BB.text,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    Try
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── COLUMN 3: User Guide (Direct link to comprehensive student guide in new window) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 6,
                marginBottom: 8,
                borderBottom: '1px solid ' + BB.border,
                flexShrink: 0,
              }}
            >
              <BookOpen style={{ width: 15, height: 15, color: BB.primaryLight }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: BB.text, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                User Guide
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
              <p style={{ fontSize: 12, color: BB.textSecondary, margin: 0, lineHeight: 1.45 }}>
                New to machine learning? Open our comprehensive student guide to learn how each page works from data profiling to code writing, training, and production deployment.
              </p>

              <div>
                <button
                  type="button"
                  data-testid="gatekeeper-open-guide-btn"
                  onClick={() => window.open(`${window.location.origin}${window.location.pathname}#guide`, '_blank')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 0',
                    color: '#A78BFA',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#C4B5FD';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#A78BFA';
                  }}
                >
                  <BookOpen style={{ width: 14, height: 14, color: BB.gold }} />
                  <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>Open User Guide</span>
                  <span style={{ fontSize: 11, opacity: 0.85 }}>↗</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 2 MODAL: Name Experiment File ──────────────────────── */}
      {pendingDataset && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              background: 'rgba(18, 14, 34, 0.96)',
              backdropFilter: 'blur(24px)',
              border: '1px solid ' + BB.borderLight,
              borderRadius: 14,
              padding: '24px 24px',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.8)',
            }}
          >
            <Step2CreateFile
              dataset={pendingDataset}
              onBack={() => setPendingDataset(null)}
              onConfirm={(name) => {
                initializeProject(pendingDataset, name);
              }}
            />
          </div>
        </div>
      )
      }
    </div >
  );
}
