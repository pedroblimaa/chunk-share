import { ServerSetupProgressStep } from '../../../../shared/server-setup'

export type DeploymentStatus = 'idle' | 'running' | 'complete' | 'error'
export type DeploymentStepStatus = 'pending' | 'active' | 'complete'

export interface DeploymentStep {
  id: string
  label: string
  progressSteps: ServerSetupProgressStep[]
}

export const DEPLOYMENT_STEPS: DeploymentStep[] = [
  {
    id: 'preparing-files',
    label: 'Preparing server files',
    progressSteps: [
      ServerSetupProgressStep.CreatingFolder,
      ServerSetupProgressStep.ResolvingVersion
    ]
  },
  {
    id: 'downloading-server',
    label: 'Downloading Minecraft server',
    progressSteps: [ServerSetupProgressStep.DownloadingJar, ServerSetupProgressStep.VerifyingJar]
  },
  {
    id: 'finalizing-setup',
    label: 'Finalizing setup',
    progressSteps: [ServerSetupProgressStep.WritingProperties, ServerSetupProgressStep.WritingEula]
  }
]
