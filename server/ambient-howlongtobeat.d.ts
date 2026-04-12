declare module '@micamerzeau/howlongtobeat' {
  export type HltbSearchResult = {
    id: string
    name: string
    imageUrl: string
    platforms?: string[]
    gameplayMain?: number
    gameplayMainExtra?: number
    gameplayCompletionist?: number
    similarity: number
  }

  export type HltbDetailResult = {
    id: string
    name: string
    description: string
    platforms: string[]
    imageUrl: string
    gameplayMain: number
    gameplayMainExtra: number
    gameplayCompletionist: number
  }

  export class HowLongToBeatService {
    constructor()
    search(query: string, signal?: AbortSignal): Promise<HltbSearchResult[]>
    detail(gameId: string, signal?: AbortSignal): Promise<HltbDetailResult>
  }
}
