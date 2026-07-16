import { stat } from 'fs/promises'
import { ServerRuntimeError } from './runtime-error'

export async function assertFolderExists(folderPath: string): Promise<void> {
  const fileStats = await stat(folderPath).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new ServerRuntimeError(`Server folder does not exist: ${folderPath}`)
    }

    throw error
  })

  if (!fileStats.isDirectory()) {
    throw new ServerRuntimeError(`Server folder is not a directory: ${folderPath}`)
  }
}

export async function assertFileExists(filePath: string): Promise<void> {
  const fileStats = await stat(filePath).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new ServerRuntimeError(`server.jar was not found at ${filePath}`)
    }

    throw error
  })

  if (!fileStats.isFile()) {
    throw new ServerRuntimeError(`server.jar path is not a file: ${filePath}`)
  }
}

export function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
