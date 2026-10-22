export interface FabricRuntime {
  loaderVersion: string
  installerVersion: string
}

export interface FabricVersionOptions {
  loaders: string[]
  installerVersion: string
}

export function isFabricRuntime(value: unknown): value is FabricRuntime {
  if (!value || typeof value !== 'object') return false
  return (
    'loaderVersion' in value &&
    isFabricVersion(value.loaderVersion) &&
    'installerVersion' in value &&
    isFabricVersion(value.installerVersion)
  )
}

export function isFabricVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[.+-][a-zA-Z0-9.-]+)?$/.test(value)
}
