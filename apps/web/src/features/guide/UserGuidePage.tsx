/**
 * UserGuidePage — Enterprise MLOps Architectural Guide & Operational Reference
 *
 * Provides a comprehensive, interactive visual walkthrough of the 4 core enterprise pillars:
 * 1. Dataset Engine & Feature Governance (DuckDB out-of-core profiling, leakage detection, immutable SHA-256)
 * 2. Monaco Code Studio & Pipeline Guardian (VS Code core, AST validation, cause-and-effect diffs, sandboxed execution)
 * 3. Experiment Tracking & Model Registry (MLflow-standard leaderboard, confusion matrix, threshold tuning, SHAP)
 * 4. Model Serving & Batch CSV Scoring (Low-latency REST endpoints, bulk scoring, P99 telemetry, PSI/KS drift monitoring)
 */
import { useState, useMemo } from 'react';
import {
  BookOpen,
  Database,
  Code2,
  BarChart2,
  Rocket,
  Search,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  Layers,
  Activity,
  Zap,
  Sliders,
  Keyboard,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';

// Enterprise Palette Design Tokens
const TOKENS = {
  bgBase: '#050B14',
  bgSurface: '#0A1424',
  bgElevated: '#101F38',
  border: 'rgba(0, 212, 255, 0.14)',
  borderActive: 'rgba(0, 212, 255, 0.4)',
  primary: '#00D4FF',
  primaryGlow: 'rgba(0, 212, 255, 0.25)',
  accentEmerald: '#00F5A0',
  accentAmber: '#F59E0B',
  accentRose: '#F43F5E',
  accentViolet: '#818CF8',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  codeBg: '#030712',
} as const;

interface UserGuidePageProps {
  onNavigate?: (tab: string) => void;
}

export function UserGuidePage({ onNavigate }: UserGuidePageProps) {
  const [activeSection, setActiveSection] = useState<string>('intro');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArchNode, setSelectedArchNode] = useState<string>('pillars');
  const [copiedShortcut, setCopiedShortcut] = useState<string | null>(null);

  const sections = useMemo(
    () => [
      { id: 'intro', label: 'Platform Architecture & Topology', icon: <Layers className="w-4 h-4" /> },
      { id: 'pillar1', label: '1. Dataset Engine & Governance', icon: <Database className="w-4 h-4" /> },
      { id: 'pillar2', label: '2. Monaco Code Studio & Guardian', icon: <Code2 className="w-4 h-4" /> },
      { id: 'pillar3', label: '3. Experiment Tracking & Registry', icon: <BarChart2 className="w-4 h-4" /> },
      { id: 'pillar4', label: '4. Model Serving & Batch Scoring', icon: <Rocket className="w-4 h-4" /> },
      { id: 'metrics', label: 'Diagnostic Metrics & Formulas', icon: <Activity className="w-4 h-4" /> },
      { id: 'glossary', label: 'MLOps & ML Glossary', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'shortcuts', label: 'Keyboard Shortcuts Cheatsheet', icon: <Keyboard className="w-4 h-4" /> },
      { id: 'faqs', label: 'Frequently Asked Questions', icon: <HelpCircle className="w-4 h-4" /> },
      { id: 'pitfalls', label: 'Enterprise Pitfalls to Avoid', icon: <AlertTriangle className="w-4 h-4" /> },
    ],
    []
  );

  const handleReturnToPlatform = () => {
    if (window.opener) {
      window.close();
    } else if (onNavigate) {
      onNavigate('workspace');
    } else {
      window.location.hash = '';
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedShortcut(text);
    setTimeout(() => setCopiedShortcut(null), 2000);
  };

  // Glossary Items
  const glossaryTerms = useMemo(
    () => [
      {
        term: 'Overfitting',
        category: 'Modeling',
        definition:
          'When a model memorizes the training data perfectly like a parrot, achieving near-zero training error but failing to generalize to unseen test data.',
      },
      {
        term: 'Target Leakage',
        category: 'Data Governance',
        definition:
          'When an input feature contains information that will only become available after the target event occurs (e.g. cancellation_date when predicting churn). Automatically flagged if correlation > 0.98.',
      },
      {
        term: 'Population Stability Index (PSI)',
        category: 'Drift Telemetry',
        definition:
          'Statistical metric measuring the magnitude of shift between production inference feature distributions and the training baseline. PSI < 0.1 indicates stability; PSI > 0.25 flags severe drift requiring retraining.',
      },
      {
        term: 'Kolmogorov-Smirnov (KS) Test',
        category: 'Drift Telemetry',
        definition:
          'Non-parametric statistical hypothesis test evaluating if continuous production feature distributions match the baseline dataset with p-value significance.',
      },
      {
        term: 'Hyperparameter',
        category: 'Optimization',
        definition:
          'External configuration parameters set before training begins (such as learning_rate, n_estimators, max_depth) that govern the learning process.',
      },
      {
        term: 'One-Hot Encoding',
        category: 'Preprocessing',
        definition:
          'Transforming discrete categorical strings into binary indicator columns (0 or 1) suitable for numerical matrix computation.',
      },
      {
        term: 'Imputation',
        category: 'Data Governance',
        definition:
          'Mathematical replacement of missing values using statistically justified estimators (median, mode, iterative, or KNN) to prevent runtime NaN errors.',
      },
      {
        term: 'Cross-Validation (CV)',
        category: 'Validation',
        definition:
          'Partitioning data into k distinct folds to iteratively train and validate models, ensuring evaluation stability across data splits.',
      },
      {
        term: 'Class Imbalance',
        category: 'Modeling',
        definition:
          'A severe skew in label distribution (e.g. 99% legitimate vs 1% fraud) where raw accuracy becomes deceptive and F1-Score or PR-AUC is required.',
      },
      {
        term: 'Model Registry Staging',
        category: 'MLOps Governance',
        definition:
          'Formal lifecycle state machine: Experiment -> Candidate (Staging) -> Champion (Production) -> Archived with automated audit lineage.',
      },
    ],
    []
  );

  // Keyboard Shortcuts
  const shortcuts = useMemo(
    () => [
      { key: 'Ctrl + Enter', description: 'Run Pipeline in Code Studio' },
      { key: 'Ctrl + S', description: 'Save Pipeline Code & AST State' },
      { key: 'Ctrl + F', description: 'Find & Replace in Monaco Editor' },
      { key: 'Ctrl + K', description: 'Focus Global Command & Guide Search' },
      { key: 'Alt + Up / Down', description: 'Move Line Up / Down in Monaco' },
      { key: 'Ctrl + /', description: 'Toggle Line Comment in Monaco' },
    ],
    []
  );

  // FAQs
  const faqs = useMemo(
    () => [
      {
        q: 'How does DuckDB prevent Out-Of-Memory (OOM) crashes on large datasets?',
        a: 'DuckDB uses vectorized, memory-mapped streaming execution. Rather than loading entire 10GB+ CSV or Parquet files into RAM like pandas, it streams data in small vector chunks directly from disk or S3.',
      },
      {
        q: 'How does the Pipeline Guardian prevent broken execution?',
        a: 'The Pipeline Guardian parses the Python abstract syntax tree (AST) on every keystroke. If you introduce a fatal syntax error, missing import, or invalid hyperparameter, the execution runner is safely guarded with clear diagnostic warnings.',
      },
      {
        q: 'What is the Champion vs Candidate Model Registry workflow?',
        a: 'Trained models start as Experiments. High-performing runs can be promoted to Candidate (Staging) for integration testing. Once verified, a Candidate is promoted to Champion (Production), instantly receiving live REST traffic.',
      },
      {
        q: 'How does Bulk Batch CSV Scoring handle missing columns?',
        a: 'The Batch Scoring Engine validates incoming CSV headers against the Champion model’s serialized feature schema. Missing non-critical columns receive automatic baseline imputation; missing mandatory features raise an explicit error payload.',
      },
      {
        q: 'What triggers automated data drift warnings?',
        a: 'Every 5 minutes, the Telemetry daemon computes Population Stability Index (PSI) and Kolmogorov-Smirnov (KS) statistics between live production inference logs and baseline training data. If PSI > 0.25, a drift alert is dispatched.',
      },
    ],
    []
  );

  // Search filtering logic
  const filteredGlossary = useMemo(() => {
    if (!searchQuery.trim()) return glossaryTerms;
    const q = searchQuery.toLowerCase();
    return glossaryTerms.filter(
      (item) => item.term.toLowerCase().includes(q) || item.definition.toLowerCase().includes(q)
    );
  }, [glossaryTerms, searchQuery]);

  const filteredFaqs = useMemo(() => {
    if (!searchQuery.trim()) return faqs;
    const q = searchQuery.toLowerCase();
    return faqs.filter(
      (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
    );
  }, [faqs, searchQuery]);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: TOKENS.bgBase,
        color: TOKENS.textPrimary,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(10, 20, 36, 0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid ' + TOKENS.border,
          padding: '12px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #00D4FF, #00F5A0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#050B14',
              fontWeight: 900,
              fontSize: 14,
              boxShadow: '0 0 16px rgba(0, 212, 255, 0.35)',
            }}
          >
            ML
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: TOKENS.textPrimary }}>
              ML Playground — Enterprise MLOps Guide
            </div>
            <div style={{ fontSize: 11, color: TOKENS.textMuted }}>
              Production Architecture, Core Pillars, and Operational Reference
            </div>
          </div>
        </div>

        {/* Global Search Input */}
        <div style={{ position: 'relative', width: 340, display: 'flex', alignItems: 'center' }}>
          <Search style={{ position: 'absolute', left: 12, width: 14, height: 14, color: TOKENS.textMuted }} />
          <input
            type="text"
            data-testid="guide-search-input"
            placeholder="Search pillars, metrics, shortcuts, or glossary..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: 8,
              border: '1px solid ' + TOKENS.border,
              background: 'rgba(16, 31, 56, 0.7)',
              color: TOKENS.textPrimary,
              fontSize: 12.5,
              outline: 'none',
              transition: 'border-color 150ms ease',
            }}
          />
        </div>

        {/* Open Workspace Action */}
        <button
          onClick={handleReturnToPlatform}
          data-testid="guide-open-workspace"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid ' + TOKENS.borderActive,
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(0, 245, 160, 0.15))',
            color: TOKENS.primary,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <span>Open Workspace</span>
          <ExternalLink style={{ width: 13, height: 13 }} />
        </button>
      </header>

      {/* ── Main Layout (Sidebar + Content) ───────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        {/* Left Sticky Navigation Sidebar */}
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid ' + TOKENS.border,
            padding: '24px 16px',
            position: 'sticky',
            top: 59,
            height: 'calc(100vh - 59px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: TOKENS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
              paddingLeft: 8,
            }}
          >
            Core Architecture & Pillars
          </div>

          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => {
                setActiveSection(sec.id);
                const el = document.getElementById(sec.id);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                border: 'none',
                background: activeSection === sec.id ? 'rgba(0, 212, 255, 0.14)' : 'transparent',
                color: activeSection === sec.id ? TOKENS.primary : TOKENS.textSecondary,
                fontWeight: activeSection === sec.id ? 700 : 500,
                fontSize: 12.5,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <span style={{ color: activeSection === sec.id ? TOKENS.primary : TOKENS.textMuted }}>
                {sec.icon}
              </span>
              <span>{sec.label}</span>
            </button>
          ))}

          {/* Quick Stats Footnote */}
          <div style={{ marginTop: 'auto', paddingTop: 20 }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(0, 212, 255, 0.05)',
                border: '1px solid ' + TOKENS.border,
                fontSize: 11,
                color: TOKENS.textSecondary,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, color: TOKENS.primary, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Enterprise SLA</span>
              </div>
              <div>Designed to scale across 100k+ concurrent users with zero in-memory bottlenecks.</div>
            </div>
          </div>
        </aside>

        {/* ── Main Content Area ────────────────────────────────────────── */}
        <main style={{ flex: 1, padding: '36px 48px', overflowY: 'auto', lineHeight: 1.6 }}>

          {/* ── SECTION: ARCHITECTURE & TOPOLOGY ───────────────────────── */}
          <section id="intro" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Layers className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Distributed Systems Architecture
              </span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 14px', letterSpacing: '-0.02em' }}>
              Enterprise ML Platform Architectural Topology
            </h1>
            <p style={{ fontSize: 14.5, color: TOKENS.textSecondary, maxWidth: 840, margin: '0 0 24px' }}>
              Built for high concurrency and zero Out-Of-Memory (OOM) failures. The system is split across decoupled tiers:
              stateless API gateways, out-of-core profiling engines (DuckDB), isolated Monaco execution sandboxes, MLflow-grade experiment tracking, and low-latency serving with real-time drift telemetry.
            </p>

            {/* Interactive Visual Topology SVG */}
            <div
              data-testid="architecture-topology-diagram"
              style={{
                borderRadius: 12,
                background: 'rgba(10, 20, 36, 0.7)',
                border: '1px solid ' + TOKENS.border,
                padding: '24px',
                marginBottom: 28,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity className="w-4 h-4" />
                  <span>Interactive System Flow (Click tiers to inspect responsibilities)</span>
                </div>
                <div style={{ fontSize: 11, color: TOKENS.textMuted }}>
                  Tier: <strong style={{ color: TOKENS.accentEmerald }}>{selectedArchNode.toUpperCase()}</strong>
                </div>
              </div>

              {/* Architecture SVG Diagram */}
              <svg
                viewBox="0 0 840 280"
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, background: TOKENS.codeBg }}
              >
                {/* Client Layer */}
                <g
                  onClick={() => setSelectedArchNode('clients')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="20"
                    y="20"
                    width="800"
                    height="40"
                    rx="6"
                    fill={selectedArchNode === 'clients' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(16, 31, 56, 0.7)'}
                    stroke={selectedArchNode === 'clients' ? TOKENS.primary : 'rgba(255, 255, 255, 0.1)'}
                    strokeWidth="1.5"
                  />
                  <text x="420" y="45" fill={TOKENS.textPrimary} fontSize="12" fontWeight="700" textAnchor="middle">
                    CLIENT LAYER: Web Monaco IDE • Python SDK • cURL / REST Invocations • Batch CSV Dropzone
                  </text>
                </g>

                {/* Gateway Layer */}
                <g
                  onClick={() => setSelectedArchNode('gateway')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="20"
                    y="80"
                    width="800"
                    height="40"
                    rx="6"
                    fill={selectedArchNode === 'gateway' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(16, 31, 56, 0.7)'}
                    stroke={selectedArchNode === 'gateway' ? TOKENS.primary : 'rgba(255, 255, 255, 0.1)'}
                    strokeWidth="1.5"
                  />
                  <text x="420" y="105" fill={TOKENS.textPrimary} fontSize="12" fontWeight="700" textAnchor="middle">
                    FASTAPI GATEWAY: Stateless API Pods • JWT Authentication • Token-Bucket Rate Limiter • S3 Presigned URLs
                  </text>
                </g>

                {/* 4 Core Pillars Grid */}
                {/* Pillar 1 */}
                <g
                  onClick={() => setSelectedArchNode('pillar1')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="20"
                    y="140"
                    width="190"
                    height="65"
                    rx="6"
                    fill={selectedArchNode === 'pillar1' ? 'rgba(0, 212, 255, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.primary}
                    strokeWidth="1.5"
                  />
                  <text x="115" y="165" fill={TOKENS.primary} fontSize="11" fontWeight="700" textAnchor="middle">
                    1. DATASET ENGINE
                  </text>
                  <text x="115" y="185" fill={TOKENS.textMuted} fontSize="9.5" textAnchor="middle">
                    DuckDB Profiler & Leakage Guard
                  </text>
                </g>

                {/* Pillar 2 */}
                <g
                  onClick={() => setSelectedArchNode('pillar2')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="223"
                    y="140"
                    width="190"
                    height="65"
                    rx="6"
                    fill={selectedArchNode === 'pillar2' ? 'rgba(0, 245, 160, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.accentEmerald}
                    strokeWidth="1.5"
                  />
                  <text x="318" y="165" fill={TOKENS.accentEmerald} fontSize="11" fontWeight="700" textAnchor="middle">
                    2. CODE STUDIO
                  </text>
                  <text x="318" y="185" fill={TOKENS.textMuted} fontSize="9.5" textAnchor="middle">
                    Monaco IDE & Sandboxed Runners
                  </text>
                </g>

                {/* Pillar 3 */}
                <g
                  onClick={() => setSelectedArchNode('pillar3')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="426"
                    y="140"
                    width="190"
                    height="65"
                    rx="6"
                    fill={selectedArchNode === 'pillar3' ? 'rgba(129, 140, 248, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.accentViolet}
                    strokeWidth="1.5"
                  />
                  <text x="521" y="165" fill={TOKENS.accentViolet} fontSize="11" fontWeight="700" textAnchor="middle">
                    3. EXPERIMENT HUB
                  </text>
                  <text x="521" y="185" fill={TOKENS.textMuted} fontSize="9.5" textAnchor="middle">
                    MLflow Leaderboard & Registry
                  </text>
                </g>

                {/* Pillar 4 */}
                <g
                  onClick={() => setSelectedArchNode('pillar4')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="630"
                    y="140"
                    width="190"
                    height="65"
                    rx="6"
                    fill={selectedArchNode === 'pillar4' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 31, 56, 0.9)'}
                    stroke={TOKENS.accentAmber}
                    strokeWidth="1.5"
                  />
                  <text x="725" y="165" fill={TOKENS.accentAmber} fontSize="11" fontWeight="700" textAnchor="middle">
                    4. MODEL SERVING
                  </text>
                  <text x="725" y="185" fill={TOKENS.textMuted} fontSize="9.5" textAnchor="middle">
                    REST, Batch & Drift Telemetry
                  </text>
                </g>

                {/* Persistent Storage & Worker Cluster */}
                <g
                  onClick={() => setSelectedArchNode('storage')}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x="20"
                    y="225"
                    width="800"
                    height="40"
                    rx="6"
                    fill={selectedArchNode === 'storage' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(16, 31, 56, 0.7)'}
                    stroke={selectedArchNode === 'storage' ? TOKENS.primary : 'rgba(255, 255, 255, 0.1)'}
                    strokeWidth="1.5"
                  />
                  <text x="420" y="250" fill={TOKENS.textPrimary} fontSize="12" fontWeight="700" textAnchor="middle">
                    STORAGE & QUEUE INFRASTRUCTURE: PostgreSQL (RLS) • Redis Cluster • S3 / MinIO Artifacts • Ephemeral Compute Workers
                  </text>
                </g>
              </svg>

              {/* Explanatory Tier Card */}
              <div
                style={{
                  marginTop: 14,
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'rgba(0, 212, 255, 0.05)',
                  border: '1px solid ' + TOKENS.border,
                  fontSize: 12.5,
                  color: TOKENS.textSecondary,
                }}
              >
                {selectedArchNode === 'clients' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>Client Tier:</strong> Single-page Monaco Studio, REST clients (cURL, Python httpx), and automated batch scoring drag-and-drop file uploaders connecting over secure HTTPS.
                  </div>
                )}
                {selectedArchNode === 'gateway' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>FastAPI Gateway:</strong> Authenticates incoming requests via JWT tokens, applies Redis token-bucket rate limits, and issues S3 pre-signed multipart upload URLs to avoid RAM bottlenecks.
                  </div>
                )}
                {selectedArchNode === 'pillar1' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>Pillar 1 — Dataset Engine:</strong> Powered by DuckDB for streaming out-of-core profiling, automated target leakage detection (&gt;0.98 Pearson/Spearman correlation), and immutable SHA-256 version fingerprinting.
                  </div>
                )}
                {selectedArchNode === 'pillar2' && (
                  <div>
                    <strong style={{ color: TOKENS.accentEmerald }}>Pillar 2 — Code Studio:</strong> Real VS Code Monaco editor, AST Python syntax verification, ML cause-and-effect diff modal, AI Copilot, and isolated process sandboxes with strict cgroup resource limits.
                  </div>
                )}
                {selectedArchNode === 'pillar3' && (
                  <div>
                    <strong style={{ color: TOKENS.accentViolet }}>Pillar 3 — Experiment Tracking & Registry:</strong> MLflow-standard multi-run leaderboard, parameter diffing, interactive confusion matrix, threshold optimizer, SHAP feature importance, and Champion vs Candidate lifecycle staging.
                  </div>
                )}
                {selectedArchNode === 'pillar4' && (
                  <div>
                    <strong style={{ color: TOKENS.accentAmber }}>Pillar 4 — Model Serving:</strong> Sub-second REST endpoints, high-throughput bulk batch CSV scoring, live P50/P95/P99 latency telemetry, and Population Stability Index (PSI) drift monitoring.
                  </div>
                )}
                {selectedArchNode === 'storage' && (
                  <div>
                    <strong style={{ color: TOKENS.primary }}>Storage & Worker Tier:</strong> PostgreSQL for relational metadata, Redis for token buckets and job queues, S3/MinIO for immutable serialized artifacts, and auto-scaling Celery/Docker compute workers.
                  </div>
                )}
                {selectedArchNode === 'pillars' && (
                  <div>
                    <strong style={{ color: TOKENS.accentEmerald }}>The 4 Pillars:</strong> Click any tier or pillar above to inspect its production engineering specifications.
                  </div>
                )}
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: PILLAR 1 DATASET ENGINE ───────────────────────── */}
          <section id="pillar1" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Database className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pillar 1
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Dataset Engine & Feature Governance (Data Foundation)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Enterprise datasets frequently range from 10MB to 50GB+. Loading full CSVs into pandas in web server memory causes immediate Out-Of-Memory crashes. ML Playground replaces in-memory pandas with <strong>DuckDB</strong> streaming out-of-core profiling and strict feature governance guardrails.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.primary, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap className="w-4 h-4" />
                  <span>Out-of-Core DuckDB Profiling</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  DuckDB streams tabular files in vector chunks using memory-mapped zero-copy execution. Datasets profile in sub-second time without loading raw bytes into the FastAPI process memory.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentRose, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Automated Data Leakage Detection</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Columns with correlation &gt; 0.98 with the target column (e.g., <code>cancellation_date</code> when predicting <code>churn</code>) are automatically flagged as severe data leakage to prevent false 100% accuracy illusions.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentAmber, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sliders className="w-4 h-4" />
                  <span>Constant & Identifier Column Pruning</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Zero-variance columns (same value across all rows) and high-cardinality unique ID columns (e.g. <code>customer_id</code>, UUIDs) are automatically identified and flagged for dropping.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentEmerald, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Immutable SHA-256 Dataset Versioning</span>
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Every uploaded dataset receives an immutable cryptographic content hash (e.g., <code>telco_churn:v1#a7f29b</code>). Models trained on this version retain complete, verifiable audit lineage.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: PILLAR 2 CODE STUDIO ─────────────────────────── */}
          <section id="pillar2" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentEmerald, marginBottom: 8 }}>
              <Code2 className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pillar 2
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Monaco Code Studio & Pipeline Guardian (Decoupled Compute)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Rather than black-boxing machine learning, ML Playground generates clean, production-grade <code>scikit-learn</code> and <code>pandas</code> code directly inside a customized VS Code Monaco editor, defended by debounced AST validation and ephemeral sandboxes.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  1. Monaco Editor Engine (VS Code Core)
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Includes Python syntax highlighting, bracket colorization, multi-cursor editing, code folding, minimap, and auto-indentation. Direct modifications to hyperparameters (e.g., <code>n_estimators=100</code>, <code>max_depth=6</code>) take immediate effect.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  2. AST Syntax Checks & Pipeline Guardian Diff Modal
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Before any code is executed, our Python AST parser performs live static analysis. If code is modified or regenerated, the <strong>Pipeline Guardian Diff Modal</strong> highlights exact hyperparameter additions, deletions, and downstream ML impacts.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  3. Contextual AI Copilot
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  The integrated Copilot drawer has real-time context of your active dataset, selected target column, and current editor script. It diagnoses traceback errors, suggests optimal imputation strategies, and provides enterprise optimization code.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.textPrimary, marginBottom: 4 }}>
                  4. Decoupled Sandbox Execution
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Training jobs are queued and executed in isolated child processes with memory quotas (2GB RAM limit) and 120-second hard timeouts. Terminal logs stream back in real-time with zero blocking of the web API.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: PILLAR 3 EXPERIMENT TRACKING ─────────────────── */}
          <section id="pillar3" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentViolet, marginBottom: 8 }}>
              <BarChart2 className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pillar 3
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Experiment Tracking & Model Registry (MLflow Standard)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Every model execution generates a formal experiment run artifact with complete metric histories, confusion matrices, and feature importance explanations. High-performing runs can be promoted into the formal Model Registry.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Multi-Run Comparison Leaderboard
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Compare up to 5 model runs side-by-side. Inspect color-coded parameter diffs (learning rate, tree depth, estimators) aligned with evaluation metrics (ROC-AUC, F1, Log Loss, Latency).
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Interactive Confusion Matrix & Threshold Tuner
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Toggle between raw counts, row-normalized recall, and column-normalized precision. Slide the classification threshold from 0.0 to 1.0 to balance precision vs. recall dynamically.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  SHAP & Permutation Feature Importance
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Computed directly on the holdout test split. Identify which features drive model decisions and catch proxy variables or unintended data leaks before production deployment.
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TOKENS.accentViolet, marginBottom: 6 }}>
                  Model Registry Governance
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textSecondary }}>
                  Promote models across lifecycle stages: <strong>Experiment → Candidate (Staging) → Champion (Production)</strong>. Deploying a Champion automatically routes live production traffic to the new weights.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: PILLAR 4 MODEL SERVING ───────────────────────── */}
          <section id="pillar4" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentAmber, marginBottom: 8 }}>
              <Rocket className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pillar 4
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Model Serving & High-Throughput Batch Scoring (Production MLOps)
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Production deployments require sub-second low-latency serving, bulk batch scoring capabilities for millions of rows, and continuous statistical data drift guardrails.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 4 }}>
                  1. Real-Time REST Invocations API
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Every deployed model exposes a dedicated HTTPS route: <code>POST /api/v1/deployments/&#123;id&#125;/invocations</code>. Payloads are validated against the serialized input schema, returning predictions and class probabilities with sub-50ms latency.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 4 }}>
                  2. High-Throughput Batch CSV Scoring Engine
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Drag and drop an unlabeled 100,000-row CSV file. Worker processes score rows in parallel chunks and immediately produce a downloadable enriched CSV containing <code>predicted_label</code>, <code>prediction_probability</code>, and timestamps.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 4 }}>
                  3. P50 / P95 / P99 Latency Telemetry & Error Tracking
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Production deployments stream live telemetry charts tracking request throughput (req/sec), P50/P95/P99 latency distribution, and HTTP 2xx/4xx/5xx status ratios.
                </div>
              </div>

              <div style={{ padding: '16px 20px', borderRadius: 10, background: TOKENS.bgElevated, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: TOKENS.accentAmber, marginBottom: 4 }}>
                  4. Real-Time Data Drift Detection (PSI & KS Testing)
                </div>
                <div style={{ fontSize: 13, color: TOKENS.textMuted }}>
                  Continuous background workers compute Population Stability Index (PSI) and Kolmogorov-Smirnov (KS) tests between live inference traffic and the training baseline. If PSI &gt; 0.25, automated drift warnings recommend retraining.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: METRICS & FORMULAS ───────────────────────────── */}
          <section id="metrics" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <Activity className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Statistical Guide
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Diagnostic Metrics & Mathematical Formulas
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Choosing the correct metric is critical. A naive model predicting 99% accuracy on a skewed dataset (1% fraud) can be completely useless. Use this reference to select the right metric:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14 }}>Accuracy: (TP + TN) / (TP + TN + FP + FN)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Proportion of total correct predictions. Best for balanced datasets; severely misleading when class imbalance exists.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentEmerald, fontSize: 14 }}>Precision: TP / (TP + FP)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Out of all positive predictions, how many were truly positive? Critical when false alarms are expensive (e.g. spam filtering).
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentAmber, fontSize: 14 }}>Recall (Sensitivity): TP / (TP + FN)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Out of all actual positive cases, how many were detected? Critical when missing a positive is catastrophic (e.g. medical diagnosis, fraud).
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: TOKENS.bgElevated, borderRadius: 8, border: '1px solid ' + TOKENS.border }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentViolet, fontSize: 14 }}>F1-Score: 2 * (Precision * Recall) / (Precision + Recall)</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textMuted, marginTop: 4 }}>
                  Harmonic mean balancing both precision and recall. Best single metric for imbalanced classification tasks.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: GLOSSARY ─────────────────────────────────────── */}
          <section id="glossary" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.primary, marginBottom: 8 }}>
              <BookOpen className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Terminology
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              MLOps & Machine Learning Glossary
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Definitive terminology for enterprise data scientists, ML engineers, and architects:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {filteredGlossary.map((item) => (
                <div
                  key={item.term}
                  style={{
                    padding: '14px 18px',
                    background: TOKENS.bgElevated,
                    borderRadius: 8,
                    border: '1px solid ' + TOKENS.border,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 13.5 }}>{item.term}</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(0, 212, 255, 0.1)',
                        color: TOKENS.textMuted,
                      }}
                    >
                      {item.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: TOKENS.textSecondary }}>{item.definition}</div>
                </div>
              ))}
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: KEYBOARD SHORTCUTS ───────────────────────────── */}
          <section id="shortcuts" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentEmerald, marginBottom: 8 }}>
              <Keyboard className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Productivity
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Keyboard Shortcuts Cheatsheet
            </h2>
            <p style={{ fontSize: 14, color: TOKENS.textSecondary, margin: '0 0 20px' }}>
              Accelerate your workflow with Code Studio and Monaco editor keyboard shortcuts:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {shortcuts.map((sc) => (
                <div
                  key={sc.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: TOKENS.bgElevated,
                    border: '1px solid ' + TOKENS.border,
                  }}
                >
                  <span style={{ fontSize: 13, color: TOKENS.textSecondary }}>{sc.description}</span>
                  <button
                    onClick={() => handleCopy(sc.key)}
                    title="Click to copy shortcut"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: TOKENS.codeBg,
                      border: '1px solid ' + TOKENS.border,
                      color: TOKENS.primary,
                      fontSize: 11.5,
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{sc.key}</span>
                    {copiedShortcut === sc.key ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: FAQS ─────────────────────────────────────────── */}
          <section id="faqs" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentViolet, marginBottom: 8 }}>
              <HelpCircle className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Knowledge Base
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Frequently Asked Questions (FAQs)
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredFaqs.map((faq, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '16px 20px',
                    borderRadius: 10,
                    background: TOKENS.bgElevated,
                    border: '1px solid ' + TOKENS.border,
                  }}
                >
                  <div style={{ fontWeight: 700, color: TOKENS.primary, fontSize: 14, marginBottom: 6 }}>
                    {faq.q}
                  </div>
                  <div style={{ fontSize: 13, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
                    {faq.a}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <hr style={{ borderColor: TOKENS.border, margin: '40px 0' }} />

          {/* ── SECTION: ENTERPRISE PITFALLS ──────────────────────────── */}
          <section id="pitfalls" style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TOKENS.accentRose, marginBottom: 8 }}>
              <AlertTriangle className="w-4 h-4" />
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Risk Mitigation
              </span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
              Enterprise Anti-Patterns to Avoid
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>1. In-Memory Large CSV Buffering</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Never load 10GB+ CSVs into pandas on web server pods. Always leverage DuckDB out-of-core streaming and S3 presigned multipart uploads.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>2. Unchecked Target Leakage</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Features with correlation &gt; 0.98 or post-event data (e.g. refund amounts in churn modeling) cause models to exhibit 99.9% test accuracy but complete failure in production.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>3. Blind Deployment Without Drift Baselines</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Deploying models without automated PSI / KS telemetry monitoring allows concept drift to silently degrade inference revenue unnoticed.
                </div>
              </div>

              <div style={{ padding: '14px 18px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontWeight: 700, color: TOKENS.accentRose, fontSize: 13.5 }}>4. In-Memory Job Dictionaries Across Replicas</div>
                <div style={{ fontSize: 12.5, color: TOKENS.textSecondary, marginTop: 3 }}>
                  Storing active training job states in global Python dictionaries causes random 404s when requests hit different load-balanced pods. Always persist state in PostgreSQL and Redis.
                </div>
              </div>
            </div>
          </section>

          {/* ── Footer CTA ────────────────────────────────────────────── */}
          <div
            style={{
              padding: '28px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 245, 160, 0.12))',
              border: '1px solid ' + TOKENS.borderActive,
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: TOKENS.textPrimary }}>
              Ready to launch production ML pipelines?
            </h3>
            <p style={{ fontSize: 13, color: TOKENS.textMuted, margin: '0 0 20px' }}>
              Return to your workspace, upload an enterprise dataset or load a sample, and train your model.
            </p>
            <button
              onClick={handleReturnToPlatform}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #00D4FF, #00F5A0)',
                color: '#050B14',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(0, 212, 255, 0.4)',
                transition: 'transform 150ms ease',
              }}
            >
              <span>Launch ML Playground Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
