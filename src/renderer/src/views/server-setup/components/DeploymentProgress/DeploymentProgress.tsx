import Button from '../../../../components/shared/Button/Button'
import Card from '../../../../components/shared/Card/Card'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import { ServerSetupProgressStep } from '../../../../../../shared/server-setup'
import type { DeploymentStep, DeploymentStatus, DeploymentStepStatus } from '../../server-setup-model'
import { getDeploymentStepStatus, getProgressPercent } from '../../server-setup-progress'

interface DeploymentProgressProps {
  activeStep: ServerSetupProgressStep | null
  deploymentSteps: DeploymentStep[]
  deploymentStatus: Exclude<DeploymentStatus, 'idle'>
  errorMessage: string | null
  onOpenDashboard: () => void
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
  deploymentSteps,
  deploymentStatus,
  errorMessage,
  onOpenDashboard
}: DeploymentProgressProps): React.JSX.Element {
  const progressPercent = getProgressPercent(deploymentSteps, deploymentStatus, activeStep)

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
        {deploymentSteps.map((step) => {
          const stepStatus = getDeploymentStepStatus(deploymentSteps, deploymentStatus, activeStep, step)

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
          <p>Server setup completed.</p>
          <Button icon="dashboard" onClick={onOpenDashboard}>
            Open Dashboard
          </Button>
        </div>
      )}
    </Card>
  )
}

export default DeploymentProgress
