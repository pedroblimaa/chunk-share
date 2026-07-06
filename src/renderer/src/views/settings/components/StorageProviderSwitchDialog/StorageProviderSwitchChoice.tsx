import Button from '../../../../components/shared/Button/Button'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import { formatNullableDate } from '../../settings-formatters'
import { storageProviderHasData } from '../../settings-helpers'
import { StorageSettingsOperation } from '../../settings.model'
import {
  StorageProviderSwitchScenario,
  type StorageProviderSwitchChoiceProps
} from './StorageProviderSwitchDialog.model'
import { getStorageProviderSwitchChoiceLabels } from './storage-provider-switch-labels'
import {
  getCopyActionLabel,
  getStorageProviderIcon,
  getStorageProviderLabel,
  getStorageProviderSwitchScenario
} from './storage-provider-switch-helpers'

function StorageProviderSwitchChoice({
  operation,
  preview,
  progress,
  onActivateTarget,
  onCancel,
  onCopyCurrentData
}: StorageProviderSwitchChoiceProps): React.JSX.Element {
  const targetLabel = getStorageProviderLabel(preview.target.provider)
  const scenario = getStorageProviderSwitchScenario(preview)
  const choiceLabels = getStorageProviderSwitchChoiceLabels(scenario, targetLabel)
  const canCopy = storageProviderHasData(preview.source)
  const copyReplacesTarget = scenario === StorageProviderSwitchScenario.BothHaveData
  const copyIsRecommended = scenario === StorageProviderSwitchScenario.SourceOnly
  const copyIsRunning = operation === StorageSettingsOperation.CopyProviderData
  const isBusy = copyIsRunning || operation === StorageSettingsOperation.SwitchProvider
  const activateTargetButtonLabel =
    operation === StorageSettingsOperation.SwitchProvider ? 'Switching...' : choiceLabels.activateLabel

  function renderCopyCurrentDataButton(): React.JSX.Element | false {
    return (
      canCopy && (
        <Button
          aria-busy={copyIsRunning}
          className={copyIsRunning ? 'settings-provider-copy-loading' : undefined}
          disabled={isBusy}
          fullWidth
          icon={copyIsRunning ? 'progress_activity' : 'content_copy'}
          variant={copyReplacesTarget ? 'danger' : undefined}
          onClick={onCopyCurrentData}
        >
          {getCopyActionLabel(operation, progress, choiceLabels.copyLabel)}
        </Button>
      )
    )
  }

  function renderActivateTargetButton(): React.JSX.Element {
    return (
      <Button
        disabled={isBusy}
        fullWidth
        icon="swap_horiz"
        variant={copyIsRecommended ? 'secondary' : undefined}
        onClick={onActivateTarget}
      >
        {activateTargetButtonLabel}
      </Button>
    )
  }

  function renderPrimaryAction(): React.JSX.Element | false {
    return copyIsRecommended ? renderCopyCurrentDataButton() : renderActivateTargetButton()
  }

  function renderSecondaryAction(): React.JSX.Element | false {
    return copyIsRecommended ? renderActivateTargetButton() : renderCopyCurrentDataButton()
  }

  return (
    <>
      <div>
        <strong>{choiceLabels.title}</strong>
        <span>{choiceLabels.description}</span>
      </div>
      <div className="settings-provider-switch-comparison">
        <StorageProviderDataSummary summary={preview.source} />
        <div className="settings-provider-switch-direction" aria-hidden="true">
          <MaterialIcon name="arrow_forward" />
        </div>
        <StorageProviderDataSummary summary={preview.target} />
      </div>
      {copyReplacesTarget && (
        <div
          aria-hidden={copyIsRunning}
          className={`settings-provider-switch-warning${copyIsRunning ? ' is-hiding' : ''}`}
        >
          <MaterialIcon name="warning" />
          <span>{targetLabel} save history will be permanently replaced.</span>
        </div>
      )}
      <div className="settings-provider-switch-actions">
        {renderPrimaryAction()}
        {renderSecondaryAction()}
        <Button disabled={isBusy} fullWidth variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  )
}

interface StorageProviderDataSummaryProps {
  summary: StorageProviderSwitchChoiceProps['preview']['source']
}

function StorageProviderDataSummary({ summary }: StorageProviderDataSummaryProps): React.JSX.Element {
  return (
    <div className="settings-provider-switch-summary">
      <div className="settings-provider-switch-summary-heading">
        <MaterialIcon name={getStorageProviderIcon(summary.provider)} />
        <strong>{getStorageProviderLabel(summary.provider)}</strong>
      </div>
      <span>{getLatestSaveSummaryLabel(summary)}</span>
      <span>
        {summary.versionCount} retained {summary.versionCount === 1 ? 'version' : 'versions'}
      </span>
    </div>
  )
}

function getLatestSaveSummaryLabel({
  latestSaveRecordedAt,
  latestSaveVersion
}: StorageProviderDataSummaryProps['summary']): string {
  if (latestSaveVersion === null) {
    return 'No latest save'
  }

  return `Latest save v${latestSaveVersion} - ${formatNullableDate(latestSaveRecordedAt, 'Not available')}`
}

export default StorageProviderSwitchChoice
