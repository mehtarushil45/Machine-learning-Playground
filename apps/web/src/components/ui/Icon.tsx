import React from 'react'
import * as LucideIcons from 'lucide-react'

export type IconName =
  | 'upload'
  | 'file-text'
  | 'database'
  | 'check'
  | 'x'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'search'
  | 'chevron-right'
  | 'chevron-down'
  | 'alert-circle'
  | 'layers'
  | 'sparkles'
  | 'user'
  | 'settings'
  | 'info'
  | 'grid'
  | 'bar-chart'
  | 'cpu'
  | 'refresh-cw'
  | 'log-out'
  | 'table'
  | 'circle-dot'
  | 'square'
  | 'check-square'
  | 'radio'
  | 'help-circle'
  | 'bell'
  | 'loader-2'
  | 'shield'
  | 'activity'
  | 'clock'
  | 'trash-2'

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName
  size?: number | string
  className?: string
}

// Icon mapping from APEX icon names to Lucide Icon components
const iconMap: Record<IconName, React.ComponentType<LucideIcons.LucideProps>> = {
  upload: LucideIcons.Upload,
  'file-text': LucideIcons.FileText,
  database: LucideIcons.Database,
  check: LucideIcons.Check,
  x: LucideIcons.X,
  sun: LucideIcons.Sun,
  moon: LucideIcons.Moon,
  monitor: LucideIcons.Monitor,
  search: LucideIcons.Search,
  'chevron-right': LucideIcons.ChevronRight,
  'chevron-down': LucideIcons.ChevronDown,
  'alert-circle': LucideIcons.AlertCircle,
  layers: LucideIcons.Layers,
  sparkles: LucideIcons.Sparkles,
  user: LucideIcons.User,
  settings: LucideIcons.Settings,
  info: LucideIcons.Info,
  grid: LucideIcons.Grid,
  'bar-chart': LucideIcons.BarChart2,
  cpu: LucideIcons.Cpu,
  'refresh-cw': LucideIcons.RefreshCw,
  'log-out': LucideIcons.LogOut,
  table: LucideIcons.Table,
  'circle-dot': LucideIcons.CircleDot,
  square: LucideIcons.Square,
  'check-square': LucideIcons.CheckSquare,
  radio: LucideIcons.Radio,
  'help-circle': LucideIcons.HelpCircle,
  bell: LucideIcons.Bell,
  'loader-2': LucideIcons.Loader2,
  shield: LucideIcons.Shield,
  activity: LucideIcons.Activity,
  clock: LucideIcons.Clock,
  'trash-2': LucideIcons.Trash2,
}

export function Icon({ name, size = 18, className = '', ...props }: IconProps) {
  const IconComponent = iconMap[name] || LucideIcons.HelpCircle

  return (
    <IconComponent
      size={size}
      className={`inline-block shrink-0 align-middle ${className}`}
      {...props}
    />
  )
}
