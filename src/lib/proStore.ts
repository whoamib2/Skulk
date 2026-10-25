import { Capacitor } from '@capacitor/core'
import type { ProClaim } from '@shared/pro'
import { PRO_PRODUCT_ID } from '@shared/pro'
import { isNativeApp } from '@/lib/native'
import { isDebuggableBuild } from '@/lib/skulkFlags'

export const PRO_DEV_KEY = 'skulk-pro-dev'

export interface ProSnapshot {
  owned: boolean
  purchaseToken: string | null
  devUnlock: boolean
  debuggable: boolean
  billing: boolean
  price: string | null
  note: string
  busy: boolean
}

const listeners = new Set<() => void>()
let generation = 0
let booted: Promise<void> | null = null

let snapshot: ProSnapshot = {
  owned: false,
  purchaseToken: null,
  devUnlock: false,
  debuggable: false,
  billing: false,
  price: null,
  note: '',
  busy: false,
}

export function proSnapshot(): ProSnapshot {
  return snapshot
}

export function currentProClaim(): ProClaim {
  return {
    productId: PRO_PRODUCT_ID,
    purchaseToken: snapshot.purchaseToken,
    devUnlock: snapshot.devUnlock,
  }
}

export function subscribePro(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(next: ProSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

function ownedNow(purchaseToken: string | null, devUnlock: boolean): boolean {
  return Boolean(purchaseToken) || devUnlock
}

export async function bootPro(): Promise<void> {
  if (!booted) booted = refreshPro()
  return booted
}

async function readDevUnlock(debuggable: boolean): Promise<boolean> {
  if (!debuggable) return false
  if (isNativeApp()) {
    try {
      const { Preferences } = await import('@capacitor/preferences')
      const { value } = await Preferences.get({ key: PRO_DEV_KEY })
      if (value != null) return value === '1'
    } catch {
      // The WebView copy is enough if Preferences is unavailable.
    }
  }
  try {
    return localStorage.getItem(PRO_DEV_KEY) === '1'
  } catch {
    return false
  }
}

async function writeDevUnlock(on: boolean): Promise<void> {
  const value = on ? '1' : '0'
  try {
    localStorage.setItem(PRO_DEV_KEY, value)
  } catch {
    // Ignore a locked WebView store.
  }
  if (!isNativeApp()) return
  try {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.set({ key: PRO_DEV_KEY, value })
  } catch {
    // The local copy still drives this session.
  }
}

function purchaseTokenFrom(transaction: { productIdentifier?: string; purchaseToken?: string; purchaseState?: string }): string | null {
  if (transaction.productIdentifier !== PRO_PRODUCT_ID) return null
  if (transaction.purchaseState != null && transaction.purchaseState !== '1') return null
  const token = transaction.purchaseToken?.trim()
  return token ? token : null
}

async function refreshPro(): Promise<void> {
  const seen = generation
  const debuggable = await isDebuggableBuild()
  const storedDev = await readDevUnlock(debuggable)
  let price: string | null = null
  let billing = false
  let purchaseToken: string | null = null
  if (Capacitor.isNativePlatform()) {
    try {
      const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases')
      const support = await NativePurchases.isBillingSupported()
      billing = support.isBillingSupported === true
      if (billing) {
        try {
          const { product } = await NativePurchases.getProduct({
            productIdentifier: PRO_PRODUCT_ID,
            productType: PURCHASE_TYPE.INAPP,
          })
          price = product.priceString || null
        } catch {
          price = null
        }
        try {
          await NativePurchases.restorePurchases()
        } catch {
          // A missing Play account still lets getPurchases answer.
        }
        const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP })
        for (const purchase of purchases) {
          const token = purchaseTokenFrom(purchase)
          if (token) {
            purchaseToken = token
            break
          }
        }
      }
    } catch {
      billing = false
    }
  }
  const devUnlock = seen === generation ? storedDev && debuggable : snapshot.devUnlock
  emit({
    ...snapshot,
    owned: ownedNow(purchaseToken, devUnlock),
    purchaseToken,
    devUnlock,
    debuggable,
    billing,
    price,
    busy: false,
  })
}

export function setDevUnlock(on: boolean): void {
  if (!snapshot.debuggable && !import.meta.env.DEV) return
  generation += 1
  const devUnlock = on
  emit({
    ...snapshot,
    devUnlock,
    owned: ownedNow(snapshot.purchaseToken, devUnlock),
  })
  void writeDevUnlock(on)
}

export async function buyPro(): Promise<void> {
  if (!snapshot.billing || snapshot.busy) return
  emit({ ...snapshot, busy: true, note: '' })
  try {
    const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases')
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: PRO_PRODUCT_ID,
      productType: PURCHASE_TYPE.INAPP,
      isConsumable: false,
    })
    const token = purchaseTokenFrom(transaction)
    emit({
      ...snapshot,
      busy: false,
      purchaseToken: token ?? snapshot.purchaseToken,
      owned: ownedNow(token ?? snapshot.purchaseToken, snapshot.devUnlock),
      note: token ? 'Skulk Pro is unlocked on this phone.' : '',
    })
  } catch (error) {
    const text = error instanceof Error ? error.message : ''
    emit({
      ...snapshot,
      busy: false,
      note: /cancel/i.test(text) ? '' : 'The store didn’t finish that. You can try again.',
    })
  }
}

export async function restorePro(): Promise<void> {
  if (snapshot.busy) return
  if (!Capacitor.isNativePlatform()) {
    emit({ ...snapshot, note: 'Restore works in the Android app, on the Google account that bought Skulk Pro.' })
    return
  }
  emit({ ...snapshot, busy: true, note: '' })
  const seen = generation
  try {
    const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases')
    await NativePurchases.restorePurchases()
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP })
    let purchaseToken: string | null = null
    for (const purchase of purchases) {
      const token = purchaseTokenFrom(purchase)
      if (token) {
        purchaseToken = token
        break
      }
    }
    const devUnlock = seen === generation ? snapshot.devUnlock : snapshot.devUnlock
    emit({
      ...snapshot,
      busy: false,
      purchaseToken,
      devUnlock,
      owned: ownedNow(purchaseToken, devUnlock),
      note: purchaseToken ? 'Purchase restored.' : 'No Skulk Pro purchase was found on this Google account.',
    })
  } catch {
    emit({ ...snapshot, busy: false, note: 'Couldn’t reach Google Play. Try again in a minute.' })
  }
}
