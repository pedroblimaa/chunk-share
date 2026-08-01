import './DriveJoinDialog.css'

import { useState, type FormEvent } from 'react'
import type { ServerDisplayState } from '../../../../../../shared/dashboard'
import Button from '../../../../components/shared/Button/Button'
import Dialog from '../../../../components/shared/Dialog/Dialog'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import { getErrorMessage } from '../../../../utils/error-message'

interface DriveJoinDialogProps {
  initialJoinLink: string
  onClose: () => void
  onJoined: (serverDisplayState: ServerDisplayState) => void
}

function DriveJoinDialog({ initialJoinLink, onClose, onJoined }: DriveJoinDialogProps): React.JSX.Element {
  const [joinLink, setJoinLink] = useState(initialJoinLink)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)

  async function joinWorld(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setErrorMessage(null)
    setIsJoining(true)

    try {
      onJoined(await window.chunkShare.driveJoin.joinWorld(joinLink))
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, 'Unable to join this shared world.'))
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <Dialog
      showCloseButton
      className="drive-join-dialog"
      icon="folder_shared"
      isBusy={isJoining}
      title="Join Shared World"
      onClose={onClose}
    >
      <p className="drive-join-description">
        Paste the link from your friend. When Google Drive opens, select both <strong>control.json</strong>{' '}
        and <strong>world.zip</strong>, then confirm the selection.
      </p>

      <form className="drive-join-form" onSubmit={joinWorld}>
        <label htmlFor="drive-join-link">Join link</label>
        <div className="drive-join-input">
          <MaterialIcon name="link" />
          <input
            required
            autoFocus
            id="drive-join-link"
            placeholder="chunkshare://join?..."
            value={joinLink}
            onChange={(event) => setJoinLink(event.target.value)}
          />
        </div>

        <Button
          fullWidth
          aria-busy={isJoining}
          className={isJoining ? 'drive-join-button-loading' : ''}
          disabled={isJoining}
          icon={isJoining ? 'progress_activity' : 'login'}
          type="submit"
        >
          {isJoining ? 'Waiting for Google Drive...' : 'Join World'}
        </Button>
      </form>

      {errorMessage && (
        <p className="drive-join-error" role="alert">
          {errorMessage}
        </p>
      )}
    </Dialog>
  )
}

export default DriveJoinDialog
