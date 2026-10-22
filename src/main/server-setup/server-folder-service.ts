import { shell } from 'electron'
import { stat } from 'fs/promises'
import { isWorldId } from '../../shared/world'
import { getWorldContext } from '../storage/core/world-context'
import { StorageError } from '../storage/core/support/storage-error'

export async function openServerFolder(worldId: string): Promise<void> {
  if (!isWorldId(worldId)) throw new StorageError('Invalid world ID.')
  const context = await getWorldContext(worldId)
  if (
    context.world.serverSetup.status !== 'ready' ||
    !(await stat(context.paths.serverFolder)).isDirectory()
  ) {
    throw new StorageError('Download or set up this server before opening its folder.')
  }
  const message = await shell.openPath(context.paths.serverFolder)
  if (message) throw new StorageError(`Unable to open server folder: ${message}`)
}
