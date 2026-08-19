import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Code2, CheckCircle2, Copy, Check, Sliders, ChevronDown, ChevronRight } from 'lucide-react';
import { Select } from '../../components/ui/Select';
import { useProject } from '../../providers/ProjectContext';
import { PipelineService } from '../../services/api';
import { createTrainingJob, fetchTrainingOptions } from '../../services/jobService';
import { CANONICAL_TRAINING_OPTIONS, type TrainingOptions } from '../../types/job';
import { TrainingTimeTravelPanel } from './TrainingTimeTravelPanel';

export function ViewAsCodeStudio({ onNavigate, onShowToast: _onShowToast }: { onNavigate?: (tab: any) => void; onShowToast?: (title: string, desc?: string, type?: "error" | "info" | "success") => void }) {
  const { dataset, selectedFeatures, selectedTarget, trainingConfig, setTrainingConfig, activeJob, setActiveJob, setLifecycleStage } = useProject();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(1);
  const [trainingOptions, setTrainingOptions] = useState<TrainingOptions>(CANONICAL_TRAINING_OPTIONS);

  // Bind to config OR default to context
  const [targetColumn, setTargetColumn] = useState('');
  const [featureColumns, setFeatureColumns] = useState('');
  const [imputerStrategy, setImputerStrategy] = useState('median');
  const [scalerType, setScalerType] = useState('standard_scaler');
  const [algorithm, setAlgorithm] = useState('random_forest_classifier');
  const [testSize, setTestSize] = useState(0.2);

  // Initialize from project context
  useEffect(() => {
    if (trainingConfig) {
      setTargetColumn(trainingConfig.target_column);
      setFeatureColumns(trainingConfig.feature_columns.join(', '));
      setImputerStrategy(trainingConfig.imputer);
      setScalerType(trainingConfig.scaler);
      setAlgorithm(trainingConfig.algorithm);
      setTestSize(trainingConfig.train_test_split);
    } else if (selectedTarget || selectedFeatures.length > 0) {
      setTargetColumn(selectedTarget || '');
      setFeatureColumns(selectedFeatures.join(', '));
    }
  }, [trainingConfig, selectedTarget, selectedFeatures]);

  const [generatedCode, setGeneratedCode] = useState<string>('# Loading generated code...');

  useEffect(() => {
    fetchTrainingOptions().then(setTrainingOptions).catch(console.error);
    setLifecycleStage('pipeline');
  }, [setLifecycleStage]);

  // Derived code block via API
  useEffect(() => {
    let active = true;
    const generate = async () => {
      try {
        const feats = featureColumns.split(',').map(f => f.trim()).filter(Boolean);
        const dag = {
          dataset_name: dataset?.fileName || trainingConfig?.dataset_name || 'dataset.csv',
          target_column: targetColumn || 'target',
          feature_columns: feats,
          nodes: [
            { node_id: 'n1', type: 'imputer', name: 'Simple Imputer', params: { strategy: imputerStrategy } },
            { node_id: 'n2', type: 'scaler', name: 'Feature Scaler', params: { type: scalerType } },
            { node_id: 'n3', type: 'estimator', name: 'ML Algorithm', params: { type: algorithm } }
          ]
        };
        const resp = await PipelineService.generateCode(dag, true, true);
        if (active) {
          setGeneratedCode(resp.python_code);
        }
      } catch (err) {
        if (active) {
          setGeneratedCode('# Error generating code\n' + String(err));
        }
      }
    };
    generate();
    return () => { active = false; };
  }, [dataset, featureColumns, targetColumn, imputerStrategy, scalerType, algorithm, testSize]);

  const copyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunPipeline = async () => {
    if (!dataset || !dataset.datasetId) return;
    try {
      setLoading(true);
      setError(null);
      const feats = featureColumns.split(',').map(f => f.trim()).filter(Boolean);
      
      const payload = {
        dataset_id: dataset.datasetId,
        target_column: targetColumn,
        feature_columns: feats,
        algorithm: algorithm,
        scaler: scalerType,
        imputer: imputerStrategy,
        train_test_split: testSize,
        cv_folds: 5,
        random_seed: 42,
      };

      const job = await createTrainingJob(payload);
      setActiveJob(job);
      
      setTrainingConfig({
        dataset_id: dataset.datasetId,
        dataset_name: dataset.fileName,
        target_column: targetColumn,
        feature_columns: feats,
        algorithm: algorithm,
        scaler: scalerType,
        imputer: imputerStrategy,
        train_test_split: testSize,
        cv_folds: 5,
        random_seed: 42,
        selection_source: 'manual'
      });
      
      // We do not navigate automatically here, the user can watch it or navigate
      // but let's notify the system
    } catch (err: any) {
      setError(err.message || 'Failed to submit training job');
    } finally {
      setLoading(false);
    }
  };

  if (!dataset && !trainingConfig) {
    return (
      <div role="region" aria-label="Empty Pipeline Studio" style={{ textAlign: 'center', padding: '64px 24px', background: '#1B1530', borderRadius: 12, border: '1px solid rgba(107, 92, 166, 0.2)', maxWidth: 600, margin: '48px auto' }}>
        <h2 style={{ color: '#F5F1EC', marginBottom: 8 }}>No Active Dataset or Training Configuration</h2>
        <p style={{ color: '#9E93B8', fontSize: 13, marginBottom: 16 }}>Pipeline Studio requires an active dataset. Please upload one in the Dataset & Profiler workspace.</p>
        <button onClick={() => onNavigate?.('workspace')} style={{ padding: '8px 16px', background: '#4B3B7C', color: '#FFF', borderRadius: 6, border: 'none', cursor: 'pointer' }}>Go to Dataset and Profiler</button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" style={{ paddingBottom: activeJob ? 80 : 0 }}>
      {/* HEADER BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,212,255,0.08)', paddingBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#F5F1EC', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Code2 size={24} color="#00D4FF" /> View-as-Code Studio
          </h1>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: '4px 0 0 0' }}>Build pipelines visually. Watch production-ready scikit-learn code compile in real-time.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, padding: '4px 8px', background: 'rgba(34,197,94,0.1)', color: '#22C55E', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={12} /> AST Validated
          </span>
          <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            {copied ? <Check size={14} color="#00F5A0" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy Code'}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', borderRadius: 6, fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 24, alignItems: 'start' }}>
        {/* ZONE A: Controls (Col 1-4) */}
        <div style={{ gridColumn: 'span 4 / span 4', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#1B1530', border: '1px solid rgba(107,92,166,0.18)', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#00D4FF', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sliders size={14} /> Pipeline Controls
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 10, color: '#9E93B8', marginBottom: 4, display: 'block' }}>Target Column (y)</label>
                <input value={targetColumn} onChange={e => setTargetColumn(e.target.value)} style={{ width: '100%', background: '#0B0912', border: '1px solid rgba(107,92,166,0.3)', color: '#FFF', padding: '8px 12px', borderRadius: 6, fontSize: 12 }} />
              </div>
              
              <div>
                <label style={{ fontSize: 10, color: '#9E93B8', marginBottom: 4, display: 'block' }}>Feature Columns (X)</label>
                <input value={featureColumns} onChange={e => setFeatureColumns(e.target.value)} style={{ width: '100%', background: '#0B0912', border: '1px solid rgba(107,92,166,0.3)', color: '#FFF', padding: '8px 12px', borderRadius: 6, fontSize: 12 }} />
              </div>

              <div>
                <label style={{ fontSize: 10, color: '#9E93B8', marginBottom: 4, display: 'block' }}>Missing Imputer</label>
                <Select value={imputerStrategy} onChange={setImputerStrategy} options={trainingOptions.imputers.map(o => ({ value: o.key, label: o.display_name }))} />
              </div>

              <div>
                <label style={{ fontSize: 10, color: '#9E93B8', marginBottom: 4, display: 'block' }}>Feature Scaler</label>
                <Select value={scalerType} onChange={setScalerType} options={trainingOptions.scalers.map(o => ({ value: o.key, label: o.display_name }))} />
              </div>

              <div>
                <label style={{ fontSize: 10, color: '#9E93B8', marginBottom: 4, display: 'block' }}>Algorithm</label>
                <Select value={algorithm} onChange={setAlgorithm} options={trainingOptions.algorithms.map(o => ({ value: o.key, label: o.display_name }))} />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9E93B8', marginBottom: 4 }}>
                  <span>Test Split Ratio</span>
                  <span style={{ color: '#00D4FF', fontFamily: 'monospace' }}>{(testSize * 100).toFixed(0)}% Test</span>
                </div>
                <input type="range" min="0.1" max="0.5" step="0.05" value={testSize} onChange={e => setTestSize(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#00D4FF' }} />
              </div>

              <button onClick={handleRunPipeline} disabled={loading} style={{ width: '100%', background: 'linear-gradient(135deg, #4B3B7C, #6E1423)', color: '#FFF', border: 'none', padding: '10px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8 }}>
                {loading ? 'Compiling...' : 'Run Pipeline 🚀'}
              </button>
            </div>
          </div>
        </div>

        {/* ZONE B: Code Studio (Col 5-12) */}
        <div style={{ gridColumn: 'span 8 / span 8', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#0B0912', border: '1px solid rgba(107,92,166,0.3)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <div style={{ background: '#101E36', padding: '10px 16px', borderBottom: '1px solid rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5A623' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
                </div>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#00D4FF', marginLeft: 8 }}>pipeline_generated.py</span>
              </div>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748B' }}>Python 3.10 / scikit-learn</span>
            </div>
            <pre style={{ padding: 20, margin: 0, fontSize: 12, color: '#E2E8F0', overflowX: 'auto', maxHeight: 460, fontFamily: 'monospace', lineHeight: 1.5 }}>
              <code>{generatedCode}</code>
            </pre>
          </div>

          <div style={{ background: '#1B1530', border: '1px solid rgba(107,92,166,0.18)', borderRadius: 12, padding: 20 }}>
             <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#7B5CF5', marginBottom: 12 }}>Learning Mode — Step Breakdown</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { step: 1, title: 'Data Loading & Setup', desc: 'The CSV is read into a pandas DataFrame. We separate the target variable (y) from the inputs (X).' },
                  { step: 2, title: 'Preprocessing Definition', desc: `We assemble an automated strategy to handle missing values using '${imputerStrategy}' and scale numerical data via '${scalerType}'.` },
                  { step: 3, title: 'Pipeline Construction', desc: 'The preprocessing steps and the ML algorithm are bundled together. This prevents data leakage during training.' },
                  { step: 4, title: 'Model Training', desc: `The dataset is randomly split: ${(1-testSize)*100}% for training and ${testSize*100}% for testing.` },
                  { step: 5, title: 'Evaluation', desc: 'The trained model predicts outcomes for the unseen test data. Metrics evaluate its generalization performance.' }
                ].map(s => (
                  <div key={s.step} style={{ border: '1px solid rgba(107,92,166,0.3)', borderRadius: 8, background: '#0B0912', overflow: 'hidden' }}>
                    <button onClick={() => setActiveStep(activeStep === s.step ? null : s.step)} style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: '#F5F1EC' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(123,92,245,0.2)', color: '#7B5CF5', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.step}</span>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{s.title}</span>
                      </div>
                      {activeStep === s.step ? <ChevronDown size={14} color="#64748B" /> : <ChevronRight size={14} color="#64748B" />}
                    </button>
                    {activeStep === s.step && (
                      <div style={{ padding: '0 16px 12px 48px', fontSize: 11, color: '#94A3B8', lineHeight: 1.4 }}>{s.desc}</div>
                    )}
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>

      {/* ZONE C: Training Time Travel Panel */}
      {activeJob && (
        <TrainingTimeTravelPanel 
          jobId={activeJob.job_id} 
          metrics={(activeJob.metadata?.epochs as any) || []} 
        />
      )}
    </motion.div>
  );
}
