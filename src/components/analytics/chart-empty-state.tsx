import type { LucideIcon } from 'lucide-react'

interface ChartEmptyStateProps {
  icon: LucideIcon
  message: string
}

export default function ChartEmptyState({ icon: Icon, message }: ChartEmptyStateProps) {
  return (
    <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
      <div className="text-center">
        <Icon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No data yet</p>
        <p className="text-sm text-gray-400">{message}</p>
      </div>
    </div>
  )
}
