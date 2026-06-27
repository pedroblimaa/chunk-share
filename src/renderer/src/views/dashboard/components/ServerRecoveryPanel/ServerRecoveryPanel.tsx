import './ServerRecoveryPanel.css'

import Button from '../../../../components/shared/Button/Button'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import type { ServerRecoveryPanelProps } from './ServerRecoveryPanel.model'
import { SERVER_RECOVERY_PROGRESS_COPY } from './server-recovery.constants'

function ServerRecoveryPanel({
  hasSharedSave,
  recovery,
  onRecover,
  onRestoreSharedSave
}: ServerRecoveryPanelProps): React.JSX.Element {
  const progressCopy = recovery.phase ? SERVER_RECOVERY_PROGRESS_COPY[recovery.phase] : null
  const showRestoreAction = recovery.attemptFailed && hasSharedSave && !progressCopy
  let description =
    'The previous server session ended without publishing. Recover it before hosting or changing storage.'

  if (recovery.processIsRunning) {
    description =
      'The previous Minecraft process is still running. Recovery will stop it, reload the world, save cleanly, and publish.'
  } else if (recovery.attemptFailed) {
    description =
      'Automatic recovery failed. Try again, or restore the last shared save and discard local crash changes.'
  }

  if (progressCopy) {
    return (
      <section className="server-recovery-panel" aria-live="polite">
        <MaterialIcon name="progress_activity" />
        <div>
          <strong>{progressCopy.label}</strong>
          <p>{progressCopy.description}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="server-recovery-panel" aria-labelledby="server-recovery-title">
      <MaterialIcon name="warning" />
      <div className="server-recovery-copy">
        <strong id="server-recovery-title">Server recovery required</strong>
        <p>{description}</p>
      </div>
      <div className="server-recovery-actions">
        <Button icon="restart_alt" onClick={onRecover}>
          Recover Server
        </Button>
        {showRestoreAction ? (
          <Button icon="history" variant="danger" onClick={onRestoreSharedSave}>
            Restore Last Shared Save
          </Button>
        ) : null}
      </div>
    </section>
  )
}

export default ServerRecoveryPanel
