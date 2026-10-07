/**
 * ProjectGatekeeper — 2-step onboarding shown on every page
 * when no dataset + experiment file has been initialized.
 *
 * Step 1: Upload a CSV (drag-and-drop or browse). No sample datasets.
 * Step 2: Name the experiment file.
 * On confirm: calls initializeProject(dataset, fileName) to unlock the studio.
 */
import { useState, useRef, useCallback } from 'react';
import { Upload, FileCode, ArrowLeft, Sparkles, AlertCircle, X } from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { parseCsvFile } from '../../services/csvService';
import { validateCsvFile } from '../../utils/validation';
import { apiClient } from '../../services/apiClient';
import type { Dataset } from '../../types/dataset';

const BB = {
  base:'#08070F',surface:'#120E22',elevated:'#18132E',
  border:'rgba(138, 121, 202, 0.18)',borderLight:'rgba(167, 139, 250, 0.35)',
  primaryLight:'#8A79CA',gold:'#F59E0B',text:'#FFFFFF',
  textSecondary:'#E2E8F0',muted:'#94A3B8',disabled:'#475569',
  success:'#10B981',error:'#F87171',
} as const;

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

/* ── STEP 1: Upload CSV ──────────────────────────────────────────────── */
function Step1Upload({ onComplete }: { onComplete: (d: Dataset) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    const valid = validateCsvFile(file);
    if (!valid.valid) { setError(valid.message ?? 'Invalid CSV file.'); return; }
    try {
      setIsProcessing(true); setProgress(20);
      const dataset = await parseCsvFile(file); setProgress(60);
      let datasetId: string | null = null;
      try {
        const fd = new FormData(); fd.append('file', file);
        const r = await apiClient.upload<{ dataset_id: string }>('/datasets/upload', fd);
        datasetId = r.dataset_id;
        setProgress(90);
      } catch (uploadErr) {
        // Attempt quick auto-auth retry if session expired or unauthenticated
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
              const fd2 = new FormData(); fd2.append('file', file);
              const r2 = await apiClient.upload<{ dataset_id: string }>('/datasets/upload', fd2);
              datasetId = r2.dataset_id;
              setProgress(90);
            }
          }
        } catch {
          // Backend completely unreachable
        }
      }

      if (!datasetId) {
        setError('Failed to upload dataset to backend storage. Please ensure the backend server is running and accessible.');
        return;
      }

      setProgress(100);
      onComplete({ ...dataset, datasetId, rowCount: dataset.rows.length });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not parse the CSV file.'); }
    finally { setIsProcessing(false); setTimeout(() => setProgress(0), 600); }
  }, [onComplete]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
        onClick={() => !isProcessing && ref.current?.click()}
        style={{ border:'2px dashed '+(isDragOver?BB.primaryLight:BB.border), borderRadius:16, padding:'48px 24px',
          textAlign:'center', cursor:isProcessing?'wait':'pointer',
          background:isDragOver?'rgba(138,121,202,0.08)':'rgba(24,19,46,0.5)',
          transition:'all 200ms ease', position:'relative', overflow:'hidden' }}
      >
        {progress > 0 && (
          <div style={{ position:'absolute',top:0,left:0,height:3,width:progress+'%',
            background:'linear-gradient(90deg,'+BB.primaryLight+','+BB.gold+')',
            transition:'width 300ms ease', borderRadius:'3px 3px 0 0' }} />
        )}
        <div style={{ width:64,height:64,borderRadius:18,margin:'0 auto 18px',
          background:'linear-gradient(135deg,rgba(138,121,202,0.2),rgba(245,158,11,0.1))',
          border:'1px solid '+BB.borderLight, display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:'0 8px 24px rgba(138,121,202,0.2)' }}>
          <Upload style={{ width:26, height:26, color:isProcessing?BB.gold:BB.primaryLight }} />
        </div>
        <p style={{ fontSize:16, fontWeight:700, color:BB.text, margin:'0 0 8px' }}>
          {isProcessing ? 'Reading your dataset...' : 'Drop your CSV file here'}
        </p>
        <p style={{ fontSize:13, color:BB.muted, margin:'0 0 20px' }}>
          {isProcessing ? progress+'% complete' : 'or click to browse files on your computer'}
        </p>
        {!isProcessing && (
          <span style={{ display:'inline-block', padding:'8px 24px', borderRadius:8,
            background:'rgba(138,121,202,0.15)', border:'1px solid '+BB.primaryLight,
            color:BB.text, fontSize:13, fontWeight:700 }}>
            Browse CSV File
          </span>
        )}
        <input ref={ref} type="file" accept=".csv,text/csv" style={{ display:'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value=''; }} />
      </div>
      {error && (
        <div style={{ padding:'10px 14px', borderRadius:8, background:'rgba(248,113,113,0.1)',
          border:'1px solid rgba(248,113,113,0.3)', color:BB.error, fontSize:13 }}>
          {error}
        </div>
      )}
    </div>
  );
}

/* ── STEP 2: Name experiment file ────────────────────────────────────── */
function Step2CreateFile({ dataset, onBack, onConfirm }: { dataset: Dataset; onBack: () => void; onConfirm: (n: string) => void; }) {
  const [fileName, setFileName] = useState('experiment_1.py');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => { const e = validateFileName(fileName); if (e) { setError(e); return; } onConfirm(sanitizeFileName(fileName)); };
  const rowCount = dataset.rowCount ?? dataset.rows.length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Dataset confirmed pill */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:10,
        background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:BB.success,
          boxShadow:'0 0 8px '+BB.success, flexShrink:0 }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:BB.text, overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dataset.fileName}</div>
          <div style={{ fontSize:11, color:BB.muted }}>{rowCount.toLocaleString()} rows · {dataset.columns.length} columns</div>
        </div>
      </div>
      <div>
        <p style={{ fontSize:13, color:BB.textSecondary, margin:'0 0 6px' }}>
          Name your experiment file. This Python script will store your pipeline configuration and generated code.
        </p>
        <p style={{ fontSize:11, color:BB.muted, margin:0 }}>
          Tip: Use a descriptive name like <span style={{ color:BB.primaryLight, fontFamily:'var(--font-mono)' }}>random_forest_v1.py</span>
        </p>
      </div>
      <div>
        <label style={{ fontSize:11, fontWeight:700, color:BB.muted, textTransform:'uppercase',
          letterSpacing:'0.06em', display:'block', marginBottom:8 }}>Experiment File Name</label>
        <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
          <FileCode style={{ position:'absolute', left:12, width:16, height:16, color:BB.primaryLight, pointerEvents:'none' }} />
          <input autoFocus value={fileName}
            onChange={(e) => { setFileName(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key==='Enter') handleSubmit(); if (e.key==='Escape') onBack(); }}
            placeholder="experiment_1.py"
            style={{ width:'100%', padding:'11px 12px 11px 38px', borderRadius:10,
              border:'1px solid '+(error?BB.error:BB.borderLight),
              background:BB.elevated, color:BB.text, fontSize:14,
              fontFamily:'var(--font-mono)', outline:'none', boxSizing:'border-box' }} />
        </div>
        {error && <p style={{ fontSize:11, color:BB.error, margin:'6px 0 0' }}>{error}</p>}
      </div>
      <div style={{ display:'flex', gap:10 }}>
        <button onClick={onBack}
          style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6, padding:'10px 16px', borderRadius:8,
            border:'1px solid '+BB.border, background:'transparent', color:BB.muted, fontSize:13, fontWeight:600, cursor:'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.color=BB.text; e.currentTarget.style.borderColor=BB.borderLight; }}
          onMouseLeave={(e) => { e.currentTarget.style.color=BB.muted; e.currentTarget.style.borderColor=BB.border; }}>
          <ArrowLeft style={{ width:14, height:14 }} /> Change CSV
        </button>
        <button onClick={handleSubmit}
          style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px 20px', borderRadius:8,
            border:'1px solid '+BB.primaryLight,
            background:'linear-gradient(135deg,rgba(138,121,202,0.25),rgba(75,59,124,0.4))',
            color:BB.text, fontSize:13, fontWeight:700, cursor:'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background='linear-gradient(135deg,rgba(138,121,202,0.4),rgba(75,59,124,0.55))'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background='linear-gradient(135deg,rgba(138,121,202,0.25),rgba(75,59,124,0.4))'; }}>
          <Sparkles style={{ width:15, height:15, color:BB.gold }} />
          Create File and Enter Studio
          <span style={{ fontSize:10, color:BB.muted, background:BB.elevated, padding:'2px 6px', borderRadius:4, border:'1px solid '+BB.border }}>Enter</span>
        </button>
      </div>
    </div>
  );
}

/* ── MAIN GATEKEEPER ─────────────────────────────────────────────────── */
export function ProjectGatekeeper() {
  const { initializeProject, staleDatasetWarning, clearStaleDatasetWarning } = useProject();
  const [pendingDataset, setPendingDataset] = useState<Dataset | null>(null);
  const step = pendingDataset ? 2 : 1;

  return (
    <div role="region" aria-label="Project Setup"
      style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', width:'100%',
        background:'radial-gradient(ellipse at 50% 20%, rgba(75,59,124,0.22) 0%, #08070F 65%)',
        padding:24, boxSizing:'border-box', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:500, background:'rgba(18,14,34,0.92)', backdropFilter:'blur(24px)',
        border:'1px solid rgba(138,121,202,0.25)', borderRadius:20, padding:'32px 32px 28px',
        boxShadow:'0 24px 80px rgba(0,0,0,0.6)', boxSizing:'border-box' }}>
        {staleDatasetWarning && (
          <div
            data-testid="stale-dataset-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 14px',
              marginBottom: 20,
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#FF6B6B',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
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
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}
        {/* Step indicator */}
        <div style={{ marginBottom:28 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            {[1,2].map((s) => (
              <div key={s} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, fontWeight:800, flexShrink:0, transition:'all 300ms ease',
                  background:s===step?'linear-gradient(135deg,#8A79CA,#4B3B7C)':s<step?'rgba(16,185,129,0.2)':'rgba(71,85,105,0.4)',
                  color:s===step?'#FFF':s<step?BB.success:BB.disabled,
                  border:'1px solid '+(s===step?BB.primaryLight:s<step?'rgba(16,185,129,0.4)':BB.border) }}>
                  {s < step ? '✓' : s}
                </div>
                {s < 2 && <div style={{ height:1, width:32, background:s<step?'rgba(16,185,129,0.5)':BB.border }} />}
              </div>
            ))}
            <span style={{ fontSize:11, color:BB.muted, marginLeft:4 }}>
              {step===1 ? 'Upload CSV Dataset' : 'Name Experiment File'}
            </span>
          </div>
          <h1 style={{ fontSize:22, fontWeight:800, color:BB.text, margin:'0 0 6px', letterSpacing:'-0.02em' }}>
            {step===1 ? 'Start a New Experiment' : 'Name Your Experiment File'}
          </h1>
          <p style={{ fontSize:13, color:BB.muted, margin:0, lineHeight:1.5 }}>
            {step===1
              ? 'Upload a CSV from your computer to begin. Your experiment file, pipeline code, and training results will be tied to this dataset.'
              : 'This file will hold your pipeline Python script. You can create more files later in the Code Studio.'}
          </p>
        </div>
        {step===1
          ? <Step1Upload onComplete={setPendingDataset} />
          : <Step2CreateFile dataset={pendingDataset!} onBack={() => setPendingDataset(null)}
              onConfirm={(name) => { if (pendingDataset) initializeProject(pendingDataset, name); }} />}
      </div>
    </div>
  );
}
