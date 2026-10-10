// Prepare during the student's Start/Resume click so Web Audio has a user gesture.
// Audio is best-effort: playback failure must never interrupt exam monitoring.
export function createExamReturnAudio() {
  let context: AudioContext | null = null
  let buffer: AudioBuffer | null = null
  let source: AudioBufferSourceNode | null = null
  let preparation: Promise<void> | null = null
  let disposed = false
  let playPending = false
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  function close() {
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = null
    if (context && context.state !== 'closed') void context.close().catch(() => {})
  }
  function arm() {
    if (disposed || typeof AudioContext === 'undefined') return
    try {
      context ??= new AudioContext()
      const activeContext = context
      void activeContext.resume().catch(() => {})
      preparation ??= fetch('/sounds/uh-oh.wav')
        .then(response => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer() })
        .then(bytes => activeContext.decodeAudioData(bytes))
        .then(decoded => { if (!disposed) buffer = decoded })
        .catch(() => { preparation = null })
    } catch { /* Unsupported or blocked audio does not affect the exam. */ }
  }
  async function play(canPlay: () => boolean = () => true) {
    if (disposed || !context || !preparation || !canPlay()) return false
    if (source) return true
    if (playPending) return false
    playPending = true
    try {
      await preparation
      if (disposed || !buffer || !canPlay()) return false
      if (context.state !== 'running') await context.resume()
      if (disposed || source || !canPlay()) return false
      const next = context.createBufferSource()
      const gain = context.createGain()
      next.buffer = buffer
      gain.gain.value = 1
      next.connect(gain); gain.connect(context.destination)
      source = next
      next.onended = () => {
        next.disconnect(); gain.disconnect()
        if (source === next) source = null
        if (disposed) close()
      }
      next.start()
      return true
    } catch { source = null; return false }
    finally { playPending = false }
  }
  function stop() {
    try { source?.stop() } catch { /* The clip may have already ended. */ }
    source = null
  }
  function dispose() {
    disposed = true
    // Bound cleanup if a return alert is still playing when this page unmounts.
    if (source) closeTimer = setTimeout(() => { stop(); close() }, Math.min((buffer?.duration ?? 6) + 1, 8) * 1000)
    else close()
  }
  return { arm, play, stop, dispose }
}
