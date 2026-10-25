import { shell } from 'electron'
import { stat } from 'fs/promises'
import { isWorldId } from '../../shared/world'
import { getWorldContext } from '../storage/core/world-context'
import { StorageError } from '../storage/core/support/storage-error'

export async function openServerFolder(worldId: unknown): Promise<void> {
  if (!isWorldId(worldId)) {
    throw new StorageError('Invalid world ID.')
  }

  const { world, paths } = await getWorldContext(worldId)

  if (world.serverSetup.status !== 'ready' || !(await isDirectory(paths.serverFolder))) {
    throw new StorageError('Download or set up this server before opening its folder.')
  }

  const errorMessage = await shell.openPath(paths.serverFolder)

  if (errorMessage) {
    throw new StorageError(`Unable to open server folder: ${errorMessage}`)
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
