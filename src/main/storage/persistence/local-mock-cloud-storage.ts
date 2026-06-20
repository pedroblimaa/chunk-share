import { mkdir, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import type { LatestSave, ServerLock } from '../../../shared/domain'
import { readJsonFile, writeJsonFile } from './json-file-store'
import { DEFAULT_LATEST_SAVE, DEFAULT_SERVER_LOCK } from '../core/storage-defaults'
import {
  latestSaveFilePath,
  mockCloudFolderPath,
  mockCloudVersionsFolderPath,
  serverLockFilePath
} from '../core/storage-paths'
import { isLatestSave, isServerLock } from '../core/storage-validation'

export interface LocalMockCloudSnapshot {
  latestSave: LatestSave
  serverLock: ServerLock
  paths: {
    cloudFolder: string
    versionsFolder: string
  }
}

export async function ensureLocalMockCloud(): Promise<void> {
  await mkdir(mockCloudFolderPath, { recursive: true })
  await mkdir(mockCloudVersionsFolderPath, { recursive: true })
  await readLatestSave()
  await readServerLock()
}

export async function readLocalMockCloudSnapshot(): Promise<LocalMockCloudSnapshot> {
  await ensureLocalMockCloud()

  return {
    latestSave: await readLatestSave(),
    serverLock: await readServerLock(),
    paths: {
      cloudFolder: mockCloudFolderPath,
      versionsFolder: mockCloudVersionsFolderPath
    }
  }
}

export function readLatestSave(): Promise<LatestSave> {
  return readJsonFile(latestSaveFilePath, DEFAULT_LATEST_SAVE, isLatestSave)
}

export function writeLatestSave(latestSave: LatestSave): Promise<void> {
  return writeJsonFile(latestSaveFilePath, latestSave, isLatestSave)
}

export async function resetServerSaves(): Promise<void> {
  await ensureLocalMockCloud()

  const versionFileNames = await readdir(mockCloudVersionsFolderPath)
  const serverSaveFileNames = versionFileNames.filter(isServerSaveVersionFileName)

  await Promise.all(
    serverSaveFileNames.map((fileName) => unlink(join(mockCloudVersionsFolderPath, fileName)))
  )
  await writeLatestSave(DEFAULT_LATEST_SAVE)
}

export function readServerLock(): Promise<ServerLock> {
  return readJsonFile(serverLockFilePath, DEFAULT_SERVER_LOCK, isServerLock)
}

export function writeServerLock(serverLock: ServerLock): Promise<void> {
  return writeJsonFile(serverLockFilePath, serverLock, isServerLock)
}

export function resetServerLock(): Promise<void> {
  return writeServerLock(DEFAULT_SERVER_LOCK)
}

function isServerSaveVersionFileName(fileName: string): boolean {
  return /^server-v\d{3}\.zip$/.test(fileName)
}
