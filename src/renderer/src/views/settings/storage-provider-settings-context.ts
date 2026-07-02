import { createContext } from 'react'
import type { StorageProviderSettingsController } from './settings.model'

export const StorageProviderSettingsContext =
  createContext<StorageProviderSettingsController | null>(null)
