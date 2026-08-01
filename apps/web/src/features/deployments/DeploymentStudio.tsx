import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Rocket,
  Key,
  ShieldCheck,
  Copy,
  Check,
  Terminal,
  Code2,
  Globe,
  Activity,
  PlusCircle,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { DeploymentService, DeploymentResponse, IntegrationSnippets } from '../../services/api';

interface DeploymentStudioProps {
  onShowToast?: (title: string, description?: string) => void;
}

export const DeploymentStudio: React.FC<DeploymentStudioProps> = ({ onShowToast }) => {
  const [modelId, setModelId] = useState('model-default');
  const [depName, setDepName] = useState('Production Customer Churn API');
  const [rateLimit, setRateLimit] = useState(60);

  const [deployments, setDeployments] = useState<DeploymentResponse[]>([]);
  const [selectedDep, setSelectedDep] = useState<DeploymentResponse | null>(null);
  const [snippets, setSnippets] = useState<IntegrationSnippets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'curl' | 'python' | 'js' | 'widget'>('curl');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => { loadDeployments(); }, []);

  const loadDeployments = async () => {
    try {
      const list = await DeploymentService.listDeployments();
      setDeployments(list);
      if (list.length > 0 && !selectedDep) {
        selectDeployment(list[0]);
      }
    } catch (err: any) {
      console.error('Load deployments error:', err);
    }
  };

  const handleCreateDeployment = async () => {
    setLoading(true);
    setError(null);
    try {
      const newDep = await DeploymentService.createDeployment(modelId, depName, rateLimit);
      await loadDeployments();
      selectDeployment(newDep);
      if (onShowToast) onShowToast('Deployment Created!', `Endpoint ${newDep.deployment_id} is live.`);
    } catch (err: any) {
      setError(err.message || 'Deployment creation failed');
    } finally {
      setLoading(false);
    }
  };

  const selectDeployment = async (dep: DeploymentResponse) => {
    setSelectedDep(dep);
    try {
      const snip = await DeploymentService.getSnippets(dep.deployment_id);
      setSnippets(snip);
    } catch (err) {
      console.error('Snippet load error:', err);
    }
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    if (onShowToast) onShowToast('Copied to Clipboard!', `${fieldName} copied.`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-[1600px] mx-auto space-y-8"
    >
      {/* Studio Header */}
      <div className="border-b border-slate-800/80 pb-6">
        <h1 className="text-2xl font-extrabold tracking-tight gradient-heading flex items-center gap-2.5">
          <Rocket className="w-6 h-6 text-emerald-400" /> 1-Click Deployment Studio & Embeddable Web Widgets
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Deploy trained models to high-throughput REST endpoints with secret API keys (`ak_live_...`), rate limits, and auto-generated HTML/JS web widgets.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left 5 Cols: Create & Active List */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Create Form */}
          <div className="glass-panel p-6 rounded-2xl space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-emerald-400" /> Deploy New Model Endpoint
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Model Identifier</label>
              <input
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="e.g. model-79a23ef3"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Deployment Label</label>
              <input
                type="text"
                value={depName}
                onChange={(e) => setDepName(e.target.value)}
                placeholder="e.g. Production Customer Churn API"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1.5">
                <span className="text-slate-300">Rate Limit (Requests / Minute)</span>
                <span className="text-emerald-400 font-mono">{rateLimit} RPM</span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                step="10"
                value={rateLimit}
                onChange={(e) => setRateLimit(parseInt(e.target.value) || 60)}
                className="w-full accent-emerald-500"
              />
            </div>

            <button
              onClick={handleCreateDeployment}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer hover:scale-[1.01]"
            >
              {loading ? 'Deploying Model Endpoint...' : '🚀 Deploy Model Endpoint'}
            </button>
          </div>

          {/* Active Deployments List */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" /> Active Endpoints
              </h3>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {deployments.length} Active
              </span>
            </div>

            <div className="space-y-3">
              {deployments.map((d) => {
                const isSelected = selectedDep?.deployment_id === d.deployment_id;
                return (
                  <div
                    key={d.deployment_id}
                    onClick={() => selectDeployment(d)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-100">{d.deployment_name}</div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                        ACTIVE
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2">
                      <span>{d.deployment_id}</span>
                      <span>{d.rate_limit_rpm} RPM</span>
                    </div>
                  </div>
                );
              })}

              {deployments.length === 0 && (
                <div className="text-xs text-slate-500 text-center py-6">
                  No active deployments yet. Deploy an endpoint above!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 7 Cols: SDK Snippets & Embed Code Viewer */}
        <div className="lg:col-span-7 glass-panel p-6 rounded-2xl space-y-6">
          {selectedDep ? (
            <div className="space-y-6">
              {/* Live Status Header */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedDep.deployment_name}</h3>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">ID: {selectedDep.deployment_id}</div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> LIVE REST API
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Endpoint URL</div>
                    <div className="font-mono text-slate-200 truncate flex items-center justify-between">
                      <span className="truncate">{selectedDep.endpoint_url}</span>
                      <button
                        onClick={() => handleCopy(selectedDep.endpoint_url, 'Endpoint URL')}
                        className="text-slate-400 hover:text-white shrink-0 ml-2"
                      >
                        {copiedField === 'Endpoint URL' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Secret API Key</div>
                    <div className="font-mono text-rose-400 truncate flex items-center justify-between">
                      <span className="truncate">{selectedDep.api_key}</span>
                      <button
                        onClick={() => handleCopy(selectedDep.api_key, 'API Key')}
                        className="text-slate-400 hover:text-white shrink-0 ml-2"
                      >
                        {copiedField === 'API Key' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Code Snippet Tabs */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  {[
                    { id: 'curl', label: 'cURL', icon: <Terminal className="w-3.5 h-3.5" /> },
                    { id: 'python', label: 'Python SDK', icon: <Code2 className="w-3.5 h-3.5" /> },
                    { id: 'js', label: 'JavaScript', icon: <Globe className="w-3.5 h-3.5" /> },
                    { id: 'widget', label: 'HTML Web Widget', icon: <Rocket className="w-3.5 h-3.5" /> },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                        activeTab === tab.id
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      {tab.icon} {tab.label}
                    </button>
                  ))}
                </div>

                {/* Code Terminal Viewport */}
                <div className="code-terminal rounded-xl overflow-hidden relative">
                  <button
                    onClick={() => {
                      const snippetMap = {
                        curl: snippets?.curl_snippet,
                        python: snippets?.python_snippet,
                        js: `fetch('${selectedDep.endpoint_url}', ...)`,
                        widget: snippets?.embeddable_widget_html
                      };
                      handleCopy(snippetMap[activeTab] || '', 'Code Snippet');
                    }}
                    className="absolute top-3 right-3 text-slate-400 hover:text-white p-1.5 rounded bg-slate-900/80 border border-slate-800"
                    title="Copy Snippet"
                  >
                    {copiedField === 'Code Snippet' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>

                  <pre className="p-5 text-xs font-mono text-slate-200 overflow-x-auto max-h-[360px] leading-relaxed">
                    <code>
                      {activeTab === 'curl' && (snippets?.curl_snippet || '# Loading snippet...')}
                      {activeTab === 'python' && (snippets?.python_snippet || '# Loading snippet...')}
                      {activeTab === 'js' && (snippets?.javascript_snippet || `// JavaScript Fetch Integration
fetch('${selectedDep.endpoint_url}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${selectedDep.api_key}'
  },
  body: JSON.stringify({ features: { feature_1: 1.0, feature_2: 0.5 } })
})
.then(res => res.json())
.then(data => console.log('Prediction:', data));`)}
                      {activeTab === 'widget' && (snippets?.embeddable_widget_html || '# Loading HTML widget snippet...')}
                    </code>
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-16">
              Select an active deployment from the left to view integration SDK snippets.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
