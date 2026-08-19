import { useState, useEffect } from 'react';
import { Play, Pause, ChevronUp, ChevronDown, Activity } from 'lucide-react';

export interface TrainingTimeTravelPanelProps {
  jobId: string;
  metrics: Array<{ epoch: number; loss: number; accuracy: number }>;
  onClose?: () => void;
}

const BB = {
  surface: '#1B1530',
  elevated: '#2A2247',
  border: 'rgba(107,92,166,0.18)',
  primary: '#4B3B7C',
  gold: '#C9A24B',
  text: '#F5F1EC',
  muted: '#9E93B8',
  success: '#00F5A0',
};

export function TrainingTimeTravelPanel({ jobId, metrics, onClose }: TrainingTimeTravelPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const validMetrics = metrics && metrics.length > 0 ? metrics : [];
  const maxEpoch = validMetrics.length > 0 ? validMetrics[validMetrics.length - 1].epoch : 0;
  const currentMetrics = validMetrics.find(m => m.epoch === currentEpoch) || validMetrics[0];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && validMetrics.length > 0) {
      interval = setInterval(() => {
        setCurrentEpoch(prev => {
          if (prev >= maxEpoch) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 500); // play at 500ms per epoch
    }
    return () => clearInterval(interval);
  }, [isPlaying, maxEpoch, validMetrics]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 800,
        background: BB.surface,
        borderTop: `1px solid ${BB.border}`,
        borderLeft: `1px solid ${BB.border}`,
        borderRight: `1px solid ${BB.border}`,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        zIndex: 50,
        transition: 'height 300ms ease',
        height: isExpanded ? 280 : 48,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div 
        style={{ 
          padding: '12px 24px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: isExpanded ? `1px solid ${BB.border}` : 'none',
          cursor: 'pointer'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BB.text }}>
          <Activity style={{ width: 16, height: 16, color: BB.success }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Training Time-Travel Simulator</span>
          <span style={{ fontSize: 10, color: BB.muted, background: BB.elevated, padding: '2px 8px', borderRadius: 12 }}>
            Job: {jobId.substring(0, 8)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onClose && (
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ background: 'none', border: 'none', color: BB.text, cursor: 'pointer', fontSize: 11 }}>
              Close
            </button>
          )}
          {isExpanded ? <ChevronDown size={18} color={BB.muted} /> : <ChevronUp size={18} color={BB.muted} />}
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {validMetrics.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: BB.muted, fontSize: 12 }}>
              No epoch metrics available for this training job. (Only neural networks or iterative models produce epoch metrics).
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: BB.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Scrubber</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button 
                      onClick={togglePlay}
                      style={{ 
                        width: 36, height: 36, borderRadius: '50%', background: BB.primary, 
                        border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' 
                      }}
                    >
                      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <input 
                      type="range" 
                      min={0} 
                      max={maxEpoch} 
                      value={currentEpoch}
                      onChange={(e) => setCurrentEpoch(parseInt(e.target.value))}
                      style={{ flex: 1, accentColor: BB.success }}
                    />
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: BB.text, width: 80, textAlign: 'right' }}>
                      Epoch {currentEpoch}/{maxEpoch}
                    </span>
                  </div>
                </div>

                <div style={{ width: 200, background: BB.elevated, borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: BB.muted }}>Validation Loss</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#EF4444', fontWeight: 700 }}>
                      {currentMetrics?.loss?.toFixed(4) || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: BB.muted }}>Accuracy</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: BB.success, fontWeight: 700 }}>
                      {currentMetrics?.accuracy ? (currentMetrics.accuracy * 100).toFixed(2) + '%' : '-'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div style={{ flex: 1, border: `1px solid ${BB.border}`, borderRadius: 8, background: BB.elevated, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <span style={{ fontSize: 11, color: BB.muted }}>[ Interactive D3 Epoch Chart Placeholder ]</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
