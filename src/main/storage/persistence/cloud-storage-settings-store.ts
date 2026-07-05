import type { CloudStorageSettings } from '../../../shared/cloud-storage.model'
import { DEFAULT_CLOUD_STORAGE_SETTINGS } from '../core/storage-defaults'
import { cloudStorageSettingsFilePath } from '../core/storage-paths'
import { isCloudStorageSettings } from '../core/storage-validation'
import { readOrCreateJsonFile, writeJsonFile } from './json-file-store'

export async function readCloudStorageSettings(): Promise<CloudStorageSettings> {
  return readOrCreateJsonFile(
    cloudStorageSettingsFilePath,
    DEFAULT_CLOUD_STORAGE_SETTINGS,
    isCloudStorageSettings
  )
}

export async function writeCloudStorageSettings(settings: CloudStorageSettings): Promise<void> {
  await writeJsonFile(cloudStorageSettingsFilePath, settings, isCloudStorageSettings)
}
