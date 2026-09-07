import type { ServerSetupProgressStep } from '../../../../shared/server-setup'

export type DeploymentStatus = 'idle' | 'running' | 'complete' | 'error'
export type DeploymentStepStatus = 'pending' | 'active' | 'complete'

export interface DeploymentStep {
  id: string
  label: string
  progressSteps: ServerSetupProgressStep[]
}
