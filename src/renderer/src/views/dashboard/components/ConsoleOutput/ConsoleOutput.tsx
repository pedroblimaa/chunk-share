import './ConsoleOutput.css'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ConsoleLogLine } from '../../../../../../shared/dashboard'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'

interface ConsoleOutputProps {
  logs: ConsoleLogLine[]
}

type CopyStatus = 'idle' | 'copied' | 'failed'

function formatConsoleLogLine(log: ConsoleLogLine): string {
  return `[${log.timestamp}] [${log.source}]: ${log.message}`
}

function ConsoleOutput({ logs }: ConsoleOutputProps): React.JSX.Element {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const consoleLinesRef = useRef<HTMLDivElement | null>(null)
  const shouldStickToBottomRef = useRef(true)

  const consoleText = useMemo(() => logs.map(formatConsoleLogLine).join('\n'), [logs])

  useEffect(() => {
    if (copyStatus === 'idle') {
      return undefined
    }

    const resetCopyStatusTimer = window.setTimeout(() => {
      setCopyStatus('idle')
    }, 1600)

    return () => window.clearTimeout(resetCopyStatusTimer)
  }, [copyStatus])

  useLayoutEffect(() => {
    const consoleLines = consoleLinesRef.current

    if (consoleLines && shouldStickToBottomRef.current) {
      consoleLines.scrollTop = consoleLines.scrollHeight
    }
  }, [logs.length])

  function handleConsoleScroll(event: React.UIEvent<HTMLDivElement>): void {
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget

    shouldStickToBottomRef.current = scrollHeight - scrollTop - clientHeight <= 12
  }

  async function copyConsoleOutput(): Promise<void> {
    try {
      await navigator.clipboard.writeText(consoleText)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  const copyButtonLabel =
    copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy logs'
  const copyButtonStateClass = copyStatus === 'idle' ? '' : ` is-${copyStatus}`

  return (
    <section className="console-panel">
      <header>
        <h3>
          <MaterialIcon name="terminal" />
          <span>Console Output</span>
          <button
            aria-label={copyButtonLabel}
            className={`console-copy-button${copyButtonStateClass}`}
            title={copyButtonLabel}
            type="button"
            onClick={copyConsoleOutput}
          >
            <MaterialIcon
              name={
                copyStatus === 'copied' ? 'check' : copyStatus === 'failed' ? 'error_outline' : 'content_copy'
              }
            />
          </button>
        </h3>
      </header>

      <div
        ref={consoleLinesRef}
        className="console-lines"
        aria-label="Server console output"
        onScroll={handleConsoleScroll}
      >
        {logs.map((log) => (
          <p className={`console-line console-line-${log.tone}`} key={log.id}>
            <span>[{log.timestamp}]</span> <span>[{log.source}]:</span> {log.message}
          </p>
        ))}
      </div>
    </section>
  )
}

export default ConsoleOutput
