import {
  ExclusiveStorageOperation,
  type StorageOperationSnapshot
} from '../../../../shared/storage-operation'

let activeOperation: ExclusiveStorageOperation | null = null
let revision = 0
const listeners = new Set<(snapshot: StorageOperationSnapshot) => void>()

type ConflictErrorFactory = (activeOperation: ExclusiveStorageOperation) => Error

export async function runExclusiveStorageOperation<Result>(
  operation: ExclusiveStorageOperation,
  conflictError: Error | ConflictErrorFactory,
  executeOperation: () => Promise<Result>
): Promise<Result> {
  if (activeOperation !== null) {
    throw typeof conflictError === 'function' ? conflictError(activeOperation) : conflictError
  }

  setActiveOperation(operation)

  try {
    return await executeOperation()
  } finally {
    if (activeOperation === operation) {
      setActiveOperation(null)
    }
  }
}

export function getStorageOperationSnapshot(): StorageOperationSnapshot {
  return { activeOperation, revision }
}

export function subscribeToStorageOperation(
  listener: (snapshot: StorageOperationSnapshot) => void
): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

function setActiveOperation(operation: ExclusiveStorageOperation | null): void {
  activeOperation = operation
  revision += 1
  const snapshot = getStorageOperationSnapshot()

  listeners.forEach((listener) => {
    try {
      listener(snapshot)
    } catch (error) {
      console.error('Unable to publish storage operation state.', error)
    }
  })
}
