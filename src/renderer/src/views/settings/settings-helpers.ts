import type { CloudStorageProviderDataSummary } from '../../../../shared/cloud-storage.model'

export function storageProviderHasData(summary: CloudStorageProviderDataSummary): boolean {
  return summary.latestSaveVersion !== null || summary.versionCount > 0
}
