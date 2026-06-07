import { mkdir } from 'fs/promises'
import type { LatestWorld, ServerLock } from '../../shared/domain'
import { readJsonFile, writeJsonFile } from './json-file-store'
import { DEFAULT_LATEST_WORLD, DEFAULT_SERVER_LOCK } from './storage-defaults'
import {
  latestWorldFilePath,
  mockCloudFolderPath,
  mockCloudVersionsFolderPath,
  serverLockFilePath
} from './storage-paths'
import { isLatestWorld, isServerLock } from './storage-validation'

export interface LocalMockCloudSnapshot {
  latestWorld: LatestWorld
  serverLock: ServerLock
  paths: {
    cloudFolder: string
    versionsFolder: string
  }
}

export async function ensureLocalMockCloud(): Promise<void> {
  await mkdir(mockCloudFolderPath, { recursive: true })
  await mkdir(mockCloudVersionsFolderPath, { recursive: true })
  await readLatestWorld()
  await readServerLock()
}

export async function readLocalMockCloudSnapshot(): Promise<LocalMockCloudSnapshot> {
  await ensureLocalMockCloud()

  return {
    latestWorld: await readLatestWorld(),
    serverLock: await readServerLock(),
    paths: {
      cloudFolder: mockCloudFolderPath,
      versionsFolder: mockCloudVersionsFolderPath
    }
  }
}

export function readLatestWorld(): Promise<LatestWorld> {
  return readJsonFile(latestWorldFilePath, DEFAULT_LATEST_WORLD, isLatestWorld)
}

export function writeLatestWorld(latestWorld: LatestWorld): Promise<void> {
  return writeJsonFile(latestWorldFilePath, latestWorld, isLatestWorld)
}

export function readServerLock(): Promise<ServerLock> {
  return readJsonFile(serverLockFilePath, DEFAULT_SERVER_LOCK, isServerLock)
}

export function writeServerLock(serverLock: ServerLock): Promise<void> {
  return writeJsonFile(serverLockFilePath, serverLock, isServerLock)
}
