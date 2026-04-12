declare module '@micamerzeau/howlongtobeat' {
  export type HltbSearchResult = {
    id: string
    name: string
    imageUrl: string
    gameplayMain?: number
    gameplayMainExtra?: number
    gameplayCompletionist?: number
    similarity: number
  }

  export class HowLongToBeatService {
    constructor()
    search(query: string, signal?: AbortSignal): Promise<HltbSearchResult[]>
  }
}
