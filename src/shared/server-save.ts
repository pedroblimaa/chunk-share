export interface ServerSaveConflict {
  token: string
  worldId: string
  saveVersion: number
}

export type ServerActionResult<T> = T | { conflict: ServerSaveConflict }
