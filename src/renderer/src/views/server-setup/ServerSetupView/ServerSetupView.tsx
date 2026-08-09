import './ServerSetupView.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerDisplayState } from '../../../../../shared/dashboard'
import {
  ServerSetupProgressStep,
  type SetupVanillaServerInput,
  type VanillaMinecraftVersion
} from '../../../../../shared/server-setup'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import { getErrorMessage } from '../../../utils/error-message'
import TopBar from '../../dashboard/components/TopBar/TopBar'
import DeploymentProgress from '../components/DeploymentProgress/DeploymentProgress'
import SetupForm from '../components/SetupForm/SetupForm'
import type { DeploymentStatus } from '../server-setup-model'

interface ServerSetupViewProps {
  isSidebarOpen: boolean
  snapshot: ServerDisplayState
  onCancel: () => void
  onCloseSidebar: () => void
  onOpenDashboard: () => void
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
  const [versions, setVersions] = useState<VanillaMinecraftVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(true)
  const [versionsErrorMessage, setVersionsErrorMessage] = useState<string | null>(null)
  const progressSectionRef = useRef<HTMLDivElement | null>(null)

  const formIsLocked = deploymentStatus !== 'idle'

  const loadVersions = useCallback(async (): Promise<void> => {
    setVersionsLoading(true)
    setVersionsErrorMessage(null)

    try {
      const vanillaVersions = await window.chunkShare.serverSetup.listVanillaVersions()
      setVersions(vanillaVersions)
    } catch (error: unknown) {
      setVersionsErrorMessage(getErrorMessage(error, 'Unable to load Minecraft versions.'))
    } finally {
      setVersionsLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    window.chunkShare.serverSetup
      .listVanillaVersions()
      .then((vanillaVersions) => {
        if (isMounted) {
          setVersions(vanillaVersions)
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return
        }

        setVersionsErrorMessage(getErrorMessage(error, 'Unable to load Minecraft versions.'))
      })
      .finally(() => {
        if (isMounted) {
          setVersionsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    return window.chunkShare.serverSetup.onProgress((progressEvent) => {
      if (progressEvent.step === ServerSetupProgressStep.Ready) {
        setDeploymentStatus('complete')
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

  async function setupServer(input: SetupVanillaServerInput): Promise<void> {
    setDeploymentStatus('running')
    setActiveStep(null)
    setSetupErrorMessage(null)

    try {
      const storageSnapshot = await window.chunkShare.serverSetup.setupVanillaServer(input)

      if (storageSnapshot.localState.serverSetup.status === 'error') {
        setDeploymentStatus('error')
        setSetupErrorMessage(storageSnapshot.localState.serverSetup.errorMessage ?? 'Server setup failed.')
        return
      }

      await onSetupComplete()
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
            <p>Configure a local Vanilla server for shared world handoff.</p>
          </header>

          <SetupForm
            disabled={formIsLocked}
            onCancel={onCancel}
            onRetryVersions={loadVersions}
            onSubmit={setupServer}
            versions={versions}
            versionsErrorMessage={versionsErrorMessage}
            versionsLoading={versionsLoading}
          />

          {deploymentStatus !== 'idle' && (
            <div ref={progressSectionRef}>
              <DeploymentProgress
                activeStep={activeStep}
                deploymentStatus={deploymentStatus}
                errorMessage={setupErrorMessage}
                onOpenDashboard={onOpenDashboard}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default ServerSetupView
