import * as SwitchPrimitive from '@radix-ui/react-switch'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full border border-line bg-ink transition-colors data-[state=checked]:border-runner data-[state=checked]:bg-runner',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-1 rounded-full bg-foam transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-ink" />
    </SwitchPrimitive.Root>
  )
}
