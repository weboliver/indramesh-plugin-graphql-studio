import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  STUDIO_FAILURE_REASONS,
  STUDIO_STATES,
  createStudioStateMachine,
} from './studio-state.js'

describe('studio page lifecycle state machine', () => {
  it('starts idle and dedupes a concurrent second load start', () => {
    const machine = createStudioStateMachine()
    assert.equal(machine.getState(), STUDIO_STATES.IDLE)

    const first = machine.beginLoad()
    const second = machine.beginLoad()

    assert.equal(first.started, true)
    assert.equal(second.started, false)
    assert.equal(second.generation, first.generation)
    assert.equal(machine.getState(), STUDIO_STATES.LOADING)
  })

  it('reaches ready only after a matching load success', () => {
    const machine = createStudioStateMachine()
    const { generation } = machine.beginLoad()

    machine.loadSucceeded(generation)
    assert.equal(machine.getState(), STUDIO_STATES.READY)
    assert.equal(machine.getFailure(), null)
  })

  it('fails locally with a scoped reason on a load failure', () => {
    const machine = createStudioStateMachine()
    const { generation } = machine.beginLoad()

    machine.loadFailed(generation)

    assert.equal(machine.getState(), STUDIO_STATES.FAILED)
    assert.equal(machine.getFailure(), STUDIO_FAILURE_REASONS.LIST_LOAD_FAILED)
  })

  it('ignores a success from a superseded generation (disposed page)', () => {
    const machine = createStudioStateMachine()
    const first = machine.beginLoad()

    machine.dispose()
    machine.loadSucceeded(first.generation)

    assert.equal(machine.getState(), STUDIO_STATES.IDLE)
  })

  it('allows at most one live run at a time and only from ready', () => {
    const machine = createStudioStateMachine()

    // Not ready yet: a run must not start.
    assert.equal(machine.beginRun().started, false)

    const { generation } = machine.beginLoad()
    machine.loadSucceeded(generation)

    const first = machine.beginRun()
    const parallel = machine.beginRun()
    assert.equal(first.started, true)
    assert.equal(parallel.started, false)
    assert.equal(machine.isRunning(), true)

    machine.runFinished(first.runGeneration)
    assert.equal(machine.isRunning(), false)
    // The page stays ready after a run finished (a run-level error is a result,
    // not a page failure).
    assert.equal(machine.getState(), STUDIO_STATES.READY)
  })

  it('ignores a stale run completion after dispose', () => {
    const machine = createStudioStateMachine()
    const { generation } = machine.beginLoad()
    machine.loadSucceeded(generation)
    const run = machine.beginRun()

    machine.dispose()
    machine.runFinished(run.runGeneration)

    assert.equal(machine.isRunning(), false)
    assert.equal(machine.getState(), STUDIO_STATES.IDLE)
  })

  it('releases tracked resources exactly once, idempotently', () => {
    const machine = createStudioStateMachine()
    let releases = 0

    machine.trackResource(() => {
      releases += 1
    })
    machine.trackResource(() => {
      releases += 1
    })

    machine.dispose()
    machine.dispose()

    assert.equal(releases, 2)
  })

  it('keeps releasing after a failing disposer', () => {
    const machine = createStudioStateMachine()
    let released = false

    machine.trackResource(() => {
      throw new Error('boom')
    })
    machine.trackResource(() => {
      released = true
    })

    machine.dispose()

    assert.equal(released, true)
  })

  it('starts a fresh single load after a repeat navigation (dispose then load)', () => {
    const machine = createStudioStateMachine()
    const first = machine.beginLoad()
    machine.loadSucceeded(first.generation)

    machine.dispose()
    const second = machine.beginLoad()

    assert.equal(second.started, true)
    assert.notEqual(second.generation, first.generation)
    assert.equal(machine.getState(), STUDIO_STATES.LOADING)
  })

  it('notifies subscribers on every observable transition', () => {
    const seen = []
    const machine = createStudioStateMachine()
    machine.subscribe((snapshot) => seen.push(snapshot.state))

    const { generation } = machine.beginLoad()
    machine.loadSucceeded(generation)

    assert.deepEqual(seen, [STUDIO_STATES.LOADING, STUDIO_STATES.READY])
  })
})