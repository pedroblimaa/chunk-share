import './JavaRuntimeSelector.css'

import { useId } from 'react'
import type { JavaConfig } from '../../../../../shared/domain'
import type { JavaRuntimeStatus } from '../../../../../shared/java-runtime'
import Button from '../Button/Button'
import MaterialIcon from '../MaterialIcon/MaterialIcon'

interface JavaRuntimeSelectorProps {
  config: JavaConfig
  disabled?: boolean
  isLoading: boolean
  minimal?: boolean
  status: JavaRuntimeStatus | null
  onBrowse: () => void
  onChange: (config: JavaConfig) => void
  onRescan: () => void
}

function JavaRuntimeSelector({
  config,
  disabled = false,
  isLoading,
  minimal = false,
  status,
  onBrowse,
  onChange,
  onRescan
}: JavaRuntimeSelectorProps): React.JSX.Element {
  const selectLabelId = useId()
  const automatic = config.mode === 'system'
  const selectedPath = config.executablePath ?? ''
  const hasSelectedCandidate = status?.candidates.some(
    (candidate) => candidate.executablePath === selectedPath
  )
  const selectedRuntime =
    status?.selectedRuntime?.executablePath === selectedPath ? status.selectedRuntime : null
  const message = isLoading
    ? null
    : (status?.errorMessage ??
      (automatic && status?.selectedRuntime
        ? `Using Java ${status.selectedRuntime.majorVersion} (${status.selectedRuntime.executablePath})`
        : null))

  return (
    <div className={`java-runtime-selector${minimal ? ' is-minimal' : ''}`}>
      <label className="java-runtime-automatic">
        <input
          className="chunk-checkbox"
          type="checkbox"
          checked={automatic}
          disabled={disabled || isLoading}
          onChange={(event) =>
            onChange({
              mode: event.target.checked ? 'system' : 'custom',
              executablePath: event.target.checked
                ? null
                : (status?.selectedRuntime?.executablePath ?? status?.candidates[0]?.executablePath ?? '')
            })
          }
        />
        <span>Select Java automatically</span>
      </label>

      {automatic && !minimal ? (
        <div className="java-runtime-actions is-automatic">
          <Button size="compact" variant="minimal" disabled={disabled || isLoading} onClick={onRescan}>
            Rescan
          </Button>
        </div>
      ) : !automatic ? (
        <div className="java-runtime-manual">
          {!minimal && <span id={selectLabelId}>Java executable</span>}
          <div className="java-runtime-manual-row">
            <span className="java-runtime-select-control">
              <select
                className="chunk-field-control"
                value={selectedPath}
                disabled={disabled}
                aria-label={minimal ? 'Java executable' : undefined}
                aria-labelledby={minimal ? undefined : selectLabelId}
                aria-invalid={Boolean(status?.errorMessage)}
                title={status?.errorMessage ?? undefined}
                onChange={(event) => {
                  if (event.target.value === '__browse__') {
                    onBrowse()
                    return
                  }

                  onChange({ mode: 'custom', executablePath: event.target.value })
                }}
              >
                <option value="" disabled>
                  Select a Java installation
                </option>
                {selectedPath && !hasSelectedCandidate && (
                  <option value={selectedPath}>
                    {selectedRuntime
                      ? `Java ${selectedRuntime.majorVersion} (${selectedPath})`
                      : selectedPath}
                  </option>
                )}
                {status?.candidates.map((candidate) => (
                  <option key={candidate.executablePath} value={candidate.executablePath}>
                    Java {candidate.majorVersion} ({candidate.executablePath})
                  </option>
                ))}
                {minimal && <option value="__browse__">Browse...</option>}
              </select>
              <MaterialIcon
                className={isLoading ? 'java-runtime-loading-icon' : 'java-runtime-terminal-icon'}
                name={isLoading ? 'progress_activity' : 'terminal'}
              />
              <MaterialIcon className="java-runtime-expand-icon" name="expand_more" />
            </span>
            {!minimal && (
              <div className="java-runtime-actions">
                <Button size="compact" variant="minimal" disabled={disabled} onClick={onBrowse}>
                  Browse
                </Button>
                <Button size="compact" variant="minimal" disabled={disabled || isLoading} onClick={onRescan}>
                  Rescan
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!minimal && message && (
        <p className={status?.errorMessage ? 'java-runtime-message is-error' : 'java-runtime-message'}>
          {message}
        </p>
      )}
    </div>
  )
}

export default JavaRuntimeSelector
