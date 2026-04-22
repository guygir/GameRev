/**
 * Gemini model IDs for Backloggd “Cloud AI” refinement (Gemini path only).
 * Flash / Flash-Lite match the usual Gemini Developer API free tier (RPM/TPM/RPD).
 * Do not add `gemini-1.5-flash` / `gemini-1.5-flash-8b` — Google often returns 404 for them on v1beta `generateContent`.
 * @see https://ai.google.dev/pricing
 * @see https://ai.google.dev/gemini-api/docs/models
 */
export const BACKLOGGD_GEMINI_TRY_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  /** Alias to current Flash generation; last resort after pinned 2.x IDs. */
  'gemini-flash-latest',
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
  { value: 'gemini-flash-latest', label: 'Flash (latest alias)' },
] as const
