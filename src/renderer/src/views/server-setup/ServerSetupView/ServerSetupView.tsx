import './ServerSetupView.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardSnapshot } from '../../../../../shared/dashboard'
import type { StorageSnapshot } from '../../../../../shared/domain'
import {
  ServerSetupProgressStep,
  type SetupVanillaServerInput,
  type VanillaMinecraftVersion
} from '../../../../../shared/server-setup'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import TopBar from '../../dashboard/components/TopBar/TopBar'
import DeploymentProgress from '../components/DeploymentProgress/DeploymentProgress'
import SetupForm from '../components/SetupForm/SetupForm'
import type { DeploymentStatus } from '../server-setup-model'

interface ServerSetupViewProps {
  snapshot: DashboardSnapshot
  onCancel: () => void
  onOpenDashboard: () => void
  onSetupComplete: (storageSnapshot: StorageSnapshot) => void
}

const SETUP_DISABLED_REASON = "You're already creating an instance."

function ServerSetupView({
  snapshot,
  onCancel,
  onOpenDashboard,
  onSetupComplete
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
      const message = error instanceof Error ? error.message : 'Unable to load Minecraft versions.'
      setVersionsErrorMessage(message)
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

        const message =
          error instanceof Error ? error.message : 'Unable to load Minecraft versions.'
        setVersionsErrorMessage(message)
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
      onSetupComplete(storageSnapshot)

      if (storageSnapshot.localState.serverSetup.status === 'error') {
        setDeploymentStatus('error')
        setSetupErrorMessage(
          storageSnapshot.localState.serverSetup.errorMessage ?? 'Server setup failed.'
        )
        return
      }

      setDeploymentStatus('complete')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Server setup failed.'
      setDeploymentStatus('error')
      setSetupErrorMessage(message)
    }
  }

  return (
    <div className="dashboard-screen setup-screen">
      <AppSidebar addServerDisabled addServerTitle={SETUP_DISABLED_REASON} />

      <div className="dashboard-main">
        <TopBar
          user={snapshot.signedInUser}
          breadcrumbs={[{ label: 'Servers', onClick: onCancel }, { label: 'Create Instance' }]}
          createInstanceDisabled
          createInstanceTitle={SETUP_DISABLED_REASON}
        />

        <main className="dashboard-content setup-content">
          <header className="setup-header">
            <h2>Create New Instance</h2>
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
