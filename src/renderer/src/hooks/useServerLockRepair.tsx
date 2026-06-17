import { useCallback, useState } from 'react'
import type { DashboardSnapshot } from '../../../shared/dashboard'
import type { StorageSnapshot } from '../../../shared/domain'
import ConfirmationDialog from '../components/shared/ConfirmationDialog/ConfirmationDialog'

interface UseServerLockRepairInput {
  onRepairComplete: (snapshot: DashboardSnapshot, storageSnapshot: StorageSnapshot) => void
  onRepairError: (message: string) => void
  onRepairKept: (message: string) => void
}

interface ServerLockRepair {
  dialog: React.JSX.Element | null
  handleStorageError: (error: unknown) => boolean
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage
}

function isInvalidServerLockError(error: unknown): boolean {
  const message = getErrorMessage(error, '')

  return message.includes('Invalid data shape') && message.includes('lock.json')
}

export function useServerLockRepair({
  onRepairComplete,
  onRepairError,
  onRepairKept
}: UseServerLockRepairInput): ServerLockRepair {
  const [invalidLockMessage, setInvalidLockMessage] = useState<string | null>(null)
  const [isRepairingLock, setIsRepairingLock] = useState(false)

  const handleStorageError = useCallback((error: unknown): boolean => {
    if (!isInvalidServerLockError(error)) {
      return false
    }

    setInvalidLockMessage(getErrorMessage(error, 'Invalid hosting lock file.'))

    return true
  }, [])

  async function repairServerLock(): Promise<void> {
    setIsRepairingLock(true)

    try {
      const nextStorageSnapshot = await window.chunkShare.storage.resetServerLock()
      const nextSnapshot = await window.chunkShare.dashboard.getSnapshot()

      setInvalidLockMessage(null)
      onRepairComplete(nextSnapshot, nextStorageSnapshot)
    } catch (error: unknown) {
      onRepairError(getErrorMessage(error, 'Unable to reset hosting lock.'))
    } finally {
      setIsRepairingLock(false)
    }
  }

  function keepInvalidServerLock(): void {
    onRepairKept(
      invalidLockMessage
        ? 'The hosting lock is still invalid. Reset it before continuing.'
        : 'Unable to continue until the hosting lock is repaired.'
    )
    setInvalidLockMessage(null)
  }

  return {
    dialog: invalidLockMessage ? (
      <ConfirmationDialog
        cancelLabel="Keep File"
        confirmIcon="lock_reset"
        confirmLabel={isRepairingLock ? 'Resetting...' : 'Reset Lock'}
        description="The hosting lock file is invalid. Resetting it marks this server as not currently hosted."
        icon="warning"
        isLoading={isRepairingLock}
        title="Repair Hosting Lock?"
        onCancel={keepInvalidServerLock}
        onConfirm={repairServerLock}
      />
    ) : null,
    handleStorageError
  }
}
