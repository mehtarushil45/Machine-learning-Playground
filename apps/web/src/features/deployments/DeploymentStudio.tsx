import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Rocket,
  Copy,
  Check,
  Terminal,
  Code2,
  Globe,
  Activity,
  PlusCircle,
  CheckCircle2
} from 'lucide-react';
import { DeploymentService, DeploymentResponse, IntegrationSnippets } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';

interface DeploymentStudioProps {
  onShowToast?: (title: string, description?: string) => void;
}

export const DeploymentStudio: React.FC<DeploymentStudioProps> = ({ onShowToast }) => {
  const [modelId, setModelId] = useState('model-default');
  const [depName, setDepName] = useState('Production Customer Churn API');
  const [rateLimit, setRateLimit] = useState(60);

  const [selectedDep, setSelectedDep] = useState<DeploymentResponse | null>(null);
  const [snippets, setSnippets] = useState<IntegrationSnippets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'curl' | 'python' | 'js' | 'widget'>('curl');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // useAsync pattern for deployments fetching
  const fetchDeploymentsFn = useCallback(async (signal: AbortSignal) => {
    const list = await DeploymentService.listDeployments(signal);
    if (list.length > 0 && !selectedDep) {
      selectDeployment(list[0]);
    }
    return list;
  }, [selectedDep]);

  const { data: fetchedDeployments, isLoading: isDeploymentsLoading, execute: refetchDeployments } = useAsync<DeploymentResponse[]>(
    fetchDeploymentsFn,
    true
  );

  const deployments = fetchedDeployments || [];

  const handleCreateDeployment = async () => {
    setLoading(true);
    setError(null);
    try {
      const newDep = await DeploymentService.createDeployment(modelId, depName, rateLimit);
      await refetchDeployments();
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
      className="space-y-8"
    >
      {/* Studio Header */}
      <div className="border-b border-[rgba(0,212,255,0.08)] pb-6">
        <h1 className="heading-display text-2xl flex items-center gap-2.5">
          <Rocket className="w-6 h-6 text-[#00F5A0]" /> 1-Click Deployment Studio & Embeddable Web Widgets
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Deploy trained models to high-throughput REST endpoints with secret API keys (`ak_live_...`), rate limits, and auto-generated HTML/JS web widgets.
        </p>
      </div>

      {error && (
        <div className="badge-failed p-4 border rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left 5 Cols: Create & Active List */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Create Form */}
          <div className="quantum-card space-y-5">
            <h3 className="micro-label flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-[#00F5A0]" /> Deploy New Model Endpoint
            </h3>

            <div>
              <label className="micro-label block mb-1.5">Model Identifier</label>
              <input
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="e.g. model-79a23ef3"
                className="quantum-input"
              />
            </div>

            <div>
              <label className="micro-label block mb-1.5">Deployment Label</label>
              <input
                type="text"
                value={depName}
                onChange={(e) => setDepName(e.target.value)}
                placeholder="e.g. Production Customer Churn API"
                className="quantum-input"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1.5">
                <span className="text-[#94A3B8]">Rate Limit (Requests / Minute)</span>
                <span className="text-[#00F5A0] font-mono">{rateLimit} RPM</span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                step="10"
                value={rateLimit}
                onChange={(e) => setRateLimit(parseInt(e.target.value) || 60)}
                className="w-full accent-[#00F5A0]"
              />
            </div>

            <button
              onClick={handleCreateDeployment}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Deploying Model Endpoint...' : '🚀 Deploy Model Endpoint'}
            </button>
          </div>

          {/* Active Deployments List */}
          <div className="quantum-card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="micro-label flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#00F5A0]" /> Active Endpoints
              </h3>
              <span className="badge-running">
                {deployments.length} Active
              </span>
            </div>

            <div className="space-y-3">
              {isDeploymentsLoading ? (
                <>
                  <CardSkeleton />
                  <CardSkeleton />
                </>
              ) : deployments.length === 0 ? (
                <EmptyState
                  icon={Rocket}
                  title="No Active Endpoints"
                  description="Deploy a trained model above to generate real-time REST prediction APIs and Web Widgets."
                  actionLabel="Deploy Default Model"
                  onAction={handleCreateDeployment}
                />
              ) : (
                deployments.map((d) => {
                  const isSelected = selectedDep?.deployment_id === d.deployment_id;
                  return (
                    <div
                      key={d.deployment_id}
                      onClick={() => selectDeployment(d)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#00F5A0]/10 border-[#00F5A0]/50 shadow-[0_0_15px_rgba(0,245,160,0.15)]'
                          : 'bg-[#040912] border-[#152540] hover:border-[#00D4FF]/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-100">{d.deployment_name}</div>
                        <span className="badge-running">
                          ACTIVE
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#64748B] mt-2">
                        <span>{d.deployment_id}</span>
                        <span>{d.rate_limit_rpm} RPM</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right 7 Cols: SDK Snippets & Embed Code Viewer */}
        <div className="lg:col-span-7 quantum-card space-y-6">
          {selectedDep ? (
            <div className="space-y-6">
              {/* Live Status Header */}
              <div className="p-4 rounded-xl bg-[#040912] border border-[#152540] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-sm font-bold text-white">{selectedDep.deployment_name}</h3>
                    <div className="text-xs text-[#64748B] font-mono mt-0.5">ID: {selectedDep.deployment_id}</div>
                  </div>
                  <span className="badge-running flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> LIVE REST API
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                  <div className="p-2.5 rounded-lg bg-[#070E1C] border border-[#152540] space-y-1">
                    <div className="micro-label">Endpoint URL</div>
                    <div className="font-mono text-slate-200 truncate flex items-center justify-between">
                      <span className="truncate">{selectedDep.endpoint_url}</span>
                      <button
                        onClick={() => handleCopy(selectedDep.endpoint_url, 'Endpoint URL')}
                        className="btn-icon !p-1 ml-2"
                      >
                        {copiedField === 'Endpoint URL' ? <Check className="w-3.5 h-3.5 text-[#00F5A0]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#070E1C] border border-[#152540] space-y-1">
                    <div className="micro-label">Secret API Key</div>
                    <div className="font-mono text-[#FF4D6D] truncate flex items-center justify-between">
                      <span className="truncate">{selectedDep.api_key}</span>
                      <button
                        onClick={() => handleCopy(selectedDep.api_key, 'API Key')}
                        className="btn-icon !p-1 ml-2"
                      >
                        {copiedField === 'API Key' ? <Check className="w-3.5 h-3.5 text-[#00F5A0]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Code Snippet Tabs */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-[#152540] pb-2">
                  {[
                    { id: 'curl', label: 'cURL', icon: <Terminal className="w-3.5 h-3.5" /> },
                    { id: 'python', label: 'Python SDK', icon: <Code2 className="w-3.5 h-3.5" /> },
                    { id: 'js', label: 'JavaScript', icon: <Globe className="w-3.5 h-3.5" /> },
                    { id: 'widget', label: 'HTML Web Widget', icon: <Rocket className="w-3.5 h-3.5" /> },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={activeTab === tab.id ? 'btn-secondary !py-1.5 !px-3 !text-xs' : 'btn-icon !py-1.5 !px-3 text-xs'}
                    >
                      {tab.icon} {tab.label}
                    </button>
                  ))}
                </div>

                {/* Code Terminal Viewport */}
                <div className="quantum-terminal overflow-hidden relative">
                  <div className="px-4 py-2 bg-[#0C1A30] border-b border-[rgba(0,212,255,0.1)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FF4D6D]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#F5A623]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00F5A0]" />
                      <span className="text-[11px] font-mono text-[#00D4FF] ml-2">{activeTab.toUpperCase()} Integration</span>
                    </div>

                    <button
                      onClick={() => {
                        const jsCode = snippets?.javascript_snippet || `// JavaScript Fetch Integration
fetch('${selectedDep.endpoint_url}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${selectedDep.api_key}'
  },
  body: JSON.stringify({ features: { feature_1: 1.0, feature_2: 0.5 } })
})
.then(res => res.json())
.then(data => console.log('Prediction:', data));`;

                        const snippetMap = {
                          curl: snippets?.curl_snippet,
                          python: snippets?.python_snippet,
                          js: jsCode,
                          widget: snippets?.embeddable_widget_html
                        };
                        handleCopy(snippetMap[activeTab] || '', 'Code Snippet');
                      }}
                      className="btn-icon !p-1"
                      title="Copy Snippet"
                    >
                      {copiedField === 'Code Snippet' ? <Check className="w-3.5 h-3.5 text-[#00F5A0]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <pre className="p-5 text-xs font-mono text-[#E2E8F0] overflow-x-auto max-h-[360px] leading-relaxed">
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
            <div className="text-xs text-[#475569] text-center py-16">
              Select an active deployment from the left to view integration SDK snippets.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
