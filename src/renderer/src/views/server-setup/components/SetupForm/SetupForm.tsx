import { useState } from 'react'
import Button from '../../../../components/shared/Button/Button'
import Card from '../../../../components/shared/Card/Card'
import {
  DEFAULT_SETUP_FORM_STATE,
  type SetupFieldName,
  type SetupFormProps,
  type SetupFormState
} from './SetupForm.model'

function isValidPort(port: string): boolean {
  const portNumber = Number(port)

  return Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535
}

function getFieldError(formState: SetupFormState, fieldName: SetupFieldName): string | null {
  if (fieldName === 'name' && !formState.name.trim()) {
    return 'Server name is required.'
  }

  if (fieldName === 'port' && !isValidPort(formState.port)) {
    return 'Server port must be between 1 and 65535.'
  }

  if (fieldName === 'eulaAccepted' && !formState.eulaAccepted) {
    return 'Accept the Minecraft EULA to continue.'
  }

  return null
}

function isFormValid(formState: SetupFormState): boolean {
  return (
    getFieldError(formState, 'name') === null &&
    getFieldError(formState, 'port') === null &&
    getFieldError(formState, 'eulaAccepted') === null
  )
}

function SetupForm({
  disabled,
  onCancel,
  onRetryVersions,
  onSubmit,
  versions,
  versionsErrorMessage,
  versionsLoading
}: SetupFormProps): React.JSX.Element {
  const [formState, setFormState] = useState<SetupFormState>(DEFAULT_SETUP_FORM_STATE)
  const [touchedFields, setTouchedFields] = useState<Partial<Record<SetupFieldName, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const selectedMinecraftVersion = formState.minecraftVersion || versions[0]?.id || ''
  const selectedVersion = versions.find((version) => version.id === selectedMinecraftVersion)
  const formIsValid = isFormValid(formState) && Boolean(selectedVersion)
  const formIsDisabled = disabled || versionsLoading || Boolean(versionsErrorMessage)

  function updateField<FieldName extends SetupFieldName>(
    fieldName: FieldName,
    value: SetupFormState[FieldName]
  ): void {
    setFormState((currentFormState) => ({
      ...currentFormState,
      [fieldName]: value
    }))
  }

  function markFieldTouched(fieldName: SetupFieldName): void {
    setTouchedFields((currentTouchedFields) => ({
      ...currentTouchedFields,
      [fieldName]: true
    }))
  }

  function shouldShowFieldError(fieldName: SetupFieldName): boolean {
    return Boolean(touchedFields[fieldName] || submitAttempted)
  }

  function renderFieldError(fieldName: SetupFieldName): React.JSX.Element | null {
    const fieldError = getFieldError(formState, fieldName)

    if (!fieldError || !shouldShowFieldError(fieldName)) {
      return null
    }

    return <p className="setup-field-error">{fieldError}</p>
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setSubmitAttempted(true)

    if (!formIsValid) {
      return
    }

    if (!selectedVersion) {
      return
    }

    onSubmit({
      name: formState.name,
      minecraftVersion: selectedVersion.id,
      minecraftVersionMetadataUrl: selectedVersion.metadataUrl,
      port: Number(formState.port),
      eulaAccepted: formState.eulaAccepted
    })
  }

  return (
    <Card as="form" className="setup-form-card" padding="large" onSubmit={handleSubmit}>
      <section className="setup-form-section">
        <h3>Basic Info</h3>
        <div className="setup-form-grid">
          <label className="setup-field">
            <span>Server Name</span>
            <input
              className="chunk-field-control"
              type="text"
              value={formState.name}
              placeholder="e.g. Survival World"
              disabled={formIsDisabled}
              onBlur={() => markFieldTouched('name')}
              onChange={(event) => updateField('name', event.target.value)}
            />
            {renderFieldError('name')}
          </label>

          <label className="setup-field">
            <span>Server Type</span>
            <select className="chunk-field-control" value={formState.serverType} disabled>
              <option>Vanilla</option>
            </select>
          </label>

          <label className="setup-field">
            <span>Minecraft Version</span>
            <select
              className="chunk-field-control"
              value={selectedMinecraftVersion}
              disabled={formIsDisabled || versions.length === 0}
              onChange={(event) => updateField('minecraftVersion', event.target.value)}
            >
              <option value="">{versionsLoading ? 'Loading versions...' : 'Select a version'}</option>
              {versions.map((minecraftVersion) => (
                <option key={minecraftVersion.id} value={minecraftVersion.id}>
                  {minecraftVersion.id}
                </option>
              ))}
            </select>
            {versionsErrorMessage && (
              <div className="setup-version-error">
                <p>{versionsErrorMessage}</p>
                <Button variant="secondary" onClick={onRetryVersions}>
                  Retry
                </Button>
              </div>
            )}
          </label>
        </div>
      </section>

      <section className="setup-form-section">
        <h3>Network</h3>
        <div className="setup-form-grid">
          <label className="setup-field">
            <span>Server Port</span>
            <input
              className="chunk-field-control"
              type="number"
              inputMode="numeric"
              min="1"
              max="65535"
              value={formState.port}
              disabled={formIsDisabled}
              onBlur={() => markFieldTouched('port')}
              onChange={(event) => updateField('port', event.target.value)}
            />
            {renderFieldError('port')}
          </label>
        </div>
      </section>

      <label className="setup-checkbox-field">
        <input
          type="checkbox"
          checked={formState.eulaAccepted}
          disabled={formIsDisabled}
          onBlur={() => markFieldTouched('eulaAccepted')}
          onChange={(event) => updateField('eulaAccepted', event.target.checked)}
        />
        <span>I agree to the Minecraft EULA</span>
      </label>
      {renderFieldError('eulaAccepted')}

      <div className="setup-form-actions">
        <Button variant="secondary" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
        <Button type="submit" disabled={!formIsValid || formIsDisabled}>
          Create Server
        </Button>
      </div>
    </Card>
  )
}

export default SetupForm
