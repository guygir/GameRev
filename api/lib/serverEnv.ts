/** Shape of `process.env` without the `NodeJS` global (works when `types` omits `@types/node`). */
export type ServerProcessEnv = Record<string, string | undefined>
