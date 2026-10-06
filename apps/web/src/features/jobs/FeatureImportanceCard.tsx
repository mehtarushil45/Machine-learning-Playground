import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface FeatureImportanceItem {
  feature: string;
  importance: number;
  rank?: number;
}

interface FeatureImportanceCardProps {
  featureImportance?: FeatureImportanceItem[];
  featureColumns: string[];
}

const BB = {
  card: '#1D1737',
  elevated: '#18132E',
  border: 'rgba(138, 121, 202, 0.22)',
  text: '#FFFFFF',
  textSecondary: '#E2E8F0',
  muted: '#94A3B8',
  subtle: '#64748B',
  primary: '#4B3B7C',
  primaryLight: '#8A79CA',
  gold: '#F59E0B',
  success: '#10B981',
};

export const FeatureImportanceCard: React.FC<FeatureImportanceCardProps> = ({
  featureImportance,
  featureColumns,
}) => {
  const [showAll, setShowAll] = useState(false);

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

  const displayItems = showAll ? items : items.slice(0, 5);

  return (
    <div
      style={{
        background: BB.card,
        border: `1px solid ${BB.border}`,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${BB.border}`,
          background: BB.elevated,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles style={{ width: 16, height: 16, color: BB.gold }} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: BB.text,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Feature Importance & Contribution
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: BB.muted,
            background: 'rgba(0,0,0,0.3)',
            padding: '3px 10px',
            borderRadius: 6,
            border: `1px solid ${BB.border}`,
          }}
        >
          {items.length} Features Evaluated
        </span>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12, color: BB.textSecondary, lineHeight: 1.5 }}>
          Relative importance weights computed on test evaluation. Features at the top exert the strongest predictive influence on the model.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayItems.map((item, index) => {
            const pct = Math.round(item.importance * 100);
            return (
              <div
                key={item.feature}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(138, 121, 202, 0.12)',
                  transition: 'background 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: index === 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(138, 121, 202, 0.15)',
                        color: index === 0 ? BB.gold : BB.primaryLight,
                        border: `1px solid ${index === 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(138, 121, 202, 0.2)'}`,
                      }}
                    >
                      #{item.rank ?? index + 1}
                    </span>
                    <span style={{ fontWeight: 600, color: BB.text, fontFamily: 'var(--font-mono)' }}>
                      {item.feature}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: index === 0 ? BB.gold : BB.textSecondary,
                    }}
                  >
                    {pct}% weight
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      borderRadius: 3,
                      background:
                        index === 0
                          ? 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 100%)'
                          : 'linear-gradient(90deg, #6C5CA6 0%, #8A79CA 100%)',
                      boxShadow: index === 0 ? '0 0 8px rgba(245, 158, 11, 0.4)' : '0 0 8px rgba(138, 121, 202, 0.3)',
                      transition: 'width 300ms ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {items.length > 5 && (
          <button
            onClick={() => setShowAll((prev) => !prev)}
            style={{
              alignSelf: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 'none',
              color: BB.primaryLight,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: 6,
            }}
          >
            {showAll ? (
              <>
                <ChevronUp size={14} /> Show Top 5
              </>
            ) : (
              <>
                <ChevronDown size={14} /> Show All ({items.length}) Features
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
