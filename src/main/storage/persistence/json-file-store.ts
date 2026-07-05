import { randomUUID } from 'crypto'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { renameWithRetry } from '../core/file-system-utils'
import { StorageError } from '../core/storage-error'

type Validator<T> = (value: unknown) => value is T

export async function readOrCreateJsonFile<T>(
  filePath: string,
  defaultValue: T,
  validate: Validator<T>
): Promise<T> {
  await mkdir(dirname(filePath), { recursive: true })

  try {
    return await readAndValidateJsonFile(filePath, validate)
  } catch (error) {
    if (isMissingFileError(error)) {
      await writeJsonFile(filePath, defaultValue)
      return defaultValue
    }

    throw error
  }
}

export async function readJsonFileOrDefault<T>(
  filePath: string,
  defaultValue: T,
  validate: Validator<T>
): Promise<T> {
  try {
    return await readAndValidateJsonFile(filePath, validate)
  } catch (error) {
    if (isMissingFileError(error)) {
      return defaultValue
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

async function readAndValidateJsonFile<T>(filePath: string, validate: Validator<T>): Promise<T> {
  const rawJson = await readFile(filePath, 'utf-8')
  let parsedJson: unknown

  try {
    parsedJson = JSON.parse(rawJson)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new StorageError(`Invalid JSON syntax in ${filePath}`)
    }

    throw error
  }

  if (!validate(parsedJson)) {
    throw new StorageError(`Invalid data shape in ${filePath}`)
  }

  return parsedJson
}

function isMissingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
