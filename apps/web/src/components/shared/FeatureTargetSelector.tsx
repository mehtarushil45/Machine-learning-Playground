import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { Dataset, ColumnProfile } from '../../types/dataset';

export interface FeatureTargetSelectorProps {
  dataset: Dataset | null;
  columns?: string[];
  columnProfiles?: ColumnProfile[];
  selectedTarget: string | null;
  selectedFeatures: string[];
  onSelectTarget?: (target: string) => void;
  onToggleFeature: (feature: string) => void;
  onSelectAllFeatures: () => void;
  onDeselectAllFeatures: () => void;
  showTargetSelection?: boolean;
  maxHeight?: number | string;
}

const BB = {
  base: '#0B0912',
  surface: '#1B1530',
  elevated: '#2A2247',
  border: 'rgba(107,92,166,0.18)',
  borderHover: 'rgba(107,92,166,0.38)',
  primary: '#4B3B7C',
  primaryLight: '#6C5CA6',
  maroon: '#6E1423',
  maroonLight: '#B23A4E',
  gold: '#C9A24B',
  text: '#F5F1EC',
  muted: '#9E93B8',
  disabled: '#3D3558',
  success: '#22c55e',
  warning: '#f59e0b',
} as const;

function getColTypeColor(type: string): string {
  switch (type) {
    case 'numeric':
      return BB.primaryLight;
    case 'categorical':
      return BB.gold;
    case 'identifier':
      return BB.muted;
    case 'boolean':
      return BB.success;
    case 'datetime':
      return '#60a5fa';
    default:
      return BB.muted;
  }
}

function TypePill({ type }: { type: string }) {
  const short =
    type === 'categorical'
      ? 'cat'
      : type === 'identifier'
      ? 'id'
      : type === 'numeric'
      ? 'num'
      : type.slice(0, 3);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
        background: `${getColTypeColor(type)}22`,
        color: getColTypeColor(type),
        border: `1px solid ${getColTypeColor(type)}44`,
      }}
    >
      {short}
    </span>
  );
}

export function isColumnIdentifier(colName: string, profiles?: ColumnProfile[]): boolean {
  if (!colName) return false;
  const lower = colName.toLowerCase().trim();
  
  // 1. Check profile type if available
  if (profiles) {
    const cp = profiles.find((c) => c.name === colName);
    if (cp?.type === 'identifier') return true;
  }
  
  // 2. Strict standard identifier keyword naming conventions
  const idPatterns = [
    /^(id|_id|student_id|user_id|customer_id|client_id|account_id|row_id|record_id|transaction_id|order_id|uuid|guid)$/i,
    /_id$/i,
    /id$/i,
  ];
  return idPatterns.some((pattern) => pattern.test(lower));
}

export function FeatureTargetSelector({
  dataset,
  columns,
  columnProfiles,
  selectedTarget,
  selectedFeatures,
  onSelectTarget,
  onToggleFeature,
  onSelectAllFeatures,
  onDeselectAllFeatures,
  showTargetSelection = false,
  maxHeight = 220,
}: FeatureTargetSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const allColumns = useMemo(() => {
    if (columns && columns.length > 0) return columns;
    return dataset?.columns || [];
  }, [columns, dataset]);

  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return allColumns;
    const q = searchQuery.toLowerCase().trim();
    return allColumns.filter((c) => c.toLowerCase().includes(q));
  }, [allColumns, searchQuery]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        height: '100%',
        minHeight: 0,
        flex: 1,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Header & Quick Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: BB.muted }}>
          Features: <strong style={{ color: BB.text }}>{selectedFeatures.length}</strong>
          {selectedTarget && (
            <>
              {' '}· Target: <strong style={{ color: BB.maroonLight }}>{selectedTarget}</strong>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, fontSize: 9 }}>
          <button
            type="button"
            onClick={onSelectAllFeatures}
            style={{
              background: 'none',
              border: 'none',
              color: BB.primaryLight,
              cursor: 'pointer',
              padding: 0,
              fontWeight: 600,
            }}
          >
            Select All
          </button>
          <span style={{ color: BB.disabled }}>·</span>
          <button
            type="button"
            onClick={onDeselectAllFeatures}
            style={{
              background: 'none',
              border: 'none',
              color: BB.muted,
              cursor: 'pointer',
              padding: 0,
              fontWeight: 600,
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Search Input Filter */}
      {allColumns.length > 6 && (
        <div style={{ position: 'relative', width: '100%', flexShrink: 0 }}>
          <Search
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 12,
              height: 12,
              color: BB.muted,
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter columns..."
            style={{
              width: '100%',
              padding: '4px 8px 4px 26px',
              borderRadius: 6,
              border: `1px solid ${BB.border}`,
              background: BB.elevated,
              color: BB.text,
              fontSize: 10,
              fontFamily: 'var(--font-ui)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Column Checklist Container (Smooth Scrollable) */}
      <div
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          flex: 1,
          minHeight: 60,
          maxHeight: maxHeight || undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          paddingRight: 4,
          scrollbarWidth: 'thin',
          scrollbarColor: `${BB.primaryLight} transparent`,
        }}
      >
        {filteredColumns.map((col) => {
          const isFeature = selectedFeatures.includes(col);
          const isTarget = selectedTarget === col;
          const isId = isColumnIdentifier(col, columnProfiles);
          const cp = columnProfiles?.find((c) => c.name === col);
          const colType = cp?.type ?? (isId ? 'identifier' : 'numeric');
          const isExcluded = isId;

          return (
            <div
              key={col}
              style={{
                display: 'grid',
                gridTemplateColumns: showTargetSelection ? '18px 1fr 18px' : '18px 1fr',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 6,
                background: isTarget
                  ? 'rgba(110,20,35,0.18)'
                  : isFeature
                  ? 'rgba(75,59,124,0.12)'
                  : 'transparent',
                border: `1px solid ${
                  isTarget
                    ? 'rgba(110,20,35,0.35)'
                    : isFeature
                    ? 'rgba(107,92,166,0.25)'
                    : 'transparent'
                }`,
                opacity: isExcluded ? 0.45 : 1,
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
            >
              {/* Feature Selection Checkbox */}
              <input
                type="checkbox"
                aria-label={`Select ${col} as feature`}
                checked={isFeature}
                disabled={isExcluded || isTarget}
                onChange={() => !isExcluded && onToggleFeature(col)}
                style={{
                  width: 13,
                  height: 13,
                  accentColor: BB.primaryLight,
                  cursor: isExcluded || isTarget ? 'not-allowed' : 'pointer',
                }}
              />

              {/* Column Name & Type Pill */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isTarget ? BB.maroonLight : BB.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={col}
                >
                  {col}
                </div>
                <div style={{ fontSize: 9, color: BB.muted, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  <TypePill type={colType} />
                  {isId && (
                    <span style={{ color: BB.disabled, fontSize: 8, fontWeight: 600 }}>
                      [ID EXCLUDED]
                    </span>
                  )}
                  {isTarget && (
                    <span style={{ color: BB.maroonLight, fontSize: 8, fontWeight: 700, letterSpacing: '0.04em' }}>
                      TARGET (y)
                    </span>
                  )}
                </div>
              </div>

              {/* Optional Target Radio Selection */}
              {showTargetSelection && (
                <input
                  type="radio"
                  name="target_column_radio"
                  aria-label={`Select ${col} as target`}
                  checked={isTarget}
                  disabled={isExcluded}
                  onChange={() => !isExcluded && onSelectTarget?.(col)}
                  style={{
                    width: 13,
                    height: 13,
                    accentColor: BB.maroonLight,
                    cursor: isExcluded ? 'not-allowed' : 'pointer',
                  }}
                />
              )}
            </div>
          );
        })}

        {filteredColumns.length === 0 && (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 10, color: BB.muted }}>
            No columns match "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
}
