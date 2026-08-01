import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Code2,
  Play,
  Copy,
  Check,
  Zap,
  Sliders,
  Database,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Terminal,
  CheckCircle2,
  HelpCircle,
  FileCode
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
    { id: 1, title: 'Dataset Input', desc: `y: ${targetColumn}`, icon: <Database className="w-4 h-4 text-cyan-400" />, badge: 'Input' },
    { id: 2, title: 'Missing Value Imputer', desc: `strategy: ${imputerStrategy}`, icon: <Layers className="w-4 h-4 text-indigo-400" />, badge: 'Preprocess' },
    { id: 3, title: 'Feature Scaler', desc: `scaler: ${scalerType}`, icon: <Sliders className="w-4 h-4 text-purple-400" />, badge: 'Preprocess' },
    { id: 4, title: 'Train/Test Split', desc: `ratio: ${(testSize * 100).toFixed(0)}% test`, icon: <Zap className="w-4 h-4 text-amber-400" />, badge: 'Split' },
    { id: 5, title: algorithm.replace('Classifier', '').replace('Regression', ''), desc: 'Model Trainer', icon: <Sparkles className="w-4 h-4 text-emerald-400" />, badge: 'Model' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-[1600px] mx-auto space-y-8"
    >
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight gradient-heading flex items-center gap-2.5">
            <Code2 className="w-6 h-6 text-indigo-400" /> Bi-Directional View-as-Code Studio
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Build machine learning DAG pipelines visually. Adjust node parameters to watch production-ready Python scikit-learn code compile in real-time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {generatedCode?.is_valid_syntax && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
              <CheckCircle2 className="w-3.5 h-3.5" /> AST Syntax Validated
            </span>
          )}
          <button
            onClick={copyCode}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer hover:scale-[1.02]"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied to Clipboard' : 'Copy Python Code'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Split-View Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left 5 Cols: Visual Workflow Canvas & Controls */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Controls Card */}
          <div className="glass-panel p-6 rounded-2xl space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" /> Pipeline Controls
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Target Column (y)</label>
                <input
                  type="text"
                  value={targetColumn}
                  onChange={(e) => setTargetColumn(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Feature Columns (X)</label>
                <input
                  type="text"
                  value={featureColumns}
                  onChange={(e) => setFeatureColumns(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Missing Imputer</label>
                <select
                  value={imputerStrategy}
                  onChange={(e) => setImputerStrategy(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="median">Median Imputer</option>
                  <option value="mean">Mean Imputer</option>
                  <option value="most_frequent">Most Frequent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Feature Scaler</label>
                <select
                  value={scalerType}
                  onChange={(e) => setScalerType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="standard">StandardScaler</option>
                  <option value="minmax">MinMaxScaler [0,1]</option>
                  <option value="robust">RobustScaler</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Classifier Model</label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="RandomForestClassifier">Random Forest Classifier</option>
                <option value="LogisticRegression">Logistic Regression</option>
                <option value="DecisionTreeClassifier">Decision Tree Classifier</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1.5">
                <span className="text-slate-300">Test Split Ratio</span>
                <span className="text-indigo-400 font-mono">{(testSize * 100).toFixed(0)}% Test / {((1 - testSize) * 100).toFixed(0)}% Train</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.5"
                step="0.05"
                value={testSize}
                onChange={(e) => setTestSize(parseFloat(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          {/* Visual DAG Node Chain */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" /> Visual Pipeline Graph
            </h3>

            <div className="space-y-3">
              {nodeChain.map((node, idx) => (
                <React.Fragment key={node.id}>
                  <div className="glass-panel-interactive p-3.5 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                        {node.icon}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-100">{node.title}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{node.desc}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                      {node.badge}
                    </span>
                  </div>
                  {idx < nodeChain.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ChevronDown className="w-4 h-4 text-slate-600" />
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
          <div className="code-terminal rounded-2xl overflow-hidden shadow-2xl">
            {/* Window Header Bar */}
            <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-cyan-400" /> pipeline_generated.py
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-500">Python 3.10 / scikit-learn</span>
                <button
                  onClick={copyCode}
                  className="text-slate-400 hover:text-white p-1 rounded transition-colors"
                  title="Copy code"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Code Viewport */}
            <pre className="p-6 text-xs leading-relaxed text-slate-200 overflow-x-auto max-h-[460px] font-mono">
              <code>{generatedCode?.python_code || '# Compiling scikit-learn pipeline code...'}</code>
            </pre>
          </div>

          {/* Learning Mode Step Breakdown */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400" /> Learning Mode — Step Breakdown
            </h3>

            <div className="space-y-2">
              {(generatedCode?.steps_explanation ?? []).map((step) => {
                const isOpen = activeStep === step.step_number;
                return (
                  <div
                    key={step.step_number}
                    className="border border-slate-800 rounded-xl overflow-hidden transition-all"
                  >
                    <button
                      onClick={() => setActiveStep(isOpen ? null : step.step_number)}
                      className="w-full px-4 py-3 bg-slate-900/60 hover:bg-slate-900 flex items-center justify-between text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center border border-indigo-500/30 shrink-0">
                          {step.step_number}
                        </span>
                        <span className="text-xs font-bold text-slate-200">{step.title}</span>
                      </div>
                      {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </button>
                    {isOpen && (
                      <div className="p-4 bg-slate-950/60 text-xs text-slate-400 leading-relaxed border-t border-slate-800/80">
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
