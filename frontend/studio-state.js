// Phase 304 (GQL-05): the pure page load / live-run lifecycle for the
// graphql-studio page.
//
// The studio page fetches the Core saved-query list and runs live queries. This
// module owns the observable lifecycle so the page stays idempotent on repeat
// navigation:
//
//   idle -> loading -> ready        (list loaded)
//            \-> failed (local, scoped reason)
//   ready -> running -> ready       (one live run in flight at a time)
//
// Two guarantees the plan requires (GQL-05 idempotency):
//   * a SINGLE active mount/load -- a second `beginLoad()` while a load is
//     already in flight is a no-op, so navigating back and forth never starts
//     overlapping list loads; and
//   * resources are RELEASED exactly once on `dispose()` (unmount / navigation
//     away). A generation token invalidates any in-flight completion, so a late
//     promise cannot resurrect a page after it was disposed.
//
// The module performs no I/O itself: the page hands it a request and registers
// its own disposer (e.g. an AbortController), and the machine only tracks the
// lifecycle. It is therefore exercisable with plain `node --test` (no DOM, no
// browser, no React).

export const STUDIO_STATES = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  FAILED: 'failed',
})

export const STUDIO_FAILURE_REASONS = Object.freeze({
  LIST_LOAD_FAILED: 'list_load_failed',
})

export function createStudioStateMachine({ onTransition } = {}) {
  const listeners = new Set()
  const resources = new Set()

  let state = STUDIO_STATES.IDLE
  let failure = null
  let generation = 0
  let running = false
  let runGeneration = 0

  function getSnapshot() {
    return { state, failure, generation, running }
  }

  function notify() {
    const snapshot = getSnapshot()
    listeners.forEach((listener) => {
      try {
        listener(snapshot)
      } catch {
        // A listener must never break the lifecycle machine.
      }
    })
    if (typeof onTransition === 'function') onTransition(snapshot)
  }

  function setState(next, nextFailure = null) {
    state = next
    failure = nextFailure
    notify()
  }

  function isCurrent(candidate) {
    return candidate === generation
  }

  // Start the single active list load. Returns `{ started: false }` while a load
  // is already in flight (the dedupe that keeps navigation idempotent).
  function beginLoad() {
    if (state === STUDIO_STATES.LOADING) return { started: false, generation }
    generation += 1
    setState(STUDIO_STATES.LOADING, null)
    return { started: true, generation }
  }

  function loadSucceeded(candidate) {
    if (!isCurrent(candidate) || state !== STUDIO_STATES.LOADING) return getSnapshot()
    setState(STUDIO_STATES.READY, null)
    return getSnapshot()
  }

  function loadFailed(candidate, reason = STUDIO_FAILURE_REASONS.LIST_LOAD_FAILED) {
    if (!isCurrent(candidate)) return getSnapshot()
    setState(STUDIO_STATES.FAILED, reason)
    return getSnapshot()
  }

  // A live run is only startable from `ready`, and only one runs at a time.
  function beginRun() {
    if (running || state !== STUDIO_STATES.READY) {
      return { started: false, runGeneration }
    }
    running = true
    runGeneration += 1
    notify()
    return { started: true, runGeneration }
  }

  function runFinished(candidate) {
    if (candidate !== runGeneration) return getSnapshot()
    running = false
    notify()
    return getSnapshot()
  }

  // Track a resource released on dispose (e.g. `() => controller.abort()`).
  // Returns an idempotent release function so callers can also release it early
  // (a settled request) without double-releasing.
  function trackResource(dispose) {
    if (typeof dispose !== 'function') return null
    let done = false
    const release = () => {
      if (done) return
      done = true
      resources.delete(release)
      try {
        dispose()
      } catch {
        // A failing disposer must not stop the others from releasing.
      }
    }
    resources.add(release)
    return release
  }

  function releaseResources() {
    // Snapshot first: each release removes itself from the set.
    ;[...resources].forEach((release) => release())
  }

  // Unmount / navigation away: advance past any in-flight work, release tracked
  // resources exactly once, and return to idle. Idempotent.
  function dispose() {
    generation += 1
    runGeneration += 1
    running = false
    releaseResources()
    setState(STUDIO_STATES.IDLE, null)
    return getSnapshot()
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    getState: () => state,
    getFailure: () => failure,
    getSnapshot,
    isRunning: () => running,
    isCurrent,
    beginLoad,
    loadSucceeded,
    loadFailed,
    beginRun,
    runFinished,
    trackResource,
    releaseResources,
    dispose,
    reset: dispose,
    subscribe,
  }
}