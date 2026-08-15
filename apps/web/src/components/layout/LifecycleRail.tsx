/**
 * LifecycleRail — persistent 6-stage stepper pinned inside the workspace header.
 * Dataset → Pipeline → Evaluate → Verify → Deploy → Certify
 *
 * Clicking a completed or current stage navigates to that page.
 * Future stages are dimmed and non-interactive until reached.
 */
import { type PlatformTab } from '../../App';
import type { LifecycleStage } from '../../providers/ProjectContext';

/* ── BB tokens (matches App.tsx) ─────────────────────────────────────── */
const BB = {
  base:         '#0B0912',
  surface:      '#1B1530',
  elevated:     '#2A2247',
  border:       'rgba(107,92,166,0.18)',
  primary:      '#4B3B7C',
  primaryLight: '#6C5CA6',
  maroon:       '#6E1423',
  gold:         '#C9A24B',
  text:         '#F5F1EC',
  muted:        '#9E93B8',
  disabled:     '#3D3558',
} as const;

/* ── Stage metadata ───────────────────────────────────────────────────── */
interface Stage {
  id:        LifecycleStage;
  label:     string;
  shortLabel: string;
  tab:       PlatformTab;
}

const STAGES: Stage[] = [
  { id: 'dataset',  label: 'Dataset',  shortLabel: 'DS', tab: 'workspace'      },
  { id: 'pipeline', label: 'Pipeline', shortLabel: 'PL', tab: 'code-studio'    },
  { id: 'evaluate', label: 'Evaluate', shortLabel: 'EV', tab: 'explainability'  },
  { id: 'verify',   label: 'Verify',   shortLabel: 'VF', tab: 'classrooms'     },
  { id: 'deploy',   label: 'Deploy',   shortLabel: 'DP', tab: 'deployments'    },
  { id: 'certify',  label: 'Certify',  shortLabel: 'CT', tab: 'portfolios'     },
];

const STAGE_ORDER: LifecycleStage[] = STAGES.map((s) => s.id);

/* ── Props ────────────────────────────────────────────────────────────── */
interface LifecycleRailProps {
  currentStage:   LifecycleStage;
  onNavigate:     (tab: PlatformTab) => void;
}

/* ── Component ────────────────────────────────────────────────────────── */
export function LifecycleRail({ currentStage, onNavigate }: LifecycleRailProps) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  return (
    <nav
      aria-label="Lifecycle stages"
      style={{
        display:         'flex',
        alignItems:      'center',
        gap:             0,
        padding:         '0 4px',
        overflowX:       'auto',
        scrollbarWidth:  'none',
      }}
    >
      {STAGES.map((stage, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent   = idx === currentIdx;
        const isFuture    = idx > currentIdx;
        const isClickable = !isFuture;

        return (
          <div key={stage.id} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Connector line (not before first) */}
            {idx > 0 && (
              <div
                style={{
                  width:      24,
                  height:     1,
                  flexShrink: 0,
                  background: isCompleted
                    ? `linear-gradient(to right, ${BB.primaryLight}, ${BB.primary})`
                    : BB.border,
                  transition: 'background 300ms',
                }}
              />
            )}

            {/* Stage node */}
            <button
              disabled={!isClickable}
              onClick={() => isClickable && onNavigate(stage.tab)}
              title={stage.label}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            6,
                padding:        '5px 10px',
                borderRadius:   '6px 6px 0 6px',
                border:         `1px solid ${
                  isCurrent   ? BB.primaryLight :
                  isCompleted ? 'rgba(107,92,166,0.30)' :
                  'transparent'
                }`,
                background:     isCurrent
                  ? 'rgba(107,92,166,0.14)'
                  : isCompleted
                    ? 'rgba(75,59,124,0.08)'
                    : 'transparent',
                color:          isCurrent   ? BB.text :
                                isCompleted ? BB.primaryLight :
                                BB.disabled,
                cursor:         isClickable ? 'pointer' : 'default',
                fontFamily:     'var(--font-ui)',
                fontSize:       11,
                fontWeight:     isCurrent ? 700 : 500,
                letterSpacing:  '0.02em',
                whiteSpace:     'nowrap',
                transition:     'all 150ms',
                flexShrink:     0,
              }}
              onMouseEnter={(e) => {
                if (isClickable && !isCurrent) {
                  e.currentTarget.style.background    = 'rgba(107,92,166,0.08)';
                  e.currentTarget.style.color         = BB.text;
                  e.currentTarget.style.borderColor   = BB.border;
                }
              }}
              onMouseLeave={(e) => {
                if (isClickable && !isCurrent) {
                  e.currentTarget.style.background    = isCompleted ? 'rgba(75,59,124,0.08)' : 'transparent';
                  e.currentTarget.style.color         = isCompleted ? BB.primaryLight : BB.disabled;
                  e.currentTarget.style.borderColor   = isCompleted ? 'rgba(107,92,166,0.30)' : 'transparent';
                }
              }}
            >
              {/* Circle indicator */}
              <span
                style={{
                  width:          16,
                  height:         16,
                  borderRadius:   '50%',
                  flexShrink:     0,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  fontSize:       9,
                  fontWeight:     700,
                  background:     isCurrent   ? BB.primaryLight :
                                  isCompleted ? BB.primary :
                                  BB.elevated,
                  color:          isCurrent || isCompleted ? BB.text : BB.disabled,
                  border:         isCurrent ? `1.5px solid ${BB.primaryLight}` : 'none',
                }}
              >
                {isCompleted ? '✓' : idx + 1}
              </span>

              {/* Label — hidden on very small viewports via inline style */}
              <span>{stage.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
