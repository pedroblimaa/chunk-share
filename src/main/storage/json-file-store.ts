import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { StorageError } from './storage-error'

type Validator<T> = (value: unknown) => value is T

const WRITE_RENAME_ATTEMPTS = 8
const WRITE_RENAME_RETRY_DELAY_MS = 25

export async function readJsonFile<T>(
  filePath: string,
  defaultValue: T,
  validate: Validator<T>
): Promise<T> {
  await mkdir(dirname(filePath), { recursive: true })

  try {
    const rawJson = await readFile(filePath, 'utf-8')
    const parsedJson: unknown = JSON.parse(rawJson)

    if (!validate(parsedJson)) {
      throw new StorageError(`Invalid data shape in ${filePath}`)
    }

    return parsedJson
  } catch (error) {
    if (isMissingFileError(error)) {
      await writeJsonFile(filePath, defaultValue)
      return defaultValue
    }

    if (error instanceof SyntaxError) {
      throw new StorageError(`Invalid JSON syntax in ${filePath}`)
    }

    throw error
  }
}

export async function writeJsonFile<T>(
  filePath: string,
  value: T,
  validate?: Validator<T>
): Promise<void> {
  if (validate && !validate(value)) {
    throw new StorageError(`Refusing to write invalid data shape to ${filePath}`)
  }

  await mkdir(dirname(filePath), { recursive: true })

  const tempFilePath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  const json = `${JSON.stringify(value, null, 2)}\n`

  await writeFile(tempFilePath, json, 'utf-8')

  try {
    await renameWithRetry(tempFilePath, filePath)
  } catch (error) {
    await rm(tempFilePath, { force: true })
    throw error
  }
}

async function renameWithRetry(sourcePath: string, destinationPath: string): Promise<void> {
  for (let attempt = 1; attempt <= WRITE_RENAME_ATTEMPTS; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath)
      return
    } catch (error) {
      if (!shouldRetryRename(error) || attempt === WRITE_RENAME_ATTEMPTS) {
        throw error
      }

      await delay(WRITE_RENAME_RETRY_DELAY_MS * attempt)
    }
  }
}

function shouldRetryRename(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'EPERM' || error.code === 'EBUSY')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isMissingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
