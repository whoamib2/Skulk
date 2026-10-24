import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-runner text-ink hover:bg-runner/90',
        secondary: 'border border-line bg-panel-2 text-foam hover:bg-panel',
        ghost: 'text-foam hover:bg-panel-2',
        danger: 'bg-alert text-ink hover:bg-alert/90',
      },
      size: {
        default: 'h-11 px-4 text-sm',
        lg: 'h-12 w-full px-5 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp type={asChild ? undefined : 'button'} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
