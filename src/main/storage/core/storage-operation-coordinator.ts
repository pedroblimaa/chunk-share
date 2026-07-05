import { ExclusiveStorageOperation } from './storage-operation.model'

let activeOperation: ExclusiveStorageOperation | null = null

export async function runExclusiveStorageOperation<Result>(
  operation: ExclusiveStorageOperation,
  conflictError: Error,
  executeOperation: () => Promise<Result>
): Promise<Result> {
  if (activeOperation !== null) {
    throw conflictError
  }

  activeOperation = operation

  try {
    return await executeOperation()
  } finally {
    if (activeOperation === operation) {
      activeOperation = null
    }
  }
}
