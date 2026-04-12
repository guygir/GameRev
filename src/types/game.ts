import type { GameStatAxis, GameStats } from '../review/gameStats'

export type { GameStatAxis, GameStats }

export type PlayIfLikedStored = {
  name: string
  slug: string | null
}

export type GameRow = {
  id: string
  slug: string
  name: string
  subtitle: string
  cover_image_url: string | null
  hltb_main_hours: number | null
  hltb_extras_hours: number | null
  hltb_completionist_hours: number | null
  stats: GameStats
  pros: string[]
  cons: string[]
  play_if_liked: PlayIfLikedStored[]
  created_at: string
}

export type CommentRow = {
  id: string
  game_id: string
  body: string
  author_name: string | null
  created_at: string
}
