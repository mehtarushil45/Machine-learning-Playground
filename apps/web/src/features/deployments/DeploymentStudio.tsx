import React, { useState, useEffect } from 'react';
import { DeploymentService, DeploymentResponse, IntegrationSnippets } from '../../services/api';

export const DeploymentStudio: React.FC = () => {
  const [modelId, setModelId] = useState('model-default');
  const [depName, setDepName] = useState('Production Customer Churn API');
  const [rateLimit, setRateLimit] = useState(60);

  const [deployments, setDeployments] = useState<DeploymentResponse[]>([]);
  const [selectedDep, setSelectedDep] = useState<DeploymentResponse | null>(null);
  const [snippets, setSnippets] = useState<IntegrationSnippets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'curl' | 'python' | 'js' | 'widget'>('curl');

  useEffect(() => {
    loadDeployments();
  }, []);

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

  return (
    <div className="mlp-page mlp-anim-fadeInUp">
      <div className="mlp-page-header">
        <div className="mlp-page-title">🚀 Deployment Studio & Web Widgets</div>
        <p className="mlp-page-subtitle">
          Deploy trained models instantly with 1-click REST endpoint generation, secret API key authentication, rate-limiting, and auto-generated embeddable web widgets.
        </p>
      </div>

      {error && <div className="mlp-alert mlp-alert-error" style={{ marginBottom: 24 }}>{error}</div>}

      <div className="mlp-grid-auto-lg">
        {/* Left Column: Deployment Setup & Active Endpoint List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Create Form Card */}
          <div className="mlp-card">
            <div className="mlp-section-title">⚡ 1-Click Model Deployment</div>

            <div style={{ marginBottom: 16 }}>
              <label className="mlp-label">Model ID</label>
              <input
                className="mlp-input"
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="e.g. model-79a23ef3"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="mlp-label">Deployment Label</label>
              <input
                className="mlp-input"
                type="text"
                value={depName}
                onChange={(e) => setDepName(e.target.value)}
                placeholder="e.g. Production Customer Churn API"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="mlp-label" style={{ margin: 0 }}>Rate Limit (Requests / Min)</label>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono', color: 'var(--brand-cyan)' }}>
                  {rateLimit} RPM
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                step="10"
                value={rateLimit}
                onChange={(e) => setRateLimit(parseInt(e.target.value) || 60)}
              />
            </div>

            <button
              className="mlp-btn mlp-btn-success mlp-btn-full"
              onClick={handleCreateDeployment}
              disabled={loading}
            >
              {loading ? '🚀 Deploying Endpoint...' : '🚀 Deploy Model Endpoint'}
            </button>
          </div>

          {/* Active Deployments List */}
          <div className="mlp-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="mlp-section-title" style={{ margin: 0 }}>Active Endpoints</div>
              <span className="mlp-badge mlp-badge-info">{deployments.length} Active</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deployments.map((d) => (
                <div
                  key={d.deployment_id}
                  onClick={() => selectDeployment(d)}
                  className={`mlp-dep-card${selectedDep?.deployment_id === d.deployment_id ? ' selected' : ''}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>{d.deployment_name}</div>
                    <span className="mlp-badge mlp-badge-pass" style={{ fontSize: 10 }}>ACTIVE</span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{d.deployment_id}</span>
                    <span>{d.rate_limit_rpm} RPM</span>
                  </div>
                </div>
              ))}
              {deployments.length === 0 && (
                <div className="mlp-empty">
                  <span className="mlp-empty-icon">📡</span>
                  <span className="mlp-empty-text">No active deployments yet. Deploy a model above!</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Code Snippets & Widget Preview */}
        <div className="mlp-card">
          {selectedDep ? (
            <div className="mlp-anim-fadeIn">
              {/* Header Info */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
                marginBottom: 20,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{selectedDep.deployment_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>ID: <code style={{ color: 'var(--brand-cyan)' }}>{selectedDep.deployment_id}</code></div>
                  </div>
                  <span className="mlp-badge mlp-badge-pass" style={{ fontSize: 12, padding: '4px 12px' }}>
                    ● LIVE ENDPOINT
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                  <div style={{ background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 700, uppercase: 'true', letterSpacing: '0.05em' }}>ENDPOINT URL</div>
                    <div style={{ fontFamily: 'JetBrains Mono', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: 4 }}>
                      {selectedDep.endpoint_url}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 700, uppercase: 'true', letterSpacing: '0.05em' }}>SECRET API KEY</div>
                    <div style={{ fontFamily: 'JetBrains Mono', color: 'var(--brand-red)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: 4 }}>
                      {selectedDep.api_key}
                    </div>
                  </div>
                </div>
              </div>

              {/* Code Snippet Tabs */}
              <div className="mlp-section-title" style={{ marginBottom: 12 }}>🛠️ Integration SDK Snippets & Embed Code</div>
              
              <div className="mlp-tab-nav" style={{ marginBottom: 16 }}>
                <button
                  className={`mlp-tab-btn${activeTab === 'curl' ? ' active' : ''}`}
                  onClick={() => setActiveTab('curl')}
                >
                  cURL
                </button>
                <button
                  className={`mlp-tab-btn${activeTab === 'python' ? ' active' : ''}`}
                  onClick={() => setActiveTab('python')}
                >
                  Python SDK
                </button>
                <button
                  className={`mlp-tab-btn${activeTab === 'js' ? ' active' : ''}`}
                  onClick={() => setActiveTab('js')}
                >
                  JavaScript Fetch
                </button>
                <button
                  className={`mlp-tab-btn${activeTab === 'widget' ? ' active' : ''}`}
                  onClick={() => setActiveTab('widget')}
                >
                  Embeddable HTML Widget
                </button>
              </div>

              {/* Snippet Output */}
              {activeTab === 'curl' && (
                <pre className="mlp-code-block" style={{ maxHeight: 320 }}>
                  <code>{snippets?.curl_snippet || '# Loading snippet...'}</code>
                </pre>
              )}
              {activeTab === 'python' && (
                <pre className="mlp-code-block" style={{ maxHeight: 320 }}>
                  <code>{snippets?.python_snippet || '# Loading snippet...'}</code>
                </pre>
              )}
              {activeTab === 'js' && (
                <pre className="mlp-code-block" style={{ maxHeight: 320 }}>
                  <code>{snippets?.javascript_snippet || `// JavaScript Fetch Integration
fetch('${selectedDep.endpoint_url}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${selectedDep.api_key}'
  },
  body: JSON.stringify({ features: { feature_1: 1.0, feature_2: 0.5 } })
})
.then(res => res.json())
.then(data => console.log('Prediction:', data));`}</code>
                </pre>
              )}
              {activeTab === 'widget' && (
                <pre className="mlp-code-block" style={{ maxHeight: 320 }}>
                  <code>{snippets?.embeddable_widget_html || '# Loading HTML widget code...'}</code>
                </pre>
              )}
            </div>
          ) : (
            <div className="mlp-empty" style={{ minHeight: 400 }}>
              <span className="mlp-empty-icon">🚀</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                Select a Deployment
              </div>
              <span className="mlp-empty-text">
                Select an endpoint from the left or deploy a new model to generate live integration SDKs.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
