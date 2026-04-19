import { parseReleaseYearFromLabel } from '../../src/lib/parseReleaseYearFromLabel.js'
import { refineBackloggdWithLlm } from './backloggdLlmRefine.js'
import {
  fetchBackloggdSuggestions,
  heuristicEditorSuggestionsFromReviews,
  mergeTagsPreferFirst,
} from './backloggdSuggestions.js'
import type { BackloggdSuggestionsResult } from './backloggdSuggestions.js'
import { fetchIgdbGenreMatches } from './igdbGenres.js'
import type { IgdbGenreMatch } from './igdbGenres.js'
import { fetchSteamReviewBodies, fetchSteamVisibility } from './steamPopularity.js'
import type { ServerProcessEnv } from './serverEnv.js'

export type SteamReviewEditorSuggestions = {
  reviewSnippets: string[]
  suggestedTags: string[]
  suggestedPlayIfLiked: string[]
  suggestedPros: string[]
  suggestedCons: string[]
  llmError?: string
}

export type EditorLookupBundleResponse = {
  query: string
  igdb: { ok: true; matches: IgdbGenreMatch[] } | { ok: false; error: string }
  backloggd: { ok: true; data: BackloggdSuggestionsResult } | { ok: false; error: string }
  steam:
    | {
        ok: true
        appId: number
        steamName: string
        totalReviews: number
        visibilityScore: number
        storeUrl: string
        suggestions: SteamReviewEditorSuggestions | null
        suggestionsError?: string
      }
    | { ok: false; error: string }
}

async function buildSteamReviewSuggestions(
  env: ServerProcessEnv,
  gameTitle: string,
  bodies: string[],
  igdbGenreSeeds: string[],
  useLlm: boolean,
  geminiModel: string | undefined,
): Promise<SteamReviewEditorSuggestions> {
  const heur = heuristicEditorSuggestionsFromReviews(bodies, igdbGenreSeeds)
  let suggestedTags = heur.suggestedTags
  let suggestedPlayIfLiked = heur.suggestedPlayIfLiked
  let suggestedPros = heur.suggestedPros
  let suggestedCons = heur.suggestedCons
  let llmError: string | undefined

  if (useLlm) {
    const refined = await refineBackloggdWithLlm(
      env,
      {
        gameTitle,
        genres: suggestedTags.slice(0, 12),
        reviewSnippets: bodies.slice(0, 8),
      },
      { geminiModel: geminiModel ?? null },
    )
    if (refined.ok) {
      suggestedTags = mergeTagsPreferFirst(refined.data.suggestedTags, suggestedTags, 16)
      suggestedPlayIfLiked = refined.data.suggestedPlayIfLiked
      suggestedPros = refined.data.suggestedPros
      suggestedCons = refined.data.suggestedCons
    } else {
      llmError = refined.error
    }
  }

  return {
    reviewSnippets: bodies.slice(0, 5).map((s) => (s.length > 420 ? `${s.slice(0, 417)}…` : s)),
    suggestedTags: suggestedTags.slice(0, 16),
    suggestedPlayIfLiked,
    suggestedPros,
    suggestedCons,
    ...(llmError ? { llmError } : {}),
  }
}

export async function runEditorLookupBundle(
  env: ServerProcessEnv,
  input: {
    query: string
    releaseLabel?: string
    useLlm?: boolean
    geminiModel?: string
  },
): Promise<EditorLookupBundleResponse> {
  const query = input.query.trim()
  if (query.length < 2) {
    const err = 'Query too short (need at least 2 characters).'
    return {
      query,
      igdb: { ok: false, error: err },
      backloggd: { ok: false, error: err },
      steam: { ok: false, error: err },
    }
  }

  const useLlm = input.useLlm === true
  const geminiModel = input.geminiModel?.trim() || undefined
  const releaseYear = parseReleaseYearFromLabel(input.releaseLabel?.trim() || null)

  const igdbP = (async (): Promise<EditorLookupBundleResponse['igdb']> => {
    try {
      const cid = (env.IGDB_CLIENT_ID ?? '').trim()
      const sec = (env.IGDB_CLIENT_SECRET ?? '').trim()
      const matches = await fetchIgdbGenreMatches(query, cid, sec)
      return { ok: true, matches }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'IGDB failed' }
    }
  })()

  const backloggdP = fetchBackloggdSuggestions(query, { useLlm, env, geminiModel })
  const steamVisP = fetchSteamVisibility(query, releaseYear)

  const [igdb, backloggd, steamVis] = await Promise.all([igdbP, backloggdP, steamVisP])

  const backloggdNorm: EditorLookupBundleResponse['backloggd'] =
    backloggd.ok === true ? { ok: true, data: backloggd.data } : { ok: false, error: backloggd.error }

  let steam: EditorLookupBundleResponse['steam']
  if ('error' in steamVis) {
    steam = { ok: false, error: steamVis.error }
  } else {
    const igdbGenres =
      igdb.ok && igdb.matches[0] && Array.isArray(igdb.matches[0].genres) ? igdb.matches[0].genres : []

    let suggestions: SteamReviewEditorSuggestions | null = null
    let suggestionsError: string | undefined
    const bodiesRes = await fetchSteamReviewBodies(steamVis.appId)
    if (bodiesRes.ok === false) {
      suggestionsError = bodiesRes.error
    } else if (bodiesRes.bodies.length === 0) {
      suggestions = null
    } else {
      try {
        suggestions = await buildSteamReviewSuggestions(
          env,
          steamVis.steamName,
          bodiesRes.bodies,
          igdbGenres,
          useLlm,
          geminiModel,
        )
      } catch (e) {
        suggestionsError = e instanceof Error ? e.message : 'Steam suggestion build failed'
      }
    }

    steam = {
      ok: true,
      appId: steamVis.appId,
      steamName: steamVis.steamName,
      totalReviews: steamVis.totalReviews,
      visibilityScore: steamVis.visibilityScore,
      storeUrl: `https://store.steampowered.com/app/${steamVis.appId}/`,
      suggestions,
      ...(suggestionsError ? { suggestionsError } : {}),
    }
  }

  return {
    query,
    igdb,
    backloggd: backloggdNorm,
    steam,
  }
}
