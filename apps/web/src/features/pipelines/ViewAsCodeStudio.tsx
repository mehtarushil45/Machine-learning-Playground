import React, { useState, useEffect } from 'react';
import { PipelineService, PipelineDAG, CodeGenerationResponse } from '../../services/api';

export const ViewAsCodeStudio: React.FC = () => {
  const [targetColumn, setTargetColumn] = useState('target');
  const [featureColumns, setFeatureColumns] = useState('feat_0, feat_1, feat_2, feat_3');
  const [imputerStrategy, setImputerStrategy] = useState('median');
  const [scalerType, setScalerType] = useState('standard');
  const [algorithm, setAlgorithm] = useState('RandomForestClassifier');
  const [testSize, setTestSize] = useState(0.2);

  const [generatedCode, setGeneratedCode] = useState<CodeGenerationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const handleGenerateCode = async () => {
    setLoading(true);
    setError(null);
    const featureList = featureColumns.split(',').map((s) => s.trim()).filter(Boolean);
    const dag: PipelineDAG = {
      dataset_name: 'dataset.csv',
      target_column: targetColumn,
      feature_columns: featureList,
      nodes: [
        { node_id: 'n1', type: 'missing_value_handler', name: 'Imputer',          params: { strategy: imputerStrategy } },
        { node_id: 'n2', type: 'scaler',                name: 'Scaler',           params: { scaler_type: scalerType }   },
        { node_id: 'n3', type: 'train_test_split',       name: 'Train-Test Split', params: { test_size: testSize }       },
        { node_id: 'n4', type: 'algorithm',              name: algorithm,          params: { algorithm }                 },
      ],
    };
    try {
      const res = await PipelineService.generateCode(dag, true, true);
      setGeneratedCode(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { handleGenerateCode(); }, [imputerStrategy, scalerType, algorithm, testSize]);

  const pipelineNodes = [
    { icon: '📂', label: 'Dataset Input',    sublabel: `target: ${targetColumn}`,              color: 'rgba(34,211,238,0.10)',  border: 'rgba(34,211,238,0.28)'  },
    { icon: '🩹', label: 'Missing Values',   sublabel: `Strategy: ${imputerStrategy}`,          color: 'rgba(124,90,247,0.10)', border: 'rgba(124,90,247,0.28)' },
    { icon: '📐', label: 'Feature Scaling',  sublabel: `Scaler: ${scalerType}`,                 color: 'rgba(124,90,247,0.10)', border: 'rgba(124,90,247,0.28)' },
    { icon: '✂️', label: 'Train-Test Split', sublabel: `Test: ${(testSize * 100).toFixed(0)}%`, color: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.28)'  },
    { icon: '🌲', label: algorithm.replace('Classifier', '').replace('Regression', ''), sublabel: 'Model Training', color: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.28)' },
  ];

  return (
    <div className="mlp-page mlp-anim-fadeInUp">
      {/* Page header */}
      <div className="mlp-page-header">
        <div className="mlp-page-title">⚡ Bi-Directional View-as-Code Studio</div>
        <p className="mlp-page-subtitle">
          Configure your visual ML pipeline. Every node change instantly regenerates production-grade Python scikit-learn code with live AST validation.
        </p>
      </div>

      {error && <div className="mlp-alert mlp-alert-error" style={{ marginBottom: 24 }}>{error}</div>}

      {/* Three-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 180px 1fr', gap: 24, alignItems: 'start' }}>

        {/* Column 1 — Configuration */}
        <div className="mlp-card">
          <div className="mlp-section-title">Pipeline Configuration</div>

          <div style={{ marginBottom: 16 }}>
            <label className="mlp-label">Target Column (y)</label>
            <input className="mlp-input" value={targetColumn} onChange={(e) => setTargetColumn(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="mlp-label">Feature Columns (X)</label>
            <input className="mlp-input" value={featureColumns} onChange={(e) => setFeatureColumns(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="mlp-label">Missing Value Imputer</label>
            <select className="mlp-select" value={imputerStrategy} onChange={(e) => setImputerStrategy(e.target.value)}>
              <option value="median">Median (Robust)</option>
              <option value="mean">Mean Imputer</option>
              <option value="most_frequent">Most Frequent</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="mlp-label">Feature Scaler</label>
            <select className="mlp-select" value={scalerType} onChange={(e) => setScalerType(e.target.value)}>
              <option value="standard">StandardScaler</option>
              <option value="minmax">MinMaxScaler [0,1]</option>
              <option value="robust">RobustScaler</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="mlp-label">Algorithm</label>
            <select className="mlp-select" value={algorithm} onChange={(e) => setAlgorithm(e.target.value)}>
              <option value="RandomForestClassifier">Random Forest</option>
              <option value="LogisticRegression">Logistic Regression</option>
              <option value="DecisionTreeClassifier">Decision Tree</option>
            </select>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label className="mlp-label">Test Split — {(testSize * 100).toFixed(0)}%</label>
            <input type="range" min="0.1" max="0.5" step="0.05" value={testSize}
              onChange={(e) => setTestSize(parseFloat(e.target.value))} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
              <span>10%</span><span>50%</span>
            </div>
          </div>
          <button className="mlp-btn mlp-btn-primary mlp-btn-full" onClick={handleGenerateCode} disabled={loading}>
            {loading ? '⏳ Generating…' : '🔄 Re-Generate Code'}
          </button>
        </div>

        {/* Column 2 — Visual DAG node chain */}
        <div className="mlp-card" style={{ padding: '20px 14px' }}>
          <div className="mlp-section-title">Visual DAG</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
            {pipelineNodes.map((node, idx) => (
              <div key={idx} style={{ position: 'relative' }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '10px 8px', borderRadius: 'var(--radius-sm)',
                  background: node.color, border: `1px solid ${node.border}`,
                  textAlign: 'center', gap: 4,
                }}>
                  <span style={{ fontSize: 20 }}>{node.icon}</span>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>{node.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{node.sublabel}</div>
                </div>
                {idx < pipelineNodes.length - 1 && (
                  <div style={{ textAlign: 'center', fontSize: 16, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1 }}>↓</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Column 3 — Code editor + learning steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Code block */}
          <div className="mlp-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--brand-cyan)', fontSize: 15 }}>🐍</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Auto-Generated Python — scikit-learn</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {generatedCode?.is_valid_syntax && <span className="mlp-badge mlp-badge-pass">✓ Valid AST</span>}
                {loading && <span className="mlp-badge mlp-badge-info">Generating…</span>}
              </div>
            </div>
            <pre className="mlp-code-block" style={{ borderRadius: 0, border: 'none', maxHeight: 380 }}>
              <code>{generatedCode?.python_code || '# Generating production-grade pipeline code…'}</code>
            </pre>
          </div>

          {/* Learning mode accordion */}
          <div className="mlp-card">
            <div className="mlp-section-title">🎓 Learning Mode — Step Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(generatedCode?.steps_explanation ?? []).map((step) => (
                <div key={step.step_number} className={`mlp-step${activeStep === step.step_number ? ' open' : ''}`}>
                  <div className="mlp-step-header"
                    onClick={() => setActiveStep(activeStep === step.step_number ? null : step.step_number)}>
                    <span className="mlp-step-num">{step.step_number}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{step.title}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                      {activeStep === step.step_number ? '▲' : '▼'}
                    </span>
                  </div>
                  {activeStep === step.step_number && (
                    <div className="mlp-step-body">{step.explanation}</div>
                  )}
                </div>
              ))}
              {!generatedCode && (
                <div className="mlp-empty">
                  <span className="mlp-empty-icon">📖</span>
                  <span className="mlp-empty-text">Step annotations will appear here once code is generated.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
