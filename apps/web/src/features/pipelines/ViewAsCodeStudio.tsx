import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Code2,
  Copy,
  Check,
  Zap,
  Sliders,
  Database,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  HelpCircle,
  FileCode,
  ArrowRight
} from 'lucide-react';
import { PipelineService, PipelineDAG, CodeGenerationResponse } from '../../services/api';

interface ViewAsCodeStudioProps {
  onShowToast?: (title: string, description?: string) => void;
}

export const ViewAsCodeStudio: React.FC<ViewAsCodeStudioProps> = ({ onShowToast }) => {
  const [targetColumn, setTargetColumn] = useState('target');
  const [featureColumns, setFeatureColumns] = useState('feat_0, feat_1, feat_2, feat_3');
  const [imputerStrategy, setImputerStrategy] = useState('median');
  const [scalerType, setScalerType] = useState('standard');
  const [algorithm, setAlgorithm] = useState('RandomForestClassifier');
  const [testSize, setTestSize] = useState(0.2);

  const [generatedCode, setGeneratedCode] = useState<CodeGenerationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(1);

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

  const copyCode = () => {
    if (generatedCode?.python_code) {
      navigator.clipboard.writeText(generatedCode.python_code);
      setCopied(true);
      if (onShowToast) onShowToast('Code Copied!', 'Python scikit-learn script copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const nodeChain = [
    { id: 1, title: 'Dataset Input', desc: `y: ${targetColumn}`, icon: <Database className="w-4 h-4 text-[#00D4FF]" />, badge: 'Input' },
    { id: 2, title: 'Missing Value Imputer', desc: `strategy: ${imputerStrategy}`, icon: <Layers className="w-4 h-4 text-[#7B5CF5]" />, badge: 'Preprocess' },
    { id: 3, title: 'Feature Scaler', desc: `scaler: ${scalerType}`, icon: <Sliders className="w-4 h-4 text-[#7B5CF5]" />, badge: 'Preprocess' },
    { id: 4, title: 'Train/Test Split', desc: `ratio: ${(testSize * 100).toFixed(0)}% test`, icon: <Zap className="w-4 h-4 text-[#F5A623]" />, badge: 'Split' },
    { id: 5, title: algorithm.replace('Classifier', '').replace('Regression', ''), desc: 'Model Trainer', icon: <Sparkles className="w-4 h-4 text-[#00F5A0]" />, badge: 'Model' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[rgba(0,212,255,0.08)] pb-6">
        <div>
          <h1 className="heading-display text-2xl flex items-center gap-2.5">
            <Code2 className="w-6 h-6 text-[#00D4FF]" /> Bi-Directional View-as-Code Studio
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Build machine learning DAG pipelines visually. Adjust node parameters to watch production-ready Python scikit-learn code compile in real-time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {generatedCode?.is_valid_syntax && (
            <span className="badge-running flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> AST Syntax Validated
            </span>
          )}
          <button onClick={copyCode} className="btn-secondary">
            {copied ? <Check className="w-4 h-4 text-[#00F5A0]" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied to Clipboard' : 'Copy Python Code'}
          </button>
        </div>
      </div>

      {error && (
        <div className="badge-failed p-4 border rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {/* Split-View Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left 5 Cols: Visual Workflow Canvas & Controls */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Controls Card */}
          <div className="quantum-card space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="micro-label flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#00D4FF]" /> Pipeline Controls
              </h3>
              <button onClick={handleGenerateCode} disabled={loading} className="btn-primary !py-1.5 !px-3 !text-xs">
                {loading ? 'Compiling...' : 'Run Pipeline →'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="micro-label block mb-1.5">Target Column (y)</label>
                <input
                  type="text"
                  value={targetColumn}
                  onChange={(e) => setTargetColumn(e.target.value)}
                  className="quantum-input"
                />
              </div>

              <div>
                <label className="micro-label block mb-1.5">Feature Columns (X)</label>
                <input
                  type="text"
                  value={featureColumns}
                  onChange={(e) => setFeatureColumns(e.target.value)}
                  className="quantum-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="micro-label block mb-1.5">Missing Imputer</label>
                <select
                  value={imputerStrategy}
                  onChange={(e) => setImputerStrategy(e.target.value)}
                  className="quantum-input"
                >
                  <option value="median">Median Imputer</option>
                  <option value="mean">Mean Imputer</option>
                  <option value="most_frequent">Most Frequent</option>
                </select>
              </div>

              <div>
                <label className="micro-label block mb-1.5">Feature Scaler</label>
                <select
                  value={scalerType}
                  onChange={(e) => setScalerType(e.target.value)}
                  className="quantum-input"
                >
                  <option value="standard">StandardScaler</option>
                  <option value="minmax">MinMaxScaler [0,1]</option>
                  <option value="robust">RobustScaler</option>
                </select>
              </div>
            </div>

            <div>
              <label className="micro-label block mb-1.5">Classifier Model</label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value)}
                className="quantum-input"
              >
                <option value="RandomForestClassifier">Random Forest Classifier</option>
                <option value="LogisticRegression">Logistic Regression</option>
                <option value="DecisionTreeClassifier">Decision Tree Classifier</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1.5">
                <span className="text-[#94A3B8]">Test Split Ratio</span>
                <span className="text-[#00D4FF] font-mono">{(testSize * 100).toFixed(0)}% Test / {((1 - testSize) * 100).toFixed(0)}% Train</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.5"
                step="0.05"
                value={testSize}
                onChange={(e) => setTestSize(parseFloat(e.target.value))}
                className="w-full accent-[#00D4FF]"
              />
            </div>
          </div>

          {/* Visual DAG Node Chain */}
          <div className="quantum-card space-y-4">
            <h3 className="micro-label flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#00D4FF]" /> Visual Pipeline Graph
            </h3>

            <div className="space-y-3">
              {nodeChain.map((node, idx) => (
                <React.Fragment key={node.id}>
                  <div className="p-3.5 rounded-xl bg-[#040912] border border-[rgba(255,255,255,0.06)] flex items-center justify-between hover:border-[#00D4FF]/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-[#101E36] border border-[#152540] shrink-0">
                        {node.icon}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-100">{node.title}</div>
                        <div className="text-[11px] text-[#64748B] font-mono mt-0.5">{node.desc}</div>
                      </div>
                    </div>
                    <span className="badge-idle !text-[10px]">
                      {node.badge}
                    </span>
                  </div>
                  {idx < nodeChain.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ChevronDown className="w-4 h-4 text-[#334155]" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Synchronized Terminal Code Editor & Learning Mode */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Synchronized Terminal Window */}
          <div className="quantum-terminal rounded-xl overflow-hidden shadow-2xl">
            {/* Top window bar: 3 dots (red/yellow/green) + tab name in mono */}
            <div className="px-4 py-3 bg-[#0C1A30] border-b border-[rgba(0,212,255,0.1)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF4D6D]" />
                <div className="w-3 h-3 rounded-full bg-[#F5A623]" />
                <div className="w-3 h-3 rounded-full bg-[#00F5A0]" />
                <span className="ml-2 text-xs font-mono text-[#00D4FF] flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5" /> pipeline_generated.py
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-[#475569]">Python 3.10 / scikit-learn</span>
                <button onClick={copyCode} className="btn-icon" title="Copy code">
                  {copied ? <Check className="w-4 h-4 text-[#00F5A0]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Code Viewport */}
            <pre className="p-6 text-xs leading-relaxed text-[#E2E8F0] overflow-x-auto max-h-[460px] font-mono">
              <code>{generatedCode?.python_code || '# Compiling scikit-learn pipeline code...'}</code>
            </pre>
          </div>

          {/* Learning Mode Step Breakdown */}
          <div className="quantum-card space-y-4">
            <h3 className="micro-label flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#7B5CF5]" /> Learning Mode — Step Breakdown
            </h3>

            <div className="space-y-2">
              {(generatedCode?.steps_explanation ?? []).map((step) => {
                const isOpen = activeStep === step.step_number;
                return (
                  <div
                    key={step.step_number}
                    className="border border-[#152540] rounded-xl overflow-hidden transition-all bg-[#040912]"
                  >
                    <button
                      onClick={() => setActiveStep(isOpen ? null : step.step_number)}
                      className="w-full px-4 py-3 hover:bg-[#101E36] flex items-center justify-between text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-[#7B5CF5]/20 text-[#7B5CF5] text-xs font-bold flex items-center justify-center border border-[#7B5CF5]/30 shrink-0">
                          {step.step_number}
                        </span>
                        <span className="text-xs font-bold text-slate-200">{step.title}</span>
                      </div>
                      {isOpen ? <ChevronDown className="w-4 h-4 text-[#64748B]" /> : <ChevronRight className="w-4 h-4 text-[#64748B]" />}
                    </button>
                    {isOpen && (
                      <div className="p-4 text-xs text-[#94A3B8] leading-relaxed border-t border-[#152540]">
                        {step.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
