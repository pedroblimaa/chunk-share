import type { ServerActionResult } from '../../shared/server-save'
import { FabricSaveConflictError } from '../storage/server-save/fabric-save-conflict'

export async function withSaveConflict<T>(operation: () => Promise<T>): Promise<ServerActionResult<T>> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof FabricSaveConflictError) return { conflict: error.conflict }
    throw error
  }
}
