import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Vibration is a bonus, not the game.
  }
}
