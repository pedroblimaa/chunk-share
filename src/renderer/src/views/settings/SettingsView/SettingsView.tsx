import './SettingsView.css'

import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import Badge from '../../../components/shared/Badge/Badge'
import Button from '../../../components/shared/Button/Button'
import Card from '../../../components/shared/Card/Card'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import TopBar from '../../dashboard/components/TopBar/TopBar'
import StorageModeSettingsCard from '../components/StorageModeSettingsCard/StorageModeSettingsCard'
import StorageProviderSettingsProvider from '../StorageProviderSettingsProvider/StorageProviderSettingsProvider'
import type { SettingsViewProps } from './SettingsView.model'

const SINGLE_SERVER_DISABLED_REASON = 'Only one server is supported in the MVP.'

function SettingsView({
  serverDisplayState,
  onCreateServer,
  onNavigateToServers,
  onOpenSettings,
  onSignOut
}: SettingsViewProps): React.JSX.Element {
  const serverIsConfigured = serverDisplayState.serverStatus !== 'not-configured'
  const signedInUser = serverDisplayState.signedInUser

  return (
    <div className="dashboard-screen settings-screen">
      <AppSidebar
        activeItem="settings"
        addServerDisabled={serverIsConfigured}
        addServerTitle={serverIsConfigured ? SINGLE_SERVER_DISABLED_REASON : undefined}
        onAddServer={serverIsConfigured ? undefined : onCreateServer}
        onOpenServers={onNavigateToServers}
        onOpenSettings={onOpenSettings}
      />

      <div className="dashboard-main">
        <TopBar
          user={serverDisplayState.signedInUser}
          breadcrumbs={[{ label: 'Settings' }]}
          createInstanceDisabled={serverIsConfigured}
          createInstanceTitle={serverIsConfigured ? SINGLE_SERVER_DISABLED_REASON : undefined}
          onCreateInstance={serverIsConfigured ? undefined : onCreateServer}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
        />

        <main className="dashboard-content settings-content">
          <section className="settings-grid" aria-label="Settings">
            <Card as="article" className="settings-account-card">
              <div className="settings-card-heading">
                <MaterialIcon name="account_circle" />
                <h2>Google Account</h2>
              </div>

              <div className="settings-account-summary">
                <div
                  className={`settings-account-avatar${signedInUser?.avatarUrl ? ' has-image' : ''}`}
                >
                  {signedInUser?.avatarUrl ? (
                    <img src={signedInUser.avatarUrl} alt="" aria-hidden="true" />
                  ) : (
                    (signedInUser?.avatarInitials ?? 'CS')
                  )}
                </div>
                <div>
                  <strong>{signedInUser?.name ?? 'ChunkShare user'}</strong>
                  <span>{signedInUser?.email ?? 'No Google account connected'}</span>
                </div>
              </div>

              <div className="settings-status-row">
                <span>Authentication</span>
                <div className="settings-account-actions">
                  <Badge tone="active" icon="check_circle" iconFilled>
                    Connected
                  </Badge>
                  <Button
                    className="settings-sign-out-button"
                    icon="logout"
                    size="compact"
                    variant="ghost"
                    onClick={onSignOut}
                  >
                    Sign out
                  </Button>
                </div>
              </div>
            </Card>

            <StorageProviderSettingsProvider>
              <StorageModeSettingsCard />
            </StorageProviderSettingsProvider>
          </section>
        </main>
      </div>
    </div>
  )
}

export default SettingsView
