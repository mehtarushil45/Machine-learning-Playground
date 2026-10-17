import React from 'react';
import { Sparkles } from 'lucide-react';

interface FeatureImportanceItem {
  feature: string;
  importance: number;
  rank?: number;
}

interface FeatureImportanceCardProps {
  featureImportance?: FeatureImportanceItem[];
  featureColumns: string[];
}

/* ── Blueberry & Maroon Design System Tokens (from index.css) ───────── */
const BB = {
  base: 'var(--bb-base, #0B0912)',
  surface: 'var(--bb-surface, #1B1530)',
  elevated: 'var(--bb-elevated, #2A2247)',
  border: 'var(--bb-primary-border, rgba(107, 92, 166, 0.18))',
  borderSubtle: 'rgba(107, 92, 166, 0.10)',
  primary: 'var(--bb-primary, #4B3B7C)',
  primaryLight: 'var(--bb-primary-light, #6C5CA6)',
  accent: 'var(--bb-primary-light, #6C5CA6)',
  gold: 'var(--bb-gold, #C9A24B)',
  goldLight: '#E2BD68',
  text: 'var(--bb-text, #F5F1EC)',
  textSec: 'var(--bb-muted, #9E93B8)',
  textDim: 'var(--bb-placeholder, #5E5480)',
  mono: 'var(--font-mono, "JetBrains Mono", monospace)',
  ui: 'var(--font-ui, "Space Grotesk", sans-serif)',
};

export const FeatureImportanceCard: React.FC<FeatureImportanceCardProps> = ({
  featureImportance,
  featureColumns,
}) => {
  // Normalize feature importance items
  const items: FeatureImportanceItem[] = React.useMemo(() => {
    if (featureImportance && featureImportance.length > 0) {
      const sorted = [...featureImportance].sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance));
      const maxImp = Math.max(...sorted.map((i) => Math.abs(i.importance)), 0.0001);
      return sorted.map((item, idx) => ({
        feature: item.feature,
        importance: Math.abs(item.importance) / maxImp,
        rank: item.rank ?? idx + 1,
      }));
    }

    // Fallback if model hasn't exported explicit weights: synthesize equal distribution for preview
    if (featureColumns.length > 0) {
      return featureColumns.map((col, idx) => ({
        feature: col,
        importance: 1 / featureColumns.length,
        rank: idx + 1,
      }));
    }

    return [];
  }, [featureImportance, featureColumns]);

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'transparent' }}>
      {/* Header (Direct on page, no box) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles style={{ width: 14, height: 14, color: '#00D4FF' }} />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(0, 212, 255, 0.16)',
              border: '1px solid rgba(0, 212, 255, 0.38)',
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontFamily: BB.ui,
            }}
          >
            Feature Importance & Contribution
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: BB.textDim,
            fontFamily: BB.mono,
          }}
        >
          {items.length} Features Evaluated
        </span>
      </div>

      <div style={{ fontSize: 12, color: BB.textSec, lineHeight: 1.5, fontFamily: BB.ui }}>
        Relative importance weights computed on test evaluation. Features at the top exert the strongest predictive influence on the model.
      </div>

      {/* Feature Rows (Scrollable without visible scrollbar, direct on page, no 'show all' button) */}
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginTop: 4,
          maxHeight: 280,
          overflowY: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingRight: 2,
        }}
      >
        {items.map((item, index) => {
          const pct = Math.round(item.importance * 100);
          return (
            <div
              key={item.feature}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '2px 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: BB.mono,
                      color: index === 0 ? BB.gold : BB.textDim,
                    }}
                  >
                    #{item.rank ?? index + 1}
                  </span>
                  <span style={{ fontWeight: 600, color: BB.text, fontFamily: BB.mono }}>
                    {item.feature}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: BB.mono,
                    fontWeight: 700,
                    color: index === 0 ? BB.gold : BB.textSec,
                    fontSize: 11,
                  }}
                >
                  {pct}% weight
                </span>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: BB.border,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    borderRadius: 2,
                    background: index === 0 ? BB.gold : BB.accent,
                    transition: 'width 300ms ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
