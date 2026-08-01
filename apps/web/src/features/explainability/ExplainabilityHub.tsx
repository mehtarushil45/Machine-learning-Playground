import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  BarChart3,
  Scale,
  HelpCircle,
  ShieldCheck,
  AlertTriangle,
  Sliders,
  TrendingUp,
  Grid,
  CheckCircle2,
  XCircle,
  Info
} from 'lucide-react';
import { ExplainabilityService, GlobalExplainabilityResponse, FairnessAuditResponse, WhatIfResponse } from '../../services/api';

export const ExplainabilityHub: React.FC = () => {
  const [globalExp, setGlobalExp] = useState<GlobalExplainabilityResponse | null>(null);
  const [fairnessAudit, setFairnessAudit] = useState<FairnessAuditResponse | null>(null);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // What-if simulator sliders
  const [feat0, setFeat0] = useState(0.8);
  const [feat1, setFeat1] = useState(-1.2);
  const [feat2, setFeat2] = useState(2.1);
  const [feat3, setFeat3] = useState(0.4);
  const [desiredOutcome, setDesiredOutcome] = useState('1');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const glob = await ExplainabilityService.getGlobalExplainability();
      setGlobalExp(glob);

      const sampleData = Array.from({ length: 40 }, (_, i) => ({
        feat_0: Math.random(), feat_1: Math.random(), feat_2: Math.random(), feat_3: Math.random(),
        gender: i % 2 === 0 ? 'Male' : 'Female',
      }));
      const fair = await ExplainabilityService.auditFairness(sampleData, 'gender', 'Male', 'Female');
      setFairnessAudit(fair);
      await runWhatIf();
    } catch (err) {
      console.error('Explainability load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const runWhatIf = async () => {
    try {
      const sample = { feat_0: feat0, feat_1: feat1, feat_2: feat2, feat_3: feat3 };
      const res = await ExplainabilityService.simulateWhatIf(sample, desiredOutcome);
      setWhatIfResult(res);
    } catch (err) {
      console.error('What-If error:', err);
    }
  };

  useEffect(() => { runWhatIf(); }, [feat0, feat1, feat2, feat3, desiredOutcome]);

  // Synthetic confusion matrix metrics for model audit evaluation lab
  const confusionMatrix = {
    tp: 42, fp: 6,
    fn: 4,  tn: 48,
    total: 100,
    precision: 0.875,
    recall: 0.913,
    f1: 0.893
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-[1600px] mx-auto space-y-8"
    >
      {/* Page Header */}
      <div className="border-b border-slate-800/80 pb-6">
        <h1 className="text-2xl font-extrabold tracking-tight gradient-heading flex items-center gap-2.5">
          <Sparkles className="w-6 h-6 text-purple-400" /> Explainability, Bias & Model Evaluation Lab
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Audit machine learning decision boundaries for SHAP feature attribution, legal demographic fairness (EEOC 80% rule), and confusion matrix metrics.
        </p>
      </div>

      {loading && (
        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" /> Loading model evaluation audit...
        </div>
      )}

      {/* Top 2 Cards: Global SHAP & Confusion Matrix Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* SHAP Feature Importance */}
        <div className="glass-panel p-6 rounded-2xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" /> Global Feature Importance (SHAP)
            </h3>
            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              TreeExplainer
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {globalExp?.summary_explanation || 'Calculating global SHAP feature impact rankings...'}
          </p>

          <div className="space-y-4 pt-2">
            {(globalExp?.global_feature_importance ?? []).map((item, idx) => (
              <div key={item.feature_name} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-200">{item.feature_name}</span>
                  <span className="text-indigo-400 font-mono">{item.impact_percentage.toFixed(1)}% Impact</span>
                </div>
                <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.impact_percentage}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Confusion Matrix & Model Metrics Dashboard */}
        <div className="glass-panel p-6 rounded-2xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Grid className="w-4 h-4 text-cyan-400" /> Confusion Matrix & Metrics Lab
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Accuracy: 90.0%
            </span>
          </div>

          {/* Interactive Heatmap Matrix Grid */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-1 hover:border-emerald-500/60 transition-all">
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">True Positives (TP)</div>
              <div className="text-2xl font-extrabold text-white font-mono">{confusionMatrix.tp}</div>
              <div className="text-[10px] text-slate-400">Correctly Predicted Positive</div>
            </div>

            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-center space-y-1 hover:border-rose-500/60 transition-all">
              <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">False Positives (FP)</div>
              <div className="text-2xl font-extrabold text-white font-mono">{confusionMatrix.fp}</div>
              <div className="text-[10px] text-slate-400">Type I Error</div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center space-y-1 hover:border-amber-500/60 transition-all">
              <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">False Negatives (FN)</div>
              <div className="text-2xl font-extrabold text-white font-mono">{confusionMatrix.fn}</div>
              <div className="text-[10px] text-slate-400">Type II Error</div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-center space-y-1 hover:border-indigo-500/60 transition-all">
              <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">True Negatives (TN)</div>
              <div className="text-2xl font-extrabold text-white font-mono">{confusionMatrix.tn}</div>
              <div className="text-[10px] text-slate-400">Correctly Predicted Negative</div>
            </div>
          </div>

          {/* Metric Bar Summaries */}
          <div className="grid grid-cols-3 gap-3 pt-2 text-center">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-semibold">Precision</div>
              <div className="text-sm font-bold font-mono text-cyan-400 mt-0.5">{(confusionMatrix.precision * 100).toFixed(1)}%</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-semibold">Recall</div>
              <div className="text-sm font-bold font-mono text-indigo-400 mt-0.5">{(confusionMatrix.recall * 100).toFixed(1)}%</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-semibold">F1-Score</div>
              <div className="text-sm font-bold font-mono text-purple-400 mt-0.5">{(confusionMatrix.f1 * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Demographic Bias & Fairness Scorecard */}
      <div className="glass-panel p-6 rounded-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Scale className="w-4 h-4 text-emerald-400" /> Legal Demographic Fairness Scorecard (EEOC 80% Rule)
          </h3>
          {fairnessAudit && (
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              fairnessAudit.overall_status === 'PASS'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              STATUS: {fairnessAudit.overall_status}
            </span>
          )}
        </div>

        {fairnessAudit && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">Audit Recommendation:</strong> {fairnessAudit.recommendation}
                <div className="text-[11px] text-slate-400 mt-1">
                  Disparate Impact Ratio: <strong className="text-emerald-400 font-mono">{fairnessAudit.disparate_impact_ratio.toFixed(2)}</strong> (Threshold ≥ 0.80)
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {fairnessAudit.metrics.map((m) => (
                <div key={m.metric_name} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <div className="text-xs font-bold text-slate-200">{m.metric_name}</div>
                  <div className="text-lg font-extrabold font-mono text-emerald-400">{m.value.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-400">Legal Threshold: {m.threshold.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Interactive What-If Counterfactual Simulator */}
      <div className="glass-panel p-6 rounded-2xl space-y-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" /> Interactive "What-If" Counterfactual Simulator
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Sliders Pane */}
          <div className="lg:col-span-6 space-y-4">
            {[
              { label: 'feat_0', val: feat0, set: setFeat0 },
              { label: 'feat_1', val: feat1, set: setFeat1 },
              { label: 'feat_2', val: feat2, set: setFeat2 },
              { label: 'feat_3', val: feat3, set: setFeat3 },
            ].map((f) => (
              <div key={f.label} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300">{f.label}</span>
                  <span className="font-mono text-cyan-400">{f.val >= 0 ? '+' : ''}{f.val.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="-3"
                  max="3"
                  step="0.1"
                  value={f.val}
                  onChange={(e) => f.set(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            ))}

            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Desired Target Outcome</label>
              <select
                value={desiredOutcome}
                onChange={(e) => setDesiredOutcome(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="0">Class 0 (Negative)</option>
                <option value="1">Class 1 (Positive Outcome)</option>
              </select>
            </div>
          </div>

          {/* Outcome Simulation Card */}
          <div className="lg:col-span-6 glass-panel p-6 rounded-xl border border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Simulation Outcome</h4>

            {whatIfResult ? (
              <div className="space-y-4">
                <div className="flex items-center justify-around py-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Original</div>
                    <div className="text-2xl font-bold text-white font-mono">{whatIfResult.original_prediction}</div>
                  </div>
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Desired</div>
                    <div className="text-2xl font-bold text-cyan-400 font-mono">{whatIfResult.desired_prediction}</div>
                  </div>
                </div>

                <div className="text-center">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${
                    whatIfResult.is_outcome_achieved
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {whatIfResult.is_outcome_achieved ? '✓ Outcome Achieved' : '✗ Not Yet Achieved'}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                  {whatIfResult.explanation}
                </p>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Simulation Confidence</span>
                    <span className="font-mono text-cyan-400 font-bold">{(whatIfResult.new_confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${whatIfResult.new_confidence * 100}%` }} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-8">
                Adjust sliders to run counterfactual simulation.
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
