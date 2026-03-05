'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  className?: string
  render: (item: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  isLoading?: boolean
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: string) => void
  onRowClick?: (item: T) => void
  emptyMessage?: string
  filters?: React.ReactNode
}

export function DataTable<T>({
  columns,
  data,
  total = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
  isLoading,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  sortBy,
  sortOrder,
  onSort,
  onRowClick,
  emptyMessage = 'No data found',
  filters,
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / pageSize) || 1

  return (
    <div className="space-y-4">
      {/* Search and filters */}
      {(onSearchChange || filters) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {onSearchChange && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {filters}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-left font-medium text-gray-500',
                      col.sortable && 'cursor-pointer select-none hover:text-gray-700',
                      col.className
                    )}
                    onClick={() => col.sortable && onSort?.(col.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.header}
                      {col.sortable && (
                        <ArrowUpDown className={cn(
                          'h-3.5 w-3.5',
                          sortBy === col.key ? 'text-indigo-600' : 'text-gray-300'
                        )} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500 mx-auto" />
                    <p className="text-sm text-gray-500 mt-2">Loading...</p>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((item, index) => (
                  <tr
                    key={index}
                    className={cn(
                      'border-b last:border-0 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-gray-50'
                    )}
                    onClick={() => onRowClick?.(item)}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn('px-4 py-3', col.className)}>
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {onPageChange && total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(1)}
                disabled={page === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-600 px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(page + 1)}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(totalPages)}
                disabled={page === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
