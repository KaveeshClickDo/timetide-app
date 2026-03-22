import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UsageBarProps {
  used: number
  limit: number
  label: string
  icon: LucideIcon
}

export default function UsageBar({ used, limit, label, icon: Icon }: UsageBarProps) {
  const isUnlimited = limit === Infinity || limit >= 999999
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100)
  const isAtLimit = !isUnlimited && used >= limit

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-gray-700">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <span className={cn('font-medium', isAtLimit ? 'text-amber-600' : 'text-gray-900')}>
          {used} / {isUnlimited ? 'Unlimited' : limit}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isAtLimit ? 'bg-amber-500' : 'bg-ocean-500'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}
