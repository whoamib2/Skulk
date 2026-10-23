import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-2xl border border-line bg-ink px-3 text-base text-foam outline-none placeholder:text-mist focus-visible:border-foam',
        className,
      )}
      {...props}
    />
  )
}
