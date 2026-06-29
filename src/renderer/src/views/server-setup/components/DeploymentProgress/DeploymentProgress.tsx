import Button from '../../../../components/shared/Button/Button'
import Card from '../../../../components/shared/Card/Card'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import { ServerSetupProgressStep } from '../../../../../../shared/server-setup'
import {
  DEPLOYMENT_STEPS,
  type DeploymentStep,
  type DeploymentStatus,
  type DeploymentStepStatus
} from '../../server-setup-model'

interface DeploymentProgressProps {
  activeStep: ServerSetupProgressStep | null
  deploymentStatus: Exclude<DeploymentStatus, 'idle'>
  errorMessage: string | null
  onOpenDashboard: () => void
}

function getDeploymentStepStatus(
  deploymentStatus: DeploymentStatus,
  activeStep: ServerSetupProgressStep | null,
  step: DeploymentStep
): DeploymentStepStatus {
  if (deploymentStatus === 'complete') {
    return 'complete'
  }

  const activeStepIndex = DEPLOYMENT_STEPS.findIndex(
    (deploymentStep) => activeStep && deploymentStep.progressSteps.includes(activeStep)
  )
  const stepIndex = DEPLOYMENT_STEPS.findIndex((deploymentStep) => deploymentStep.id === step.id)

  if (stepIndex >= 0 && activeStepIndex >= 0 && stepIndex < activeStepIndex) {
    return 'complete'
  }

  if (deploymentStatus === 'running' && activeStep && step.progressSteps.includes(activeStep)) {
    return 'active'
  }

  return 'pending'
}

function getProgressPercent(
  deploymentStatus: DeploymentStatus,
  activeStep: ServerSetupProgressStep | null
): number {
  if (deploymentStatus === 'complete') {
    return 100
  }

  const activeStepIndex = DEPLOYMENT_STEPS.findIndex(
    (step) => activeStep && step.progressSteps.includes(activeStep)
  )

  if (activeStepIndex < 0) {
    return 0
  }

  return Math.round(((activeStepIndex + 1) / DEPLOYMENT_STEPS.length) * 100)
}

function getDeploymentStepIconName(stepStatus: DeploymentStepStatus): string {
  if (stepStatus === 'complete') {
    return 'check_circle'
  }

  if (stepStatus === 'active') {
    return 'sync'
  }

  return 'pending'
}

function DeploymentProgress({
  activeStep,
  deploymentStatus,
  errorMessage,
  onOpenDashboard
}: DeploymentProgressProps): React.JSX.Element {
  const progressPercent = getProgressPercent(deploymentStatus, activeStep)

  return (
    <Card className={`setup-progress-card setup-progress-card-${deploymentStatus}`} padding="large">
      <div className="setup-progress-heading">
        <h3>Deployment Progress</h3>
        <span>{progressPercent}%</span>
      </div>

      <div className="setup-progress-track" aria-hidden="true">
        <div className="setup-progress-value" style={{ width: `${progressPercent}%` }} />
      </div>

      <ol className="setup-progress-steps">
        {DEPLOYMENT_STEPS.map((step) => {
          const stepStatus = getDeploymentStepStatus(deploymentStatus, activeStep, step)

          return (
            <li className={`setup-progress-step setup-progress-step-${stepStatus}`} key={step.id}>
              <MaterialIcon name={getDeploymentStepIconName(stepStatus)} filled={stepStatus === 'complete'} />
              <span>{step.label}</span>
            </li>
          )
        })}
      </ol>

      {deploymentStatus === 'error' && (
        <div className="setup-progress-error">
          <MaterialIcon name="error" />
          <p>{errorMessage ?? 'Server setup failed.'}</p>
        </div>
      )}

      {deploymentStatus === 'complete' && (
        <div className="setup-progress-actions">
          <p>Server setup preview completed.</p>
          <Button icon="dashboard" onClick={onOpenDashboard}>
            Open Dashboard
          </Button>
        </div>
      )}
    </Card>
  )
}

export default DeploymentProgress
