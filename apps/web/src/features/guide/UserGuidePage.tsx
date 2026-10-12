/**
 * UserGuidePage — Comprehensive, Beginner-Friendly ML Student Guide
 *
 * Designed to teach students how every single page of ML Playground works
 * using simple, intuitive English, practical examples, and visual summaries.
 */
import { useState, useMemo } from 'react';
import {
  BookOpen,
  Database,
  Code2,
  BarChart2,
  Rocket,
  GraduationCap,
  Sparkles,
  Search,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';

const BB = {
  base: '#08070F',
  surface: '#120E22',
  elevated: '#18132E',
  border: 'rgba(138, 121, 202, 0.18)',
  borderLight: 'rgba(167, 139, 250, 0.35)',
  primaryLight: '#8A79CA',
  gold: '#F59E0B',
  text: '#FFFFFF',
  textSecondary: '#E2E8F0',
  muted: '#94A3B8',
  disabled: '#475569',
  success: '#10B981',
  error: '#F87171',
} as const;

interface UserGuidePageProps {
  onNavigate?: (tab: string) => void;
}

export function UserGuidePage({ onNavigate }: UserGuidePageProps) {
  const [activeSection, setActiveSection] = useState<string>('intro');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const sections = useMemo(() => [
    { id: 'intro', label: 'What is Machine Learning?', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'datasets', label: '1. Datasets & Profiler', icon: <Database className="w-4 h-4" /> },
    { id: 'studio', label: '2. Pipeline Code Studio', icon: <Code2 className="w-4 h-4" /> },
    { id: 'experiments', label: '3. Training & Experiments', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'deployments', label: '4. Model Deployments', icon: <Rocket className="w-4 h-4" /> },
    { id: 'classroom', label: '5. Classroom & Lab Exams', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'glossary', label: 'ML Glossary for Students', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'mistakes', label: 'Common Mistakes to Avoid', icon: <AlertTriangle className="w-4 h-4" /> },
  ], []);

  const handleReturnToPlatform = () => {
    if (window.opener) {
      window.close();
    } else if (onNavigate) {
      onNavigate('workspace');
    } else {
      window.location.hash = '';
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#08070F',
        color: BB.text,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Navigation Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(18, 14, 34, 0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid ' + BB.border,
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
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #8A79CA, #4B3B7C)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFF',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            ML
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>
              ML Playground — Student Guide
            </div>
            <div style={{ fontSize: 11, color: BB.muted }}>
              Simple, step-by-step documentation for students
            </div>
          </div>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', width: 280, display: 'flex', alignItems: 'center' }}>
          <Search style={{ position: 'absolute', left: 10, width: 14, height: 14, color: BB.muted }} />
          <input
            type="text"
            placeholder="Search guides or topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px 7px 32px',
              borderRadius: 8,
              border: '1px solid ' + BB.border,
              background: 'rgba(24, 19, 46, 0.6)',
              color: BB.text,
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>

        {/* Back to Workspace button */}
        <button
          onClick={handleReturnToPlatform}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 7,
            border: '1px solid ' + BB.primaryLight,
            background: 'rgba(138, 121, 202, 0.15)',
            color: BB.text,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <span>Open Workspace</span>
          <ExternalLink style={{ width: 13, height: 13 }} />
        </button>
      </header>

      {/* Main Container */}
      <div style={{ display: 'flex', flex: 1, maxWidth: 1320, width: '100%', margin: '0 auto' }}>
        {/* Left Sticky Sidebar */}
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            borderRight: '1px solid ' + BB.border,
            padding: '24px 16px',
            position: 'sticky',
            top: 57,
            height: 'calc(100vh - 57px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: BB.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 8 }}>
            Platform Modules
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
                background: activeSection === sec.id ? 'rgba(138, 121, 202, 0.18)' : 'transparent',
                color: activeSection === sec.id ? '#FFFFFF' : BB.muted,
                fontWeight: activeSection === sec.id ? 700 : 500,
                fontSize: 12.5,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <span style={{ color: activeSection === sec.id ? BB.gold : BB.primaryLight }}>
                {sec.icon}
              </span>
              <span>{sec.label}</span>
            </button>
          ))}

          <div style={{ marginTop: 'auto', paddingTop: 20 }}>
            <div
              style={{
                padding: '12px',
                borderRadius: 8,
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                fontSize: 11,
                color: '#FCD34D',
                lineHeight: 1.4,
              }}
            >
              💡 <strong>Student Tip:</strong> You can keep this guide open in one window while training models in the other window!
            </div>
          </div>
        </aside>

        {/* Right Content Area */}
        <main style={{ flex: 1, padding: '36px 44px', overflowY: 'auto', lineHeight: 1.6 }}>

          {/* ── SECTION: INTRO ────────────────────────────────────────── */}
          <section id="intro" style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BB.gold, marginBottom: 6 }}>
              <Sparkles className="w-4 h-4" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Welcome to Machine Learning
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
              What is Machine Learning? (The Simple Explanation)
            </h1>
            <p style={{ fontSize: 14.5, color: BB.textSecondary }}>
              In traditional computer programming, a human programmer writes exact rules by hand (e.g., <em>"If temperature &gt; 35, turn on the fan"</em>).
            </p>
            <p style={{ fontSize: 14.5, color: BB.textSecondary }}>
              In <strong>Machine Learning</strong>, instead of writing rules, we give the computer lots of <strong>examples</strong> (data). The computer finds the mathematical patterns itself! Once it learns those patterns, it can make accurate predictions on new data it has never seen before.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
                marginTop: 20,
              }}
            >
              <div style={{ padding: '16px', borderRadius: 10, background: 'rgba(24, 19, 46, 0.5)', border: '1px solid ' + BB.border }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>📥 1. Feed Data</div>
                <div style={{ fontSize: 13, color: BB.muted }}>
                  Give the computer a table of past observations (e.g. 1,000 houses with room count, location, and selling price).
                </div>
              </div>
              <div style={{ padding: '16px', borderRadius: 10, background: 'rgba(24, 19, 46, 0.5)', border: '1px solid ' + BB.border }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>🧠 2. Train Model</div>
                <div style={{ fontSize: 13, color: BB.muted }}>
                  An algorithm (like Random Forest or XGBoost) adjusts its internal math weights to minimize prediction errors.
                </div>
              </div>
              <div style={{ padding: '16px', borderRadius: 10, background: 'rgba(24, 19, 46, 0.5)', border: '1px solid ' + BB.border }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>🎯 3. Predict & Deploy</div>
                <div style={{ fontSize: 13, color: BB.muted }}>
                  Give the model a brand new house, and it instantly predicts the selling price via a live REST API!
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: 'rgba(138, 121, 202, 0.15)', margin: '36px 0' }} />

          {/* ── SECTION: PAGE 1 DATASETS ──────────────────────────────── */}
          <section id="datasets" style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BB.primaryLight, marginBottom: 6 }}>
              <Database className="w-4 h-4" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Page 1 Guide
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>
              Datasets & Health Profiler (Where Every Project Starts)
            </h2>
            <p style={{ fontSize: 14, color: BB.textSecondary }}>
              Data is the fuel for machine learning. If your dataset has errors, missing values, or unfair shortcuts, your model will be broken. This page helps you inspect, clean, and configure your data.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              <div style={{ padding: '14px 18px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FFF', margin: '0 0 6px' }}>
                  A. What is a "Target" and what are "Features"?
                </h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: BB.textSecondary }}>
                  <li><strong>Target Column:</strong> The answer you want the machine to guess (e.g. <code>churn</code>: Yes/No, or <code>exam_score</code>: 85).</li>
                  <li><strong>Feature Columns:</strong> The clues the model uses to make that guess (e.g. <code>study_hours</code>, <code>attendance</code>, <code>age</code>).</li>
                </ul>
              </div>

              <div style={{ padding: '14px 18px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FFF', margin: '0 0 6px' }}>
                  B. Classification vs. Regression
                </h3>
                <p style={{ fontSize: 13, color: BB.textSecondary, margin: '0 0 6px' }}>
                  The platform automatically detects your task type based on the target column you choose:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ padding: '10px', borderRadius: 6, background: 'rgba(138, 121, 202, 0.1)', border: '1px solid rgba(138, 121, 202, 0.3)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#C4B5FD' }}>Classification (Predicting a Category)</div>
                    <div style={{ fontSize: 11.5, color: BB.muted, marginTop: 4 }}>
                      Examples: Will customer cancel? (Yes/No), Is email spam? (Spam/Not Spam), Flower species (Setosa/Versicolor).
                    </div>
                  </div>
                  <div style={{ padding: '10px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#FCD34D' }}>Regression (Predicting a Number)</div>
                    <div style={{ fontSize: 11.5, color: BB.muted, marginTop: 4 }}>
                      Examples: House price ($320,000), Tomorrow's temperature (28.4°C), Hospital bill ($4,200).
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 18px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FF6B6B', margin: '0 0 6px' }}>
                  C. What is "Target Leakage"? (Crucial Student Concept!)
                </h3>
                <p style={{ fontSize: 13, color: BB.textSecondary, margin: 0 }}>
                  Imagine taking an exam, but someone accidentally wrote the answers on the back of the questions. Target leakage happens when a feature accidentally contains the answer (e.g. including <code>cancellation_date</code> when trying to predict if a user will cancel). The model looks 100% accurate in training, but completely fails in real life! ML Playground automatically warns you about high correlation leakage.
                </p>
              </div>

              <div style={{ padding: '14px 18px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FFF', margin: '0 0 6px' }}>
                  D. The Train / Test Split Slider
                </h3>
                <p style={{ fontSize: 13, color: BB.textSecondary, margin: 0 }}>
                  Why do we split data into 80% Train and 20% Test? Think of it like school: you study practice questions in class (Training data), but your teacher tests you with brand new questions on the exam (Test data). This proves whether the model actually learned the concept or just memorized the answers (overfitting).
                </p>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: 'rgba(138, 121, 202, 0.15)', margin: '36px 0' }} />

          {/* ── SECTION: PAGE 2 CODE STUDIO ───────────────────────────── */}
          <section id="studio" style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BB.primaryLight, marginBottom: 6 }}>
              <Code2 className="w-4 h-4" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Page 2 Guide
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>
              Pipeline Code Studio (Real Python in the Browser)
            </h2>
            <p style={{ fontSize: 14, color: BB.textSecondary }}>
              Many platforms hide the code inside a mysterious "black box". ML Playground does the opposite: it generates clean, industry-standard Python code using <code>scikit-learn</code> and <code>pandas</code>, allowing you to learn and modify real code.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>1. Monaco Code Editor (VS Code Power)</div>
                <div style={{ fontSize: 13, color: BB.muted, marginTop: 2 }}>
                  Use keyboard shortcuts, syntax highlighting, and auto-completion. You can change model hyperparameters like <code>n_estimators</code> (number of trees) or <code>max_depth</code> directly in the script.
                </div>
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>2. Isolated Sandbox Execution</div>
                <div style={{ fontSize: 13, color: BB.muted, marginTop: 2 }}>
                  When you click <strong>Run Pipeline</strong>, the code runs in an isolated Python environment on the server. Live terminal logs stream back to your screen showing execution progress and training duration.
                </div>
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>3. The AI Copilot Assistant</div>
                <div style={{ fontSize: 13, color: BB.muted, marginTop: 2 }}>
                  Stuck on a syntax error or don't know which parameter to tune? Open the Copilot in the top right. It knows your exact dataset and code, and gives clear, beginner-friendly advice.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: 'rgba(138, 121, 202, 0.15)', margin: '36px 0' }} />

          {/* ── SECTION: PAGE 3 EXPERIMENTS ──────────────────────────── */}
          <section id="experiments" style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BB.primaryLight, marginBottom: 6 }}>
              <BarChart2 className="w-4 h-4" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Page 3 Guide
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>
              Training & Experiments (Leaderboard & Diagnostic Metrics)
            </h2>
            <p style={{ fontSize: 14, color: BB.textSecondary }}>
              How do you know if your model is actually good? This page acts like a scientific scoreboard, tracking every experiment run and breaking down performance with visual diagnostics.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              <div style={{ padding: '14px 18px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FFF', margin: '0 0 6px' }}>
                  The 4 Essential Classification Metrics:
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                  <div style={{ padding: '8px 12px', background: 'rgba(18, 14, 34, 0.8)', borderRadius: 6, border: '1px solid ' + BB.border }}>
                    <strong style={{ color: BB.primaryLight }}>Accuracy:</strong> Percent of total correct guesses. (Can be misleading if 95% of data is negative!).
                  </div>
                  <div style={{ padding: '8px 12px', background: 'rgba(18, 14, 34, 0.8)', borderRadius: 6, border: '1px solid ' + BB.border }}>
                    <strong style={{ color: BB.primaryLight }}>Precision:</strong> When the model predicts "Yes", how often is it actually right?
                  </div>
                  <div style={{ padding: '8px 12px', background: 'rgba(18, 14, 34, 0.8)', borderRadius: 6, border: '1px solid ' + BB.border }}>
                    <strong style={{ color: BB.primaryLight }}>Recall:</strong> Out of all actual positive cases, how many did the model find? (Crucial for medicine!).
                  </div>
                  <div style={{ padding: '8px 12px', background: 'rgba(18, 14, 34, 0.8)', borderRadius: 6, border: '1px solid ' + BB.border }}>
                    <strong style={{ color: BB.primaryLight }}>F1-Score:</strong> The harmonic mean balancing both Precision and Recall together.
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 18px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FFF', margin: '0 0 6px' }}>
                  Interactive Confusion Matrix
                </h3>
                <p style={{ fontSize: 13, color: BB.textSecondary, margin: 0 }}>
                  A 2x2 grid showing: <strong>True Positives</strong> (correct yes), <strong>True Negatives</strong> (correct no), <strong>False Positives</strong> (false alarm), and <strong>False Negatives</strong> (missed cases). Click quadrants to see sample predictions.
                </p>
              </div>

              <div style={{ padding: '14px 18px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#FFF', margin: '0 0 6px' }}>
                  Feature Importance (SHAP)
                </h3>
                <p style={{ fontSize: 13, color: BB.textSecondary, margin: 0 }}>
                  Shows exactly which columns influenced the decision most. If predicting house prices, this chart reveals whether <code>total_rooms</code> or <code>median_income</code> had the strongest impact.
                </p>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: 'rgba(138, 121, 202, 0.15)', margin: '36px 0' }} />

          {/* ── SECTION: PAGE 4 DEPLOYMENTS ───────────────────────────── */}
          <section id="deployments" style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BB.primaryLight, marginBottom: 6 }}>
              <Rocket className="w-4 h-4" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Page 4 Guide
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>
              Model Deployments (Putting Models into Production)
            </h2>
            <p style={{ fontSize: 14, color: BB.textSecondary }}>
              Training a model in a notebook is fun, but in the real world, models must serve predictions to websites, mobile apps, and business systems. This page turns your model into a live microservice.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>1. Real-Time REST API</div>
                <div style={{ fontSize: 13, color: BB.muted, marginTop: 2 }}>
                  Every deployed model receives an HTTPS endpoint. You send input data as JSON and receive sub-second predictions. We provide copy-paste code snippets in Python (requests), cURL, and Node.js.
                </div>
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>2. Bulk Batch CSV Scoring</div>
                <div style={{ fontSize: 13, color: BB.muted, marginTop: 2 }}>
                  Need to score 10,000 new customers at once? Drag and drop an unlabeled CSV file; worker processes score rows in parallel and let you download the enriched results.
                </div>
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>3. Data Drift Monitoring & Telemetry</div>
                <div style={{ fontSize: 13, color: BB.muted, marginTop: 2 }}>
                  Over time, real-world data changes (e.g. consumer spending shifts during economic changes). Statistical tests (KS and PSI) monitor incoming traffic and notify you when the model needs retraining.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: 'rgba(138, 121, 202, 0.15)', margin: '36px 0' }} />

          {/* ── SECTION: PAGE 5 CLASSROOM ─────────────────────────────── */}
          <section id="classroom" style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BB.primaryLight, marginBottom: 6 }}>
              <GraduationCap className="w-4 h-4" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Page 5 Guide
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>
              Classroom & Lab Exams (Hands-On Student Challenges)
            </h2>
            <p style={{ fontSize: 14, color: BB.textSecondary }}>
              Instructors use this module to host structured machine learning assignments and lab exams with automatic evaluation.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>1. Enter Classroom with Join Code</div>
                <div style={{ fontSize: 13, color: BB.muted, marginTop: 2 }}>
                  Enter your student name and class join code (e.g. <code>CS401-FALL</code>) to view assigned problem statements.
                </div>
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>2. Automated Rubric Verification</div>
                <div style={{ fontSize: 13, color: BB.muted, marginTop: 2 }}>
                  Click <strong>Run Benchmark Tests</strong> to evaluate your model against grading criteria (minimum accuracy, zero data leakage, proper imputation). You receive instant, objective feedback.
                </div>
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(24, 19, 46, 0.4)', border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>3. Final Submission</div>
                <div style={{ fontSize: 13, color: BB.muted, marginTop: 2 }}>
                  Submit your completed pipeline with a single click. The platform cryptographically seals your code and metrics for the instructor's gradebook.
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: 'rgba(138, 121, 202, 0.15)', margin: '36px 0' }} />

          {/* ── SECTION: GLOSSARY ─────────────────────────────────────── */}
          <section id="glossary" style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BB.gold, marginBottom: 6 }}>
              <BookOpen className="w-4 h-4" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quick Reference
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 16px' }}>
              Machine Learning Glossary (Plain English Terms)
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: '12px', background: 'rgba(24, 19, 46, 0.4)', borderRadius: 8, border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, color: BB.primaryLight, fontSize: 13 }}>Overfitting</div>
                <div style={{ fontSize: 12, color: BB.muted, marginTop: 2 }}>
                  When a model memorizes the training data perfectly like a parrot, but fails on new unseen test data.
                </div>
              </div>
              <div style={{ padding: '12px', background: 'rgba(24, 19, 46, 0.4)', borderRadius: 8, border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, color: BB.primaryLight, fontSize: 13 }}>Hyperparameter</div>
                <div style={{ fontSize: 12, color: BB.muted, marginTop: 2 }}>
                  Settings you configure before training starts (like tree depth or learning rate) to control how the model learns.
                </div>
              </div>
              <div style={{ padding: '12px', background: 'rgba(24, 19, 46, 0.4)', borderRadius: 8, border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, color: BB.primaryLight, fontSize: 13 }}>Imputation</div>
                <div style={{ fontSize: 12, color: BB.muted, marginTop: 2 }}>
                  Filling in missing empty cells in your data using math techniques (like replacing blanks with the median or mean).
                </div>
              </div>
              <div style={{ padding: '12px', background: 'rgba(24, 19, 46, 0.4)', borderRadius: 8, border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, color: BB.primaryLight, fontSize: 13 }}>One-Hot Encoding</div>
                <div style={{ fontSize: 12, color: BB.muted, marginTop: 2 }}>
                  Turning category words (e.g. "Red", "Blue") into binary 0s and 1s so mathematical algorithms can understand them.
                </div>
              </div>
              <div style={{ padding: '12px', background: 'rgba(24, 19, 46, 0.4)', borderRadius: 8, border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, color: BB.primaryLight, fontSize: 13 }}>Cross-Validation (CV)</div>
                <div style={{ fontSize: 12, color: BB.muted, marginTop: 2 }}>
                  Dividing data into multiple chunks (e.g. 5 folds) and testing repeatedly to ensure performance wasn't just random luck.
                </div>
              </div>
              <div style={{ padding: '12px', background: 'rgba(24, 19, 46, 0.4)', borderRadius: 8, border: '1px solid ' + BB.border }}>
                <div style={{ fontWeight: 700, color: BB.primaryLight, fontSize: 13 }}>Class Imbalance</div>
                <div style={{ fontSize: 12, color: BB.muted, marginTop: 2 }}>
                  When one answer is very rare (e.g. 99% non-fraud, 1% fraud). In these cases, simple accuracy is misleading!
                </div>
              </div>
            </div>
          </section>

          <hr style={{ borderColor: 'rgba(138, 121, 202, 0.15)', margin: '36px 0' }} />

          {/* ── SECTION: MISTAKES ─────────────────────────────────────── */}
          <section id="mistakes" style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF6B6B', marginBottom: 6 }}>
              <AlertTriangle className="w-4 h-4" />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Avoid These Pitfalls
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 16px' }}>
              Top 5 Mistakes Students Make in Machine Learning
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <div style={{ fontWeight: 700, color: '#FF6B6B', fontSize: 13.5 }}>1. Testing on Training Data</div>
                <div style={{ fontSize: 12.5, color: BB.textSecondary, marginTop: 3 }}>
                  Always evaluate your model on the unseen test split! Testing on the data used to train gives a false sense of perfection.
                </div>
              </div>

              <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <div style={{ fontWeight: 700, color: '#FF6B6B', fontSize: 13.5 }}>2. Including the ID or Timestamp as a Predictive Feature</div>
                <div style={{ fontSize: 12.5, color: BB.textSecondary, marginTop: 3 }}>
                  Customer IDs, row indices, and UUIDs have no generalizable pattern. Always drop identifier columns in Page 1.
                </div>
              </div>

              <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <div style={{ fontWeight: 700, color: '#FF6B6B', fontSize: 13.5 }}>3. Forgetting to Scale Numbers</div>
                <div style={{ fontSize: 12.5, color: BB.textSecondary, marginTop: 3 }}>
                  If one feature is Salary ($50,000) and another is Age (25), distance-based models get confused by the big numbers. Use a <code>StandardScaler</code>.
                </div>
              </div>

              <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <div style={{ fontWeight: 700, color: '#FF6B6B', fontSize: 13.5 }}>4. Trusting 99% Accuracy on Imbalanced Data</div>
                <div style={{ fontSize: 12.5, color: BB.textSecondary, marginTop: 3 }}>
                  If 99% of credit card transactions are legitimate, a lazy model that always says "Not Fraud" gets 99% accuracy but catches 0 frauds! Check Precision, Recall, and F1-score instead.
                </div>
              </div>

              <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <div style={{ fontWeight: 700, color: '#FF6B6B', fontSize: 13.5 }}>5. Allowing Target Leakage</div>
                <div style={{ fontSize: 12.5, color: BB.textSecondary, marginTop: 3 }}>
                  Never include columns that are only generated *after* the target event has occurred. Watch the Data Leakage indicator in Page 1.
                </div>
              </div>
            </div>
          </section>

          {/* Footer Call to Action */}
          <div
            style={{
              padding: '24px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(138, 121, 202, 0.15), rgba(75, 59, 124, 0.25))',
              border: '1px solid ' + BB.borderLight,
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              Ready to build your first machine learning model?
            </h3>
            <p style={{ fontSize: 13, color: BB.muted, margin: '0 0 16px' }}>
              Head back to the platform, upload a CSV or choose a ready-made example, and launch your experiment.
            </p>
            <button
              onClick={handleReturnToPlatform}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 22px',
                borderRadius: 8,
                border: '1px solid ' + BB.primaryLight,
                background: 'linear-gradient(135deg, #8A79CA, #4B3B7C)',
                color: '#FFF',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span>Go to ML Playground</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </main>
      </div>
    </div>
  );
}
