'use client'

import { type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  trend?: { value: number; label: string }
  className?: string
}

export function StatCard({ title, value, icon: Icon, description, trend, className }: StatCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4 sm:h-6 sm:w-6 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl sm:text-2xl font-heading font-bold text-gray-900">{value}</p>
            <p className="text-xs sm:text-sm text-gray-500">{title}</p>
            {description && (
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            )}
          </div>
          {trend && (
            <div className={cn(
              'text-xs font-medium px-2 py-1 rounded-full',
              trend.value >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            )}>
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
