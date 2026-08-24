import { describe, expect, it, vi } from 'vitest'
import { ExclusiveStorageOperation } from '../../../src/shared/storage-operation'
import {
  getStorageOperationSnapshot,
  runExclusiveStorageOperation,
  subscribeToStorageOperation
} from '../../../src/main/storage/core/operations/operation-coordinator'

describe('storage operation coordinator', () => {
  it('reports the active operation and clears it after completion', async () => {
    let releaseOperation = (): void => undefined
    const operationGate = new Promise<void>((resolve) => {
      releaseOperation = resolve
    })
    const snapshots: ReturnType<typeof getStorageOperationSnapshot>[] = []
    const unsubscribe = subscribeToStorageOperation((snapshot) => snapshots.push(snapshot))
    const operation = runExclusiveStorageOperation(
      ExclusiveStorageOperation.ServerDelete,
      new Error('conflict'),
      () => operationGate
    )

    try {
      expect(getStorageOperationSnapshot().activeOperation).toBe(ExclusiveStorageOperation.ServerDelete)
      expect(snapshots.at(-1)?.activeOperation).toBe(ExclusiveStorageOperation.ServerDelete)

      const conflictFactory = vi.fn(
        (activeOperation: ExclusiveStorageOperation) => new Error(`conflict:${activeOperation}`)
      )
      await expect(
        runExclusiveStorageOperation(ExclusiveStorageOperation.StorageSettingsChange, conflictFactory, () =>
          Promise.resolve()
        )
      ).rejects.toThrow('conflict:server-delete')
      expect(conflictFactory).toHaveBeenCalledWith(ExclusiveStorageOperation.ServerDelete)
    } finally {
      releaseOperation()
      await operation
      unsubscribe()
    }

    expect(getStorageOperationSnapshot().activeOperation).toBeNull()
    expect(snapshots.at(-1)?.activeOperation).toBeNull()
  })

  it('does not let an observer failure interrupt the operation', async () => {
    const observerError = new Error('observer failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const unsubscribe = subscribeToStorageOperation(() => {
      throw observerError
    })

    try {
      await expect(
        runExclusiveStorageOperation(ExclusiveStorageOperation.ServerSetup, new Error('conflict'), () =>
          Promise.resolve('completed')
        )
      ).resolves.toBe('completed')
    } finally {
      unsubscribe()
      consoleError.mockRestore()
    }

    expect(getStorageOperationSnapshot().activeOperation).toBeNull()
  })
})
