/**
 * Gemini model IDs for Backloggd “Cloud AI” refinement (Gemini path only).
 * Flash / Flash-Lite match the usual Gemini Developer API free tier (RPM/TPM/RPD).
 * @see https://ai.google.dev/pricing
 */
export const BACKLOGGD_GEMINI_TRY_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
] as const

export type BackloggdGeminiModelId = (typeof BACKLOGGD_GEMINI_TRY_MODELS)[number]

const ALLOWED = new Set<string>(BACKLOGGD_GEMINI_TRY_MODELS)

export function isAllowedBackloggdGeminiModel(id: string): id is BackloggdGeminiModelId {
  return ALLOWED.has(id)
}

/** Options for the Add Game UI & server whitelist (value '' = auto order). */
export const BACKLOGGD_GEMINI_MODEL_SELECT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Auto — try in order (recommended)' },
  { value: 'gemini-2.5-flash-lite', label: '2.5 Flash-Lite (often calmer quota)' },
  { value: 'gemini-2.5-flash', label: '2.5 Flash' },
  { value: 'gemini-2.0-flash', label: '2.0 Flash' },
  { value: 'gemini-1.5-flash', label: '1.5 Flash' },
  { value: 'gemini-1.5-flash-8b', label: '1.5 Flash-8B' },
] as const
