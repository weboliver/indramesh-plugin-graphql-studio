// Phase 304 (GQL-05/D-14, D-16): pure deferred-load lifecycle for the studio's
// interactive editor payload.
//
// The plugin's heavy editor is fetched and its workers started ONLY on explicit
// use. This module owns the observable lifecycle the light shell renders:
//
//   launcher -> loading -> ready
//                    \-> failed (local, scoped reason)
//
// `ready` means an actual worker protocol reply arrived within the bounded
// timeout -- never constructor success and never a fabricated progress value. A
// constructor error, a rejected protocol call or a timeout all enter the local
// `failed` state with the `worker_blocked` reason. The machine performs no I/O
// itself: the caller hands it the bounded probe, and the timers are injectable
// so the whole lifecycle is exercisable with small fakes under plain
// `node --test` (no DOM, no browser).
//
// A generation token makes the lifecycle dedupe-safe: a second `beginLoad()`
// while a load is active is a no-op, and `reset()` invalidates any in-flight
// completion so a late promise cannot resurrect a half-initialized editor after
// the shell has closed it.

export const WORKER_READY_TIMEOUT_MS = 10000

export const STUDIO_HEAVY_STATES = Object.freeze({
  LAUNCHER: 'launcher',
  LOADING: 'loading',
  READY: 'ready',
  FAILED: 'failed',
})

export const STUDIO_HEAVY_FAILURE_REASONS = Object.freeze({
  MODULE_LOAD_FAILED: 'module_load_failed',
  STYLES_REFUSED: 'styles_refused',
  WORKER_BLOCKED: 'worker_blocked',
})

// Reasons that map to the UI-SPEC "worker unavailable" copy rather than the
// generic load-failure or style-refusal copy.
export function isWorkerBlockedReason(reason) {
  return reason === STUDIO_HEAVY_FAILURE_REASONS.WORKER_BLOCKED
}

// Granular probe outcomes (diagnostics only): the machine normalizes any
// non-ok probe result to the single `worker_blocked` reason the UI renders.
export const WORKER_PROBE_REASONS = Object.freeze({
  WORKER_CONSTRUCTION_FAILED: 'worker_construction_failed',
  WORKER_PROTOCOL_UNAVAILABLE: 'worker_protocol_unavailable',
  WORKER_TIMEOUT: 'worker_timeout',
  WORKER_FAILURE: 'worker_failure',
})

const BUSY_STATES = new Set([STUDIO_HEAVY_STATES.LOADING])

function messageOf(error) {
  return error?.message ? String(error.message) : String(error)
}

/**
 * Bound an operation to `timeoutMs`. The operation resolves with a result
 * object `{ ok, reason?, error? }` (or any value, treated as `{ ok: true }`).
 * Rejections and timeouts are normalized to the local worker-failure shape;
 * this helper never throws and never leaves the bound timer armed.
 */
export function createBoundedReadiness({
  timeoutMs = WORKER_READY_TIMEOUT_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  return function waitFor(operation) {
    return new Promise((resolve) => {
      let settled = false
      let timer = null
      const finish = (result) => {
        if (settled) return
        settled = true
        if (timer !== null) cancel(timer)
        resolve(result)
      }
      timer = schedule(
        () => finish({ ok: false, reason: WORKER_PROBE_REASONS.WORKER_TIMEOUT }),
        timeoutMs,
      )
      Promise.resolve()
        .then(() => operation())
        .then(
          (result) =>
            finish(
              result && typeof result === 'object' && 'ok' in result ? result : { ok: true },
            ),
          (error) =>
            finish({
              ok: false,
              reason: WORKER_PROBE_REASONS.WORKER_FAILURE,
              error: messageOf(error),
            }),
        )
    })
  }
}

/**
 * A bounded worker-protocol probe. `createWorker` is injected (the heavy entry
 * passes a factory backed by the pinned editor worker client), so under plain
 * `node --test` the whole readiness path runs against a small fake. Readiness is
 * an actual protocol reply (`client.proxy.$ping()`), never constructor success;
 * a construction throw, a protocol rejection or the bounded timeout all resolve
 * to a local failure result. The probe never creates a synchronous fallback.
 */
export function createWorkerReadinessProbe({
  createWorker,
  label = 'editor',
  timeoutMs = WORKER_READY_TIMEOUT_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  if (typeof createWorker !== 'function') {
    throw new TypeError('createWorkerReadinessProbe requires a createWorker function')
  }
  return function probe() {
    return new Promise((resolve) => {
      let settled = false
      let timer = null
      let client = null
      const finish = (result) => {
        if (settled) return
        settled = true
        if (timer !== null) cancel(timer)
        try {
          client?.dispose?.()
        } catch {
          // Worker teardown is best-effort; a failed worker must not mask the
          // local failure result.
        }
        resolve(result)
      }
      try {
        client = createWorker({ label })
      } catch (error) {
        finish({
          ok: false,
          reason: WORKER_PROBE_REASONS.WORKER_CONSTRUCTION_FAILED,
          error: messageOf(error),
        })
        return
      }
      if (!client || typeof client.proxy?.$ping !== 'function') {
        finish({ ok: false, reason: WORKER_PROBE_REASONS.WORKER_PROTOCOL_UNAVAILABLE })
        return
      }
      timer = schedule(
        () => finish({ ok: false, reason: WORKER_PROBE_REASONS.WORKER_TIMEOUT }),
        timeoutMs,
      )
      Promise.resolve()
        .then(() => client.proxy.$ping())
        .then(
          () => finish({ ok: true }),
          (error) =>
            finish({
              ok: false,
              reason: WORKER_PROBE_REASONS.WORKER_FAILURE,
              error: messageOf(error),
            }),
        )
    })
  }
}

/**
 * The pure studio heavy-editor lifecycle. `onTransition({ state, failure })`
 * fires on every observable change; `subscribe` supports React-ish consumers.
 *
 * Failure reasons (exactly the three the UI-SPEC E7 error row distinguishes):
 *   * `module_load_failed` — the deferred payload could not be fetched/imported;
 *   * `styles_refused`     — the scoped inline styles were refused (fail closed);
 *   * `worker_blocked`     — the editor worker could not reply in time / at all.
 */
export function createStudioHeavyStateMachine({
  timeoutMs = WORKER_READY_TIMEOUT_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
  onTransition,
} = {}) {
  const readiness = createBoundedReadiness({ timeoutMs, schedule, cancel })
  const listeners = new Set()

  let state = STUDIO_HEAVY_STATES.LAUNCHER
  let failure = null
  let generation = 0
  // A monotonic token: incremented on every load start, reset, and awaited
  // probe. A completion whose token is stale is dropped instead of mutating
  // state (parallel/interrupted loads and post-close completions).
  let pendingToken = 0

  function getSnapshot() {
    return { state, failure }
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

  function isActive() {
    return BUSY_STATES.has(state) || state === STUDIO_HEAVY_STATES.READY
  }

  function beginLoad() {
    if (isActive()) return { started: false, generation }
    generation += 1
    pendingToken += 1
    setState(STUDIO_HEAVY_STATES.LOADING, null)
    return { started: true, generation }
  }

  function moduleLoadFailed(candidate, reason = STUDIO_HEAVY_FAILURE_REASONS.MODULE_LOAD_FAILED) {
    if (!isCurrent(candidate)) return getSnapshot()
    setState(STUDIO_HEAVY_STATES.FAILED, reason)
    return getSnapshot()
  }

  function stylesRefused(candidate, reason = STUDIO_HEAVY_FAILURE_REASONS.STYLES_REFUSED) {
    if (!isCurrent(candidate)) return getSnapshot()
    setState(STUDIO_HEAVY_STATES.FAILED, reason)
    return getSnapshot()
  }

  // Run the bounded probe and settle the lifecycle. A stale completion
  // (superseded by reset/close or a parallel start) is ignored. Any non-ok probe
  // result becomes the single `worker_blocked` reason the UI renders.
  async function awaitWorkerReadiness(candidate, operation) {
    if (!isCurrent(candidate) || state !== STUDIO_HEAVY_STATES.LOADING) {
      return getSnapshot()
    }
    const token = ++pendingToken
    const result = await readiness(operation)
    if (token !== pendingToken || !isCurrent(candidate)) return getSnapshot()
    if (result.ok) setState(STUDIO_HEAVY_STATES.READY, null)
    else setState(STUDIO_HEAVY_STATES.FAILED, STUDIO_HEAVY_FAILURE_REASONS.WORKER_BLOCKED)
    return getSnapshot()
  }

  function workerBlocked(candidate, reason = STUDIO_HEAVY_FAILURE_REASONS.WORKER_BLOCKED) {
    if (!isCurrent(candidate)) return getSnapshot()
    setState(STUDIO_HEAVY_STATES.FAILED, reason)
    return getSnapshot()
  }

  // Close: bump the generation and token so any in-flight load or probe
  // completes into the void. Never resurrects a capability.
  function reset() {
    generation += 1
    pendingToken += 1
    setState(STUDIO_HEAVY_STATES.LAUNCHER, null)
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
    getGeneration: () => generation,
    isCurrent,
    isActive,
    beginLoad,
    moduleLoadFailed,
    stylesRefused,
    awaitWorkerReadiness,
    workerBlocked,
    reset,
    subscribe,
  }
}