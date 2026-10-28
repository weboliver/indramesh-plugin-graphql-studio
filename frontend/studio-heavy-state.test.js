import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  STUDIO_HEAVY_FAILURE_REASONS,
  STUDIO_HEAVY_STATES,
  WORKER_PROBE_REASONS,
  WORKER_READY_TIMEOUT_MS,
  createBoundedReadiness,
  createStudioHeavyStateMachine,
  createWorkerReadinessProbe,
  isWorkerBlockedReason,
} from './studio-heavy-state.js'
import {
  EditorVendorShapeError,
  WorkerFallbackRefusedError,
  assertPinnedVendorShape,
  installFailClosedWorkerAdapter,
} from './monaco-failclosed.js'

// A deterministic timer fake (no DOM, no browser). `setTimeout`/`clearTimeout`
// are injected into the machine/readiness helper so the 10-second bound is
// exercised without real waiting.
function createFakeTimers() {
  let now = 0
  let nextId = 1
  const timers = new Map()
  return {
    setTimeout(handler, delay = 0) {
      const id = nextId++
      timers.set(id, { handler, at: now + delay })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    advance(ms) {
      now += ms
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((a, b) => a[1].at - b[1].at)
      due.forEach(([id, timer]) => {
        timers.delete(id)
        timer.handler()
      })
    },
  }
}

// Yield to the event loop so the probe's pending promise chain settles. A
// macrotask (setTimeout) is used rather than a Node-only global so the suite
// lints under the browser-globals ruleset.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('studio heavy-editor load lifecycle', () => {
  it('starts in the launcher state and dedupes a concurrent second load start', () => {
    const machine = createStudioHeavyStateMachine()
    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.LAUNCHER)

    const first = machine.beginLoad()
    const second = machine.beginLoad()

    assert.equal(first.started, true)
    assert.equal(second.started, false)
    assert.equal(second.generation, first.generation)
    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.LOADING)
  })

  it('reaches ready only after an actual worker protocol reply', async () => {
    const machine = createStudioHeavyStateMachine()
    const { generation } = machine.beginLoad()

    let settleProbe
    const pending = machine.awaitWorkerReadiness(
      generation,
      () => new Promise((resolve) => { settleProbe = resolve }),
    )
    await flush()

    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.LOADING)
    assert.equal(machine.getFailure(), null)

    settleProbe({ ok: true })
    const snapshot = await pending

    assert.equal(snapshot.state, STUDIO_HEAVY_STATES.READY)
    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.READY)
  })

  it('keeps loading until the bounded worker reply arrives', async () => {
    const timers = createFakeTimers()
    const machine = createStudioHeavyStateMachine({
      timeoutMs: WORKER_READY_TIMEOUT_MS,
      schedule: timers.setTimeout,
      cancel: timers.clearTimeout,
    })
    const { generation } = machine.beginLoad()

    let settleProbe
    const pending = machine.awaitWorkerReadiness(
      generation,
      () => new Promise((resolve) => { settleProbe = resolve }),
    )
    await flush()

    timers.advance(WORKER_READY_TIMEOUT_MS - 1)
    await flush()
    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.LOADING)

    settleProbe({ ok: true })
    const snapshot = await pending
    assert.equal(snapshot.state, STUDIO_HEAVY_STATES.READY)
  })

  it('fails locally as worker_blocked once the 10-second bound passes', async () => {
    const timers = createFakeTimers()
    const machine = createStudioHeavyStateMachine({
      timeoutMs: WORKER_READY_TIMEOUT_MS,
      schedule: timers.setTimeout,
      cancel: timers.clearTimeout,
    })
    const { generation } = machine.beginLoad()

    const pending = machine.awaitWorkerReadiness(generation, () => new Promise(() => {}))
    await flush()

    timers.advance(WORKER_READY_TIMEOUT_MS - 1)
    await flush()
    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.LOADING)

    timers.advance(1)
    const snapshot = await pending

    assert.equal(snapshot.state, STUDIO_HEAVY_STATES.FAILED)
    assert.equal(snapshot.failure, STUDIO_HEAVY_FAILURE_REASONS.WORKER_BLOCKED)
    assert.equal(isWorkerBlockedReason(snapshot.failure), true)
  })

  it('surfaces a rejected probe as worker_blocked, never a fabricated success', async () => {
    const machine = createStudioHeavyStateMachine()
    const { generation } = machine.beginLoad()

    const snapshot = await machine.awaitWorkerReadiness(generation, () =>
      Promise.reject(new Error('no worker')),
    )

    assert.equal(snapshot.state, STUDIO_HEAVY_STATES.FAILED)
    assert.equal(snapshot.failure, STUDIO_HEAVY_FAILURE_REASONS.WORKER_BLOCKED)
  })

  it('reports a module-load failure distinctly from a worker failure', () => {
    const machine = createStudioHeavyStateMachine()
    const { generation } = machine.beginLoad()

    machine.moduleLoadFailed(generation)

    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.FAILED)
    assert.equal(machine.getFailure(), STUDIO_HEAVY_FAILURE_REASONS.MODULE_LOAD_FAILED)
    assert.equal(isWorkerBlockedReason(machine.getFailure()), false)
  })

  it('reports a refused inline style distinctly from a module/worker failure', () => {
    const machine = createStudioHeavyStateMachine()
    const { generation } = machine.beginLoad()

    machine.stylesRefused(generation)

    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.FAILED)
    assert.equal(machine.getFailure(), STUDIO_HEAVY_FAILURE_REASONS.STYLES_REFUSED)
    assert.equal(isWorkerBlockedReason(machine.getFailure()), false)
  })

  it('does not resurrect a capability after reset with a late completion', async () => {
    const machine = createStudioHeavyStateMachine()
    const { generation } = machine.beginLoad()

    let settleProbe
    const pending = machine.awaitWorkerReadiness(
      generation,
      () => new Promise((resolve) => { settleProbe = resolve }),
    )
    await flush()

    machine.reset()
    settleProbe({ ok: true })
    const snapshot = await pending

    assert.equal(snapshot.state, STUDIO_HEAVY_STATES.LAUNCHER)
    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.LAUNCHER)
    assert.equal(machine.isActive(), false)
  })

  it('ignores events from a superseded generation', () => {
    const machine = createStudioHeavyStateMachine()
    const first = machine.beginLoad()
    machine.reset()
    const second = machine.beginLoad()

    assert.notEqual(second.generation, first.generation)

    machine.moduleLoadFailed(first.generation)
    machine.stylesRefused(first.generation)

    assert.equal(machine.getState(), STUDIO_HEAVY_STATES.LOADING)
  })

  it('treats a second open while already ready as a no-op', () => {
    const machine = createStudioHeavyStateMachine()
    const first = machine.beginLoad()
    machine.workerBlocked(first.generation)
    // Failed is not active: a fresh load is allowed (Retry).
    const retry = machine.beginLoad()
    assert.equal(retry.started, true)
  })
})

describe('bounded readiness helper', () => {
  it('resolves an explicit probe result through, and times out a silent one', async () => {
    const timers = createFakeTimers()
    const bounded = createBoundedReadiness({
      timeoutMs: WORKER_READY_TIMEOUT_MS,
      schedule: timers.setTimeout,
      cancel: timers.clearTimeout,
    })

    const explicit = bounded(() => Promise.resolve({ ok: true }))
    assert.deepEqual(await explicit, { ok: true })

    let settled
    const silent = bounded(() => new Promise(() => {}))
    silent.then((result) => { settled = result })
    await flush()
    timers.advance(WORKER_READY_TIMEOUT_MS - 1)
    await flush()
    assert.equal(settled, undefined)

    timers.advance(1)
    await flush()
    assert.deepEqual(settled, { ok: false, reason: WORKER_PROBE_REASONS.WORKER_TIMEOUT })
  })
})

describe('fail-closed worker capability (D-16, T-304-08)', () => {
  // A fake that mirrors the pinned editor shape: a client whose `_getProxy`
  // falls back to a synchronous main-thread worker on any failure. The adapter
  // must neutralize ONLY that fallback, loudly, without ever running it.
  function createFakeVendor() {
    const calls = { synchronous: 0 }
    class EditorWorkerClient {
      _getOrCreateWorker() {
        throw new Error('worker construction blocked')
      }
      async _getProxy() {
        try {
          const proxy = this._getOrCreateWorker().proxy
          await proxy.$ping()
          return proxy
        } catch {
          this._worker = this._createFallbackLocalWorker()
          return this._worker.proxy
        }
      }
      _createFallbackLocalWorker() {
        calls.synchronous += 1
        return { proxy: { $ping: async () => {} } }
      }
    }
    return { vendor: { EditorWorkerClient }, calls }
  }

  it('refuses the synchronous fallback and reports instead of running it', async () => {
    const { vendor, calls } = createFakeVendor()
    const { restore } = installFailClosedWorkerAdapter(vendor)

    await assert.rejects(
      () => new vendor.EditorWorkerClient()._getProxy(),
      WorkerFallbackRefusedError,
    )
    assert.equal(calls.synchronous, 0)

    restore()
    await new vendor.EditorWorkerClient()._getProxy()
    assert.equal(calls.synchronous, 1)
  })

  it('fails loudly when the pinned vendor shape is not the expected one', () => {
    assert.throws(() => installFailClosedWorkerAdapter({}), EditorVendorShapeError)
    assert.throws(
      () => assertPinnedVendorShape({ EditorWorkerClient: class {} }),
      EditorVendorShapeError,
    )
  })

  it('enters the local worker-blocked state on a construction failure', async () => {
    const probe = createWorkerReadinessProbe({
      createWorker: () => {
        throw new Error('blocked under policy')
      },
    })
    const machine = createStudioHeavyStateMachine()
    const { generation } = machine.beginLoad()

    const snapshot = await machine.awaitWorkerReadiness(generation, probe)

    assert.equal(snapshot.state, STUDIO_HEAVY_STATES.FAILED)
    assert.equal(snapshot.failure, STUDIO_HEAVY_FAILURE_REASONS.WORKER_BLOCKED)
  })

  it('asserts the exact pinned vendor shape against the real module', async () => {
    const saved = {
      window: globalThis.window,
      self: globalThis.self,
      location: globalThis.location,
      document: globalThis.document,
    }
    globalThis.window = globalThis
    globalThis.self = globalThis
    globalThis.location = { href: 'http://localhost/', protocol: 'http:' }
    globalThis.document = {
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      documentElement: { style: {} },
      body: { appendChild() {} },
      head: { appendChild() {} },
      createTextNode: () => ({}),
      addEventListener() {},
      removeEventListener() {},
    }
    try {
      const vendor = await import(
        'monaco-editor/esm/vs/editor/browser/services/editorWorkerService.js'
      )
      assert.equal(assertPinnedVendorShape(vendor), true)
      assert.equal(typeof vendor.EditorWorkerClient, 'function')
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete globalThis[key]
        else globalThis[key] = value
      }
    }
  })
})