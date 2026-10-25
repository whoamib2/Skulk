import { useEffect, useState } from 'react'
import { bootPro, buyPro, proSnapshot, restorePro, setDevUnlock, subscribePro, type ProSnapshot } from '@/lib/proStore'

export function usePro(): ProSnapshot & {
  buy: () => Promise<void>
  restore: () => Promise<void>
  setDevUnlock: (on: boolean) => void
} {
  const [snap, setSnap] = useState(proSnapshot)
  useEffect(() => subscribePro(() => setSnap(proSnapshot())), [])
  useEffect(() => {
    void bootPro()
  }, [])
  return { ...snap, buy: buyPro, restore: restorePro, setDevUnlock }
}
