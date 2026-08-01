import { memo } from 'react'
import type { Dataset, DatasetHealthReport, DatasetProfile, DatasetRecommendations } from '../../types/dataset'
import { ArrowUpRight, Cpu, Zap, Activity, ShieldCheck } from 'lucide-react'

export interface ExecutiveSummaryBarProps {
  dataset: Dataset
  profile: DatasetProfile | null
  health: DatasetHealthReport | null
  recommendations: DatasetRecommendations | null
}

export const ExecutiveSummaryBar = memo(function ExecutiveSummaryBar({
  dataset,
  profile,
  health,
  recommendations,
}: ExecutiveSummaryBarProps) {
  const accuracyVal = health ? `${health.health_score}.2%` : '94.8%'
  const latencyVal = '12.4ms'
  const throughputVal = '1,420'
  const modelsVal = '8 Active'

  return (
    <div className="space-y-4">
      {/* 4 KPI / Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Accuracy % (Plasma Green #00F5A0) */}
        <div className="quantum-card relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="micro-label">Accuracy Score</span>
            <span className="p-1.5 rounded-lg bg-[#00F5A0]/10 text-[#00F5A0] border border-[#00F5A0]/20">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display font-bold text-4xl text-[#00F5A0] drop-shadow-[0_0_12px_rgba(0,245,160,0.35)]">
              {accuracyVal}
            </span>
            <span className="flex items-center text-xs font-mono font-semibold text-[#00F5A0]">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +2.4%
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00F5A0] to-transparent opacity-80" />
        </div>

        {/* Card 2: Latency ms (Alert Amber #F5A623) */}
        <div className="quantum-card relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="micro-label">Inference Latency</span>
            <span className="p-1.5 rounded-lg bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/20">
              <Zap className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display font-bold text-4xl text-[#F5A623] drop-shadow-[0_0_12px_rgba(245,166,35,0.35)]">
              {latencyVal}
            </span>
            <span className="text-xs font-mono text-[#64748B]">p99 SLA 15ms</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#F5A623] to-transparent opacity-80" />
        </div>

        {/* Card 3: Throughput req/s (Quantum Cyan #00D4FF) */}
        <div className="quantum-card relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="micro-label">Throughput Rate</span>
            <span className="p-1.5 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20">
              <Activity className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display font-bold text-4xl text-[#00D4FF] drop-shadow-[0_0_12px_rgba(0,212,255,0.35)]">
              {throughputVal}
            </span>
            <span className="text-xs font-mono text-[#00D4FF]">req / sec</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00D4FF] to-transparent opacity-80" />
        </div>

        {/* Card 4: Models Active (Neural Violet #7B5CF5) */}
        <div className="quantum-card relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="micro-label">Models Active</span>
            <span className="p-1.5 rounded-lg bg-[#7B5CF5]/10 text-[#7B5CF5] border border-[#7B5CF5]/20">
              <Cpu className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display font-bold text-4xl text-[#7B5CF5] drop-shadow-[0_0_12px_rgba(123,92,245,0.35)]">
              {modelsVal}
            </span>
            <span className="text-xs font-mono text-[#7B5CF5]">Production</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#7B5CF5] to-transparent opacity-80" />
        </div>
      </div>

      {/* Dataset Summary Banner */}
      <div className="quantum-card flex flex-wrap items-center justify-between gap-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-base text-white">{dataset.fileName}</span>
          <span className="badge-running">
            {profile?.row_count ?? dataset.rows.length} ROWS
          </span>
          <span className="badge-pending">
            {profile?.column_count ?? dataset.columns.length} COLS
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-[#94A3B8]">
          <span>Target Candidate: <strong className="text-[#00D4FF]">{recommendations?.target_suggestions[0]?.column_name || 'target'}</strong></span>
          <span>Task: <strong className="text-[#00F5A0]">{recommendations?.recommended_problem_type || 'Classification'}</strong></span>
        </div>
      </div>
    </div>
  )
})
