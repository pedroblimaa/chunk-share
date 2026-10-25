import type { LatestSave } from './domain'

const DEFAULT_SHARED_SERVER_NAME = 'Shared Minecraft Server'

export interface ServerSaveConflict {
  token: string
  worldId: string
  saveVersion: number
}

export type ServerActionResult<T> = T | { conflict: ServerSaveConflict }

export function getSharedServerName(latestSave: NonNullable<LatestSave>): string {
  return latestSave.serverName ?? DEFAULT_SHARED_SERVER_NAME
}
