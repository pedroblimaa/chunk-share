import { describe, expect, it } from 'vitest'
import { CloudStorageProvider } from '../../../src/shared/cloud-storage.model'
import { ServerSetupProgressStep } from '../../../src/shared/server-setup'
import {
  getDeploymentSteps,
  getDeploymentStepStatus,
  getProgressPercent
} from '../../../src/renderer/src/views/server-setup/server-setup-progress'

describe('server setup progress', () => {
  it('uses three steps for local storage', () => {
    const steps = getDeploymentSteps(CloudStorageProvider.Local)

    expect(steps.map(({ label }) => label)).toEqual([
      'Preparing server files',
      'Downloading Minecraft server',
      'Finalizing setup'
    ])
    expect(steps.flatMap(({ progressSteps }) => progressSteps)).not.toContain(
      ServerSetupProgressStep.SettingUpGoogleDrive
    )
  })

  it('inserts Google Drive setup before downloading', () => {
    const steps = getDeploymentSteps(CloudStorageProvider.GoogleDrive)

    expect(steps.map(({ label }) => label)).toEqual([
      'Preparing server files',
      'Setting up Google Drive',
      'Downloading Minecraft server',
      'Finalizing setup'
    ])
    expect(
      getDeploymentStepStatus(steps, 'running', ServerSetupProgressStep.SettingUpGoogleDrive, steps[1]!)
    ).toBe('active')
    expect(
      getDeploymentStepStatus(steps, 'running', ServerSetupProgressStep.SettingUpGoogleDrive, steps[0]!)
    ).toBe('complete')
    expect(getProgressPercent(steps, 'running', ServerSetupProgressStep.SettingUpGoogleDrive)).toBe(50)
    expect(getProgressPercent(steps, 'running', ServerSetupProgressStep.ResolvingVersion)).toBe(75)
  })
})
