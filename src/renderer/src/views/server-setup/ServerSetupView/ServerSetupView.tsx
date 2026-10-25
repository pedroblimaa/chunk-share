import './ServerSetupView.css'

import { useEffect, useRef, useState } from 'react'
import type { ServerDisplayState } from '../../../../../shared/dashboard'
import type { WorldId } from '../../../../../shared/world'
import {
  ServerSetupProgressStep,
  type SetupServerInput,
  type SupportedServerType
} from '../../../../../shared/server-setup'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import { getErrorMessage } from '../../../utils/error-message'
import TopBar from '../../dashboard/components/TopBar/TopBar'
import DeploymentProgress from '../components/DeploymentProgress/DeploymentProgress'
import SetupForm from '../components/SetupForm/SetupForm'
import { useServerVersions } from '../useServerVersions'
import type { DeploymentStatus } from '../server-setup-model'
import { getDeploymentSteps } from '../server-setup-progress'

interface ServerSetupViewProps {
  isSidebarOpen: boolean
  snapshot: ServerDisplayState
  onCancel: () => void
  onCloseSidebar: () => void
  onOpenDashboard: (worldId: WorldId) => void
  onOpenSettings: () => void
  onSignOut: () => void
  onSetupComplete: () => Promise<void>
  onToggleSidebar: () => void
}

function ServerSetupView({
  isSidebarOpen,
  snapshot,
  onCancel,
  onCloseSidebar,
  onOpenDashboard,
  onOpenSettings,
  onSignOut,
  onSetupComplete,
  onToggleSidebar
}: ServerSetupViewProps): React.JSX.Element {
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>('idle')
  const [activeStep, setActiveStep] = useState<ServerSetupProgressStep | null>(null)
  const [setupErrorMessage, setSetupErrorMessage] = useState<string | null>(null)
  const [serverType, setServerType] = useState<SupportedServerType>('vanilla')
  const serverVersions = useServerVersions(serverType)
  const [completedWorldId, setCompletedWorldId] = useState<WorldId | null>(null)
  const progressSectionRef = useRef<HTMLDivElement | null>(null)
  const deploymentSteps = getDeploymentSteps(snapshot.activeProvider)

  const formIsLocked = deploymentStatus !== 'idle'

  useEffect(() => {
    return window.chunkShare.serverSetup.onProgress((progressEvent) => {
      if (progressEvent.step === ServerSetupProgressStep.Ready) {
        return
      }

      setDeploymentStatus('running')
      setActiveStep(progressEvent.step)
    })
  }, [])

  useEffect(() => {
    if (deploymentStatus === 'idle') {
      return
    }

    progressSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }, [deploymentStatus])

  async function setupServer(input: SetupServerInput): Promise<void> {
    setDeploymentStatus('running')
    setActiveStep(ServerSetupProgressStep.CreatingFolder)
    setCompletedWorldId(null)
    setSetupErrorMessage(null)

    try {
      const setupResult = await window.chunkShare.serverSetup.create(input)
      const { localState, worldId } = setupResult

      if (localState.serverSetup.status === 'error') {
        setDeploymentStatus('error')
        setSetupErrorMessage(localState.serverSetup.errorMessage ?? 'Server setup failed.')
        return
      }

      if (!worldId) {
        throw new Error('The newly created server did not return a world ID.')
      }

      await onSetupComplete()
      setCompletedWorldId(worldId)
      setDeploymentStatus('complete')
    } catch (error: unknown) {
      setDeploymentStatus('error')
      setSetupErrorMessage(getErrorMessage(error, 'Server setup failed.'))
    }
  }

  return (
    <div className="dashboard-screen setup-screen">
      <AppSidebar
        activeItem="servers"
        isOpen={isSidebarOpen}
        onClose={onCloseSidebar}
        onOpenServers={onCancel}
        onOpenSettings={onOpenSettings}
      />

      <div className="dashboard-main">
        <TopBar
          isSidebarOpen={isSidebarOpen}
          user={snapshot.signedInUser}
          breadcrumbs={[{ label: 'Servers', onClick: onCancel }, { label: 'Create Server' }]}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
          onToggleSidebar={onToggleSidebar}
        />

        <main className="dashboard-content setup-content">
          <header className="setup-header">
            <h2>Create New Server</h2>
            <p>Set up a Vanilla or Fabric server to take turns hosting with friends.</p>
          </header>

          <SetupForm
            disabled={formIsLocked}
            serverType={serverType}
            onServerTypeChange={setServerType}
            onCancel={onCancel}
            onRetryVersions={serverVersions.retry}
            onSubmit={setupServer}
            versions={serverVersions.versions}
            versionsErrorMessage={serverVersions.error}
            versionsLoading={serverVersions.isLoading}
          />

          {deploymentStatus !== 'idle' && (
            <div ref={progressSectionRef}>
              <DeploymentProgress
                activeStep={activeStep}
                deploymentSteps={deploymentSteps}
                deploymentStatus={deploymentStatus}
                errorMessage={setupErrorMessage}
                onOpenDashboard={() => {
                  if (completedWorldId) {
                    onOpenDashboard(completedWorldId)
                  }
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default ServerSetupView
