import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

const PYODIDE_VERSION = '0.26.4'
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

const DEFAULT_CODE = `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print("fib(10) =", fib(10))
`

let pyodideSingleton = null
let pyodideLoadPromise = null

async function getPyodide() {
  if (pyodideSingleton) return pyodideSingleton
  if (!pyodideLoadPromise) {
    pyodideLoadPromise = (async () => {
      const { loadPyodide } = await import(
        /* @vite-ignore */ `${PYODIDE_INDEX}pyodide.mjs`
      )
      return loadPyodide({ indexURL: PYODIDE_INDEX })
    })()
  }
  pyodideSingleton = await pyodideLoadPromise
  return pyodideSingleton
}

function WhiteboardPanel({ onFirstStroke }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef({ x: 0, y: 0 })
  const colorRef = useRef('#cbd5e1')
  const strokeNotifiedRef = useRef(false)

  const layout = useCallback(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const { width, height } = wrap.getBoundingClientRect()
    if (width < 8 || height < 8) return
    const dpr = window.devicePixelRatio || 1
    const prev = canvas.toDataURL()
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, width, height)
    const img = new Image()
    img.onload = () => ctx.drawImage(img, 0, 0, width, height)
    img.src = prev
  }, [])

  useEffect(() => {
    layout()
    const ro = new ResizeObserver(() => layout())
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [layout])

  const clientPoint = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const t = e.touches?.[0]
    const cx = t ? t.clientX : e.clientX
    const cy = t ? t.clientY : e.clientY
    return { x: cx - rect.left, y: cy - rect.top }
  }

  const start = (e) => {
    e.preventDefault()
    drawingRef.current = true
    lastRef.current = clientPoint(e)
    if (onFirstStroke && !strokeNotifiedRef.current) {
      strokeNotifiedRef.current = true
      onFirstStroke()
    }
  }

  const move = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const p = clientPoint(e)
    ctx.strokeStyle = colorRef.current
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
  }

  const end = () => {
    drawingRef.current = false
  }

  const clear = () => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const { width, height } = wrap.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, width, height)
  }

  return (
    <section className="flex min-h-[200px] flex-1 flex-col rounded-xl border border-slate-800 bg-slate-950/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">Whiteboard</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Pen
            <input
              type="color"
              defaultValue="#cbd5e1"
              className="h-7 w-10 cursor-pointer rounded border border-slate-700 bg-slate-900"
              onChange={(e) => {
                colorRef.current = e.target.value
              }}
            />
          </label>
          <button
            type="button"
            onClick={clear}
            className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Clear
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="relative min-h-[220px] flex-1 touch-none">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full cursor-crosshair"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
    </section>
  )
}

/**
 * Code runner (Python in-browser via Pyodide) + drawing canvas for technical interview rounds.
 * Ref exposes getSnapshot() for end-of-session evaluation payload.
 */
const TechnicalRoundWorkspace = forwardRef(function TechnicalRoundWorkspace(_props, ref) {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [output, setOutput] = useState('')
  const [runError, setRunError] = useState('')
  const [loadingRuntime, setLoadingRuntime] = useState(false)
  const [running, setRunning] = useState(false)
  const [whiteboardUsed, setWhiteboardUsed] = useState(false)

  useImperativeHandle(
    ref,
    () => ({
      getSnapshot: () => ({
        code_snapshot: code,
        whiteboard_was_used: whiteboardUsed,
      }),
    }),
    [code, whiteboardUsed],
  )

  const runCode = async () => {
    setRunError('')
    setOutput('')
    setRunning(true)
    setLoadingRuntime(true)
    try {
      const pyodide = await getPyodide()
      setLoadingRuntime(false)
      const stdout = []
      const stderr = []
      pyodide.setStdout({ batched: (s) => stdout.push(s) })
      pyodide.setStderr({ batched: (s) => stderr.push(s) })
      await pyodide.runPythonAsync(code)
      const text = [stdout.join(''), stderr.join('')].filter(Boolean).join('\n')
      setOutput(text || '(no output)')
    } catch (e) {
      setRunError(e?.message || String(e))
    } finally {
      setRunning(false)
      setLoadingRuntime(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:min-h-[480px] lg:max-h-[calc(100vh-8rem)]">
      <section className="flex min-h-[240px] flex-[1.1] flex-col rounded-xl border border-slate-800 bg-slate-950/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">Python</h3>
          <button
            type="button"
            disabled={running}
            onClick={runCode}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {loadingRuntime ? 'Loading runtime…' : running ? 'Running…' : 'Run'}
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="min-h-[160px] flex-1 resize-y border-0 bg-slate-950 px-3 py-2 font-mono text-sm leading-relaxed text-slate-200 outline-none focus:ring-0"
          placeholder="Write Python here…"
        />
        <div className="border-t border-slate-800 px-3 py-2">
          <p className="text-[11px] text-slate-500">
            Runs in your browser (Pyodide). Explain your approach to the interviewer by voice as you code.
          </p>
          {runError && (
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-rose-300">{runError}</pre>
          )}
          {output && !runError && (
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-emerald-200/90">{output}</pre>
          )}
        </div>
      </section>

      <WhiteboardPanel onFirstStroke={() => setWhiteboardUsed(true)} />
    </div>
  )
})

export default TechnicalRoundWorkspace
