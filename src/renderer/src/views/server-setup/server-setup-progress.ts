import { CloudStorageProvider } from '../../../../shared/cloud-storage.model'
import { ServerSetupProgressStep } from '../../../../shared/server-setup'
import type { DeploymentStep, DeploymentStatus, DeploymentStepStatus } from './server-setup-model'

const PREPARING_FILES_STEP: DeploymentStep = {
  id: 'preparing-files',
  label: 'Preparing server files',
  progressSteps: [ServerSetupProgressStep.CreatingFolder]
}

const GOOGLE_DRIVE_STEP: DeploymentStep = {
  id: 'setting-up-google-drive',
  label: 'Setting up Google Drive',
  progressSteps: [ServerSetupProgressStep.SettingUpGoogleDrive]
}

const DOWNLOADING_SERVER_STEP: DeploymentStep = {
  id: 'downloading-server',
  label: 'Downloading Minecraft server',
  progressSteps: [
    ServerSetupProgressStep.ResolvingVersion,
    ServerSetupProgressStep.DownloadingJar,
    ServerSetupProgressStep.VerifyingJar
  ]
}

const FINALIZING_SETUP_STEP: DeploymentStep = {
  id: 'finalizing-setup',
  label: 'Finalizing setup',
  progressSteps: [ServerSetupProgressStep.WritingProperties, ServerSetupProgressStep.WritingEula]
}

export function getDeploymentSteps(provider: CloudStorageProvider): DeploymentStep[] {
  return provider === CloudStorageProvider.GoogleDrive
    ? [PREPARING_FILES_STEP, GOOGLE_DRIVE_STEP, DOWNLOADING_SERVER_STEP, FINALIZING_SETUP_STEP]
    : [PREPARING_FILES_STEP, DOWNLOADING_SERVER_STEP, FINALIZING_SETUP_STEP]
}

export function getDeploymentStepStatus(
  steps: DeploymentStep[],
  deploymentStatus: DeploymentStatus,
  activeStep: ServerSetupProgressStep | null,
  step: DeploymentStep
): DeploymentStepStatus {
  if (deploymentStatus === 'complete') {
    return 'complete'
  }

  const activeStepIndex = steps.findIndex(
    (deploymentStep) => activeStep && deploymentStep.progressSteps.includes(activeStep)
  )
  const stepIndex = steps.findIndex((deploymentStep) => deploymentStep.id === step.id)

  if (stepIndex >= 0 && activeStepIndex >= 0 && stepIndex < activeStepIndex) {
    return 'complete'
  }

  if (deploymentStatus === 'running' && activeStep && step.progressSteps.includes(activeStep)) {
    return 'active'
  }

  return 'pending'
}

export function getProgressPercent(
  steps: DeploymentStep[],
  deploymentStatus: DeploymentStatus,
  activeStep: ServerSetupProgressStep | null
): number {
  if (deploymentStatus === 'complete') {
    return 100
  }

  const activeStepIndex = steps.findIndex((step) => activeStep && step.progressSteps.includes(activeStep))

  if (activeStepIndex < 0) {
    return 0
  }

  return Math.round(((activeStepIndex + 1) / steps.length) * 100)
}
