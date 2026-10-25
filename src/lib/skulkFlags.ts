import { registerPlugin } from '@capacitor/core'

interface SkulkFlagsPlugin {
  isDebuggable(): Promise<{ debug: boolean }>
}

const SkulkFlags = registerPlugin<SkulkFlagsPlugin>('SkulkFlags', {
  web: () => ({
    async isDebuggable() {
      return { debug: import.meta.env.DEV }
    },
  }),
})

/** True for a debug APK and for the Vite dev server. Release builds are not debuggable. */
export async function isDebuggableBuild(): Promise<boolean> {
  try {
    const result = await SkulkFlags.isDebuggable()
    return result.debug === true
  } catch {
    return import.meta.env.DEV
  }
}
