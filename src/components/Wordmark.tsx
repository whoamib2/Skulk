import wordmark from '@/assets/brand/wordmark.svg'

export function Wordmark({ className = 'h-16 w-auto' }: { className?: string }) {
  return <img src={wordmark} alt="skulk" className={className} />
}
