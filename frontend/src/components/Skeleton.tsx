import React from 'react'
import clsx from 'clsx'

interface SkeletonProps {
  variant?: 'text' | 'card' | 'chart'
  className?: string
  lines?: number
}

export default function Skeleton({ variant = 'text', className, lines = 1 }: SkeletonProps) {
  if (variant === 'text') {
    return (
      <div className={clsx('flex flex-col gap-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-4 rounded-full animate-pulse bg-white/[0.06]"
            style={{ width: i === lines - 1 && lines > 1 ? '62%' : '100%' }}
          />
        ))}
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={clsx('glass p-5 animate-pulse', className)}>
        <div className="h-3 w-1/3 rounded-full bg-white/[0.06] mb-4" />
        <div className="h-8 w-1/2 rounded-full bg-white/[0.06] mb-3" />
        <div className="h-3 w-3/4 rounded-full bg-white/[0.06] mb-2" />
        <div className="h-3 w-2/3 rounded-full bg-white/[0.06]" />
      </div>
    )
  }

  if (variant === 'chart') {
    return (
      <div className={clsx('glass p-5 animate-pulse', className)}>
        <div className="h-3 w-1/3 rounded-full bg-white/[0.06] mb-6" />
        <div className="flex items-end gap-2 h-32">
          {[68, 90, 55, 75, 40, 85, 60, 72].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-white/[0.06]"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    )
  }

  return null
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="card" />
      ))}
    </div>
  )
}
