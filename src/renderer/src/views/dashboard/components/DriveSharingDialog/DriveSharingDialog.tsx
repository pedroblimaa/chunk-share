import './DriveSharingDialog.css'

import { useState, type FormEvent } from 'react'
import type { GoogleDriveMember, GoogleDriveSharingState } from '../../../../../../shared/drive-sharing.model'
import Button from '../../../../components/shared/Button/Button'
import Dialog from '../../../../components/shared/Dialog/Dialog'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import { getErrorMessage } from '../../../../utils/error-message'

interface DriveSharingDialogProps {
  sharingState: GoogleDriveSharingState
  onChange: (sharingState: GoogleDriveSharingState) => void
  onClose: () => void
}

function DriveSharingDialog({ sharingState, onChange, onClose }: DriveSharingDialogProps): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [isInviting, setIsInviting] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null)
  const [joinLink, setJoinLink] = useState<string | null>(null)
  const [copyLabel, setCopyLabel] = useState('Copy link')

  async function inviteMember(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setErrorMessage(null)
    setWarningMessage(null)
    setIsInviting(true)

    try {
      const inviteResult = await window.chunkShare.driveSharing.inviteMember(email)
      onChange(inviteResult.sharingState)
      setJoinLink(inviteResult.joinLink)
      setCopyLabel('Copy link')
      setEmail('')
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, 'Unable to invite this Google account.'))
    } finally {
      setIsInviting(false)
    }
  }

  async function copyJoinLink(): Promise<void> {
    if (!joinLink) {
      return
    }

    try {
      await navigator.clipboard.writeText(joinLink)
      setCopyLabel('Copied')
    } catch {
      setCopyLabel('Copy failed')
    }
  }

  async function confirmRevoke(): Promise<void> {
    if (!pendingRevokeId) {
      return
    }

    setErrorMessage(null)
    setWarningMessage(null)
    setIsRevoking(true)

    try {
      const member = sharingState.members.find(({ permissionId }) => permissionId === pendingRevokeId)
      const revokeResult = await window.chunkShare.driveSharing.revokeMember(pendingRevokeId)

      onChange(revokeResult.sharingState)
      if (revokeResult.revokedMemberWasHosting) {
        setWarningMessage(
          `${member?.displayName ?? 'This member'} was hosting. Tell them to stop. Their progress can no longer be saved.`
        )
      }
      setPendingRevokeId(null)
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, 'Unable to revoke access for this member.'))
    } finally {
      setIsRevoking(false)
    }
  }

  function renderMember(member: GoogleDriveMember): React.JSX.Element {
    const isPendingRevoke = pendingRevokeId === member.permissionId

    return (
      <li key={member.permissionId}>
        <div className="drive-sharing-member-details">
          <span className="drive-sharing-member-avatar">{getMemberInitials(member.displayName)}</span>
          <div className="drive-sharing-member">
            <strong>{member.displayName}</strong>
            <span>{getMemberRoleLabel(member.role)}</span>
          </div>
        </div>
        {isPendingRevoke ? (
          <div className="drive-sharing-row">
            <Button
              disabled={isRevoking}
              size="compact"
              variant="ghost"
              onClick={() => setPendingRevokeId(null)}
            >
              Cancel
            </Button>
            <Button
              className={isRevoking ? 'drive-sharing-button-loading' : ''}
              disabled={isRevoking}
              icon={isRevoking ? 'progress_activity' : undefined}
              size="compact"
              variant="danger"
              onClick={confirmRevoke}
            >
              {isRevoking ? 'Revoking...' : 'Confirm'}
            </Button>
          </div>
        ) : (
          <Button
            className="drive-sharing-revoke-button"
            disabled={isInviting || isRevoking}
            size="compact"
            variant="ghost"
            onClick={() => setPendingRevokeId(member.permissionId)}
          >
            Revoke
          </Button>
        )}
      </li>
    )
  }

  return (
    <Dialog
      showCloseButton
      className="drive-sharing-dialog"
      icon="group_add"
      isBusy={isInviting || isRevoking}
      title="Share Access"
      onClose={onClose}
    >
      <form className="drive-sharing-section" onSubmit={inviteMember}>
        <label htmlFor="drive-sharing-email">Invite via Email</label>
        <div className="drive-sharing-email-input">
          <MaterialIcon name="mail" />
          <input
            required
            id="drive-sharing-email"
            placeholder="Enter email address"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <Button
          fullWidth
          aria-busy={isInviting}
          className={isInviting ? 'drive-sharing-button-loading' : ''}
          disabled={isInviting || isRevoking}
          icon={isInviting ? 'progress_activity' : undefined}
          type="submit"
        >
          {isInviting ? 'Sending invitation...' : 'Send Invitation'}
        </Button>
      </form>

      {joinLink && (
        <div className="drive-sharing-section">
          <label htmlFor="drive-sharing-link">Quick Share Link</label>
          <div className="drive-sharing-link-row">
            <input id="drive-sharing-link" readOnly value={joinLink} />
            <Button icon="content_copy" size="compact" variant="secondary" onClick={copyJoinLink}>
              {copyLabel}
            </Button>
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="drive-sharing-error" role="alert">
          {errorMessage}
        </p>
      )}

      {warningMessage && (
        <p className="drive-sharing-error drive-sharing-warning" role="status">
          {warningMessage}
        </p>
      )}

      <div className="drive-sharing-members">
        <h4>Who has access</h4>
        {sharingState.members.length === 0 ? (
          <p>No friends have access yet.</p>
        ) : (
          <ul>{sharingState.members.map(renderMember)}</ul>
        )}
      </div>
    </Dialog>
  )
}

function getMemberInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function getMemberRoleLabel(role: GoogleDriveMember['role']): string {
  if (role === 'writer') {
    return 'Editor'
  }

  if (role === 'commenter') {
    return 'Commenter'
  }

  return 'Viewer'
}

export default DriveSharingDialog
