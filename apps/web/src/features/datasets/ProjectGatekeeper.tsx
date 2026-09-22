/**
 * ProjectGatekeeper — 2-step onboarding shown on every page
 * when no dataset + experiment file has been initialized.
 */
import { useState, useRef, useCallback } from 'react';
import { Upload, FileCode, ArrowLeft, ChevronRight, Sparkles } from 'lucide-react';
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

interface QuickDataset { id:string;emoji:string;name:string;task:string;rows:number;cols:number;headerRow:string;sampleRows:string[]; }

const QUICK_DATASETS: QuickDataset[] = [
  { id:'student_exams',emoji:'🎓',name:'Student Performance',task:'Regression',rows:15,cols:9,
    headerRow:'student_id,age,study_hours,attendance_percent,final_score,city,course,passed,remarks',
    sampleRows:['1001,18,2.5,72,48,Vadodara,Science,0,Needs support','1002,19,4.0,85,67,Ahmedabad,Commerce,1,Regular learner',
      '1003,18,6.5,92,84,Surat,Science,1,Strong performance','1004,20,,78,55,Rajkot,Arts,0,Study hours missing',
      '1005,19,5.0,88,73,Vadodara,Commerce,1,','1006,21,1.5,65,39,Ahmedabad,Arts,0,Low attendance',
      '1007,20,7.0,95,91,Surat,Science,1,Excellent','1008,18,3.5,,61,Rajkot,Commerce,1,Attendance missing',
      '1009,19,2.0,70,,Vadodara,Arts,0,Score missing','1010,20,4.5,80,72,Ahmedabad,Science,1,',
      '1011,18,3.0,68,52,Surat,Commerce,0,Needs support','1012,21,5.5,90,80,Rajkot,Science,1,Good performance',
      '1013,19,1.0,60,35,Vadodara,Arts,0,Low attendance','1014,20,6.0,88,85,Ahmedabad,Science,1,',
      '1015,18,4.0,75,63,Surat,Commerce,1,Regular learner'] },
  { id:'california_housing',emoji:'🏠',name:'Housing Prices',task:'Regression',rows:20,cols:9,
    headerRow:'longitude,latitude,housing_median_age,total_rooms,total_bedrooms,population,households,median_income,median_house_value',
    sampleRows:['-122.23,37.88,41,880,129,322,126,8.3252,452600','-122.22,37.86,21,7099,1106,2401,1138,8.3014,358500',
      '-122.24,37.85,52,1467,190,496,177,7.2574,352100','-122.25,37.85,52,1274,235,558,219,5.6431,341300',
      '-122.25,37.85,52,1627,280,565,259,3.8462,342200','-122.25,37.85,52,919,213,413,193,4.0368,269700',
      '-122.25,37.84,52,2535,489,1094,514,3.6591,299200','-122.25,37.84,52,3104,687,1157,647,3.12,241400',
      '-122.26,37.84,42,2555,665,1206,595,2.0804,226700','-122.25,37.84,52,3549,707,1551,714,3.6912,261100',
      '-122.26,37.85,52,2202,434,910,402,3.2031,281500','-122.26,37.85,52,3503,752,1504,734,3.2705,241800',
      '-122.26,37.85,52,2491,474,1098,468,3.075,213500','-122.26,37.84,52,696,191,345,174,2.6736,191300',
      '-122.26,37.85,52,2643,626,1212,620,1.9167,159200','-122.26,37.85,50,1120,283,697,264,2.125,140000',
      '-122.27,37.85,52,1966,347,793,331,2.775,152500','-122.27,37.85,52,1228,293,648,303,2.1202,155500',
      '-122.26,37.84,50,2239,455,990,419,1.9911,158700','-122.27,37.84,52,1503,298,690,275,2.6,162900'] },
  { id:'iris',emoji:'🌸',name:'Iris Classification',task:'Classification',rows:20,cols:5,
    headerRow:'sepal_length,sepal_width,petal_length,petal_width,species',
    sampleRows:['5.1,3.5,1.4,0.2,setosa','4.9,3.0,1.4,0.2,setosa','4.7,3.2,1.3,0.2,setosa',
      '4.6,3.1,1.5,0.2,setosa','5.0,3.6,1.4,0.2,setosa','5.4,3.9,1.7,0.4,setosa',
      '7.0,3.2,4.7,1.4,versicolor','6.4,3.2,4.5,1.5,versicolor','6.9,3.1,4.9,1.5,versicolor',
      '5.5,2.3,4.0,1.3,versicolor','6.5,2.8,4.6,1.5,versicolor','5.7,2.8,4.5,1.3,versicolor',
      '6.3,3.3,6.0,2.5,virginica','5.8,2.7,5.1,1.9,virginica','7.1,3.0,5.9,2.1,virginica',
      '6.3,2.9,5.6,1.8,virginica','6.5,3.0,5.8,2.2,virginica','7.6,3.0,6.6,2.1,virginica',
      '4.9,2.5,4.5,1.7,virginica','4.9,2.4,3.3,1.0,versicolor'] },
];

function buildCsvBlob(ds: QuickDataset): File {
  const content = [ds.headerRow, ...ds.sampleRows].join('\n');
  return new File([new Blob([content], { type: 'text/csv' })], ds.id + '.csv', { type: 'text/csv' });
}

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

/* STEP 1 */
function Step1Upload({ onComplete }: { onComplete: (d: Dataset) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuick, setLoadingQuick] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    const valid = validateCsvFile(file);
    if (!valid.valid) { setError(valid.message ?? 'Invalid CSV file.'); return; }
    try {
      setIsProcessing(true); setProgress(20);
      const dataset = await parseCsvFile(file); setProgress(60);
      let datasetId = 'ds-' + Date.now().toString(36);
      try {
        const fd = new FormData(); fd.append('file', file);
        const r = await apiClient.upload<{ dataset_id: string }>('/datasets/upload', fd);
        datasetId = r.dataset_id; setProgress(90);
      } catch { /* backend unavailable */ }
      setProgress(100);
      onComplete({ ...dataset, datasetId, rowCount: dataset.rows.length });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not parse the CSV file.'); }
    finally { setIsProcessing(false); setTimeout(() => setProgress(0), 600); }
  }, [onComplete]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
        onClick={() => !isProcessing && ref.current?.click()}
        style={{ border:'2px dashed '+(isDragOver?BB.primaryLight:BB.border), borderRadius:16, padding:'40px 24px',
          textAlign:'center', cursor:isProcessing?'wait':'pointer',
          background:isDragOver?'rgba(138,121,202,0.08)':'rgba(24,19,46,0.5)',
          transition:'all 200ms ease', position:'relative', overflow:'hidden' }}
      >
        {progress > 0 && <div style={{ position:'absolute',top:0,left:0,height:3,width:progress+'%',
          background:'linear-gradient(90deg,'+BB.primaryLight+','+BB.gold+')', transition:'width 300ms ease', borderRadius:'3px 3px 0 0' }} />}
        <div style={{ width:56,height:56,borderRadius:16,margin:'0 auto 16px',
          background:'linear-gradient(135deg,rgba(138,121,202,0.2),rgba(245,158,11,0.1))',
          border:'1px solid '+BB.borderLight, display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:'0 8px 24px rgba(138,121,202,0.2)' }}>
          <Upload style={{ width:24, height:24, color:isProcessing?BB.gold:BB.primaryLight }} />
        </div>
        <p style={{ fontSize:15, fontWeight:700, color:BB.text, margin:'0 0 6px' }}>
          {isProcessing ? 'Parsing dataset...' : 'Drop your CSV file here'}
        </p>
        <p style={{ fontSize:12, color:BB.muted, margin:'0 0 16px' }}>
          {isProcessing ? progress+'% complete' : 'or click to browse — CSV only'}
        </p>
        {!isProcessing && <span style={{ display:'inline-block', padding:'7px 20px', borderRadius:8,
          background:'rgba(138,121,202,0.15)', border:'1px solid '+BB.primaryLight,
          color:BB.text, fontSize:12, fontWeight:700 }}>Browse CSV File</span>}
        <input ref={ref} type="file" accept=".csv,text/csv" style={{ display:'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value=''; }} />
      </div>
      {error && <div style={{ padding:'10px 14px', borderRadius:8, background:'rgba(248,113,113,0.1)',
        border:'1px solid rgba(248,113,113,0.3)', color:BB.error, fontSize:12 }}>{error}</div>}
      <div>
        <p style={{ fontSize:11, fontWeight:700, color:BB.muted, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 12px' }}>Quick-Start Datasets</p>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {QUICK_DATASETS.map((ds) => (
            <button key={ds.id} onClick={() => { setLoadingQuick(ds.id); processFile(buildCsvBlob(ds)).finally(() => setLoadingQuick(null)); }}
              disabled={loadingQuick !== null || isProcessing}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:10,
                border:'1px solid '+BB.border, background:loadingQuick===ds.id?'rgba(138,121,202,0.12)':'rgba(24,19,46,0.6)',
                cursor:loadingQuick!==null||isProcessing?'not-allowed':'pointer', transition:'all 150ms ease', textAlign:'left' }}
              onMouseEnter={(e) => { if (!loadingQuick&&!isProcessing) { e.currentTarget.style.borderColor=BB.borderLight; e.currentTarget.style.background='rgba(138,121,202,0.08)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor=BB.border; e.currentTarget.style.background='rgba(24,19,46,0.6)'; }}>
              <span style={{ fontSize:22 }}>{ds.emoji}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:BB.text }}>{ds.name}</div>
                <div style={{ fontSize:11, color:BB.muted }}>{ds.rows} rows · {ds.cols} cols · {ds.task}</div>
              </div>
              {loadingQuick===ds.id ? <span style={{ fontSize:11, color:BB.gold }}>Loading...</span>
                : <ChevronRight style={{ width:14, height:14, color:BB.disabled }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* STEP 2 */
function Step2CreateFile({ dataset, onBack, onConfirm }: { dataset: Dataset; onBack: () => void; onConfirm: (n: string) => void; }) {
  const [fileName, setFileName] = useState('experiment_1.py');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => { const e = validateFileName(fileName); if (e) { setError(e); return; } onConfirm(sanitizeFileName(fileName)); };
  const rowCount = dataset.rowCount ?? dataset.rows.length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:10,
        background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:BB.success, boxShadow:'0 0 8px '+BB.success, flexShrink:0 }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:BB.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dataset.fileName}</div>
          <div style={{ fontSize:11, color:BB.muted }}>{rowCount.toLocaleString()} rows · {dataset.columns.length} columns</div>
        </div>
      </div>
      <div>
        <p style={{ fontSize:13, color:BB.textSecondary, margin:'0 0 6px' }}>
          Name your experiment file. This Python script will store your pipeline configuration and generated code.
        </p>
        <p style={{ fontSize:11, color:BB.muted, margin:0 }}>
          Tip: Use a descriptive name like <span style={{ color:BB.primaryLight, fontFamily:'var(--font-mono)' }}>random_forest_baseline.py</span>
        </p>
      </div>
      <div>
        <label style={{ fontSize:11, fontWeight:700, color:BB.muted, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:8 }}>
          Experiment File Name
        </label>
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
          Create File & Enter Studio
          <span style={{ fontSize:10, color:BB.muted, background:BB.elevated, padding:'2px 6px', borderRadius:4, border:'1px solid '+BB.border }}>Enter</span>
        </button>
      </div>
    </div>
  );
}

/* MAIN GATEKEEPER */
export function ProjectGatekeeper() {
  const { initializeProject } = useProject();
  const [pendingDataset, setPendingDataset] = useState<Dataset | null>(null);
  const step = pendingDataset ? 2 : 1;

  return (
    <div role="region" aria-label="Project Setup"
      style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', width:'100%',
        background:'radial-gradient(ellipse at 50% 20%, rgba(75,59,124,0.22) 0%, #08070F 65%)',
        padding:24, boxSizing:'border-box', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:520, background:'rgba(18,14,34,0.92)', backdropFilter:'blur(24px)',
        border:'1px solid rgba(138,121,202,0.25)', borderRadius:20, padding:'32px 32px 28px',
        boxShadow:'0 24px 80px rgba(0,0,0,0.6)', boxSizing:'border-box' }}>
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
                {s < 2 && <div style={{ height:1, width:32, background:s<step?'rgba(16,185,129,0.5)':BB.border, transition:'background 300ms ease' }} />}
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
              ? 'Upload a CSV dataset to begin. Your experiment files, pipeline code, and results will be organized around this dataset.'
              : 'This file will contain your pipeline Python script. You can create more files later from the Code Studio.'}
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
