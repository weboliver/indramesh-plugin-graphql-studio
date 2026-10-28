// Phase 304 (GQL-05/D-16, T-304-08): fail-closed adapter for the plugin's
// PINNED editor worker build.
//
// The pinned editor worker service catches both an async worker construction
// failure and a ping failure and then calls `_createFallbackLocalWorker()`,
// which runs the editor on the main thread (a `SynchronousWorkerClient`). Under
// a strict production policy that silent degraded mode is exactly what D-16
// forbids. This adapter is intentionally narrow and version-scoped:
//
//   * it asserts the exact expected vendor shape of the pinned build, so an
//     editor-language upgrade that moves/changes the fallback fails LOUDLY here
//     instead of silently reintroducing the main-thread path;
//   * it replaces ONLY `EditorWorkerClient.prototype._createFallbackLocalWorker`
//     with a function that throws `WorkerFallbackRefusedError`, so a worker
//     fault surfaces as a bounded, local failure;
//   * it never instantiates a synchronous worker and never patches a global DOM
//     method, and `restore()` puts the original vendor method back.
//
// This module must stay import-safe under plain `node --test` (no DOM): the
// pinned module is passed in by the heavy entry, never imported here.

export const PINNED_EDITOR_WORKER_SERVICE_PATH =
  'monaco-editor/esm/vs/editor/browser/services/editorWorkerService.js'

export const EXPECTED_WORKER_CLIENT_METHODS = Object.freeze([
  '_getOrCreateWorker',
  '_getProxy',
  '_createFallbackLocalWorker',
])

export class EditorVendorShapeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EditorVendorShapeError'
  }
}

export class WorkerFallbackRefusedError extends Error {
  constructor(message = 'Synchronous main-thread worker fallback refused (D-16).') {
    super(message)
    this.name = 'WorkerFallbackRefusedError'
  }
}

/**
 * Assert the pinned vendor shape. Throws `EditorVendorShapeError` with the exact
 * mismatch when the build no longer looks like the one this adapter targets.
 */
export function assertPinnedVendorShape(vendor) {
  const client = vendor?.EditorWorkerClient
  if (typeof client !== 'function') {
    throw new EditorVendorShapeError(
      `pinned editor build does not export EditorWorkerClient (${PINNED_EDITOR_WORKER_SERVICE_PATH})`,
    )
  }
  const proto = client.prototype
  const missing = EXPECTED_WORKER_CLIENT_METHODS.filter((method) => typeof proto?.[method] !== 'function')
  if (missing.length > 0) {
    throw new EditorVendorShapeError(
      `EditorWorkerClient.prototype is missing: ${missing.join(', ')}`,
    )
  }
  return true
}

/**
 * Install the fail-closed fallback. Returns `{ restore }`; `restore` is
 * idempotent and puts the original vendor method back.
 */
export function installFailClosedWorkerAdapter(vendor) {
  assertPinnedVendorShape(vendor)
  const proto = vendor.EditorWorkerClient.prototype
  const original = Object.getOwnPropertyDescriptor(proto, '_createFallbackLocalWorker')

  Object.defineProperty(proto, '_createFallbackLocalWorker', {
    configurable: true,
    writable: true,
    value: function failClosedFallbackRefused() {
      throw new WorkerFallbackRefusedError()
    },
  })

  return {
    restore() {
      if (original) Object.defineProperty(proto, '_createFallbackLocalWorker', original)
      else delete proto._createFallbackLocalWorker
    },
  }
}