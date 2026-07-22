import { claude } from './claude'
import { gemini } from './gemini'
import { googleVision } from './google-vision'
import type { OcrProvider, ProviderName } from './types'

export * from './types'
export * from './parse'

/** Server-side providers, keyed by the value of OCR_PROVIDER.
 *
 *  `tesseract` is intentionally absent: it runs in a web worker in the browser
 *  because it needs no credential, and never reaches this registry. */
const PROVIDERS: Partial<Record<ProviderName, OcrProvider>> = {
  'google-vision': googleVision,
  claude,
  gemini,
}

export const DEFAULT_PROVIDER: ProviderName = 'google-vision'

/** Whether the configured provider runs in the browser rather than on the server. */
export function isClientSideProvider(name: string): boolean {
  return name === 'tesseract'
}

export function configuredProviderName(): ProviderName {
  const configured = process.env.OCR_PROVIDER as ProviderName | undefined
  return configured ?? DEFAULT_PROVIDER
}

/**
 * The active provider, or null when photo import isn't available server-side —
 * either nothing is configured or the choice runs in the browser.
 *
 * Null is a normal state, not an error: a missing credential degrades to manual
 * entry rather than breaking the app.
 */
export function getProvider(): OcrProvider | null {
  const name = configuredProviderName()
  if (isClientSideProvider(name)) return null

  const provider = PROVIDERS[name]
  if (!provider || !provider.isConfigured()) return null
  return provider
}
