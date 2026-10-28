/**
 * graphql-studio plugin — HEAVY editor entry (Phase 304, GQL-05/D-14/D-16).
 *
 * This is the plugin's independently built heavy payload, loaded by the host
 * only when a user opens the interactive editor (the manifest declares it as the
 * `studio` deferred asset). It is deliberately separate from `index.jsx` (the
 * lightweight registration bundle): none of the bytes below reach the browser at
 * login or on unrelated Core pages.
 *
 * What this entry proves about the delivery model:
 *   * it imports the real interactive editor graph — the editor core, the
 *     GraphQL language mode and the GraphiQL component with the explorer plugin;
 *   * the editor/JSON/GraphQL workers are embedded inline (`?worker&inline`), so
 *     the payload opens no external worker URL;
 *   * every third-party CSS file the graph pulls in is inlined into this file by
 *     `vite.heavy.config.mjs` and exposed through `getHeavyStyles()` — nothing is
 *     injected globally at import time, so the shell can hand the text to the
 *     host's `injectPluginStyles` and scope/clean it up on unmount (D-15);
 *   * the only runtime imports are the eight host singletons, externalized by
 *     identity in the build.
 *
 * Lifecycle: the light shell calls `mountStudioEditor(container, options)` only
 * on explicit use. The returned controller exposes a bounded `probe` (an actual
 * worker protocol reply), `render()` for the ready path and `unmount()` which
 * releases every style/worker effect it created. A probe failure is reported
 * locally and no editor is rendered (D-16).
 */
import { createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main.js'
import { EditorWorkerClient } from 'monaco-editor/esm/vs/editor/browser/services/editorWorkerService.js'
import { createWebWorker } from 'monaco-editor/esm/vs/base/browser/defaultWorkerFactory.js'
import { standaloneEditorWorkerDescriptor } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js'
import { GraphiQL } from 'graphiql'
import { useGraphiQL } from '@graphiql/react'
import { explorerPlugin } from '@graphiql/plugin-explorer'
import {
  createStyleInjector,
  injectPluginStyles,
  releaseOwner,
} from '@indramesh/plugin-api'

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker&inline'
import GraphQLWorker from 'monaco-graphql/esm/graphql.worker?worker&inline'

import { installFailClosedWorkerAdapter } from './monaco-failclosed.js'
import { createWorkerReadinessProbe } from './studio-heavy-state.js'
import { createStudioDocumentBridge } from './studio-document.js'

import 'graphiql/style.css'
import '@graphiql/plugin-explorer/style.css'
import './studio-editor-heavy.css'

export const STUDIO_PLUGIN_NAME = 'graphql-studio'
export const STUDIO_HEAVY_ASSET_ID = 'studio'

// Wire the editor's worker resolution to the inline worker constructors. Called
// only on mount (never at import time) so a contribution that is not used pays
// no worker cost.
function installWorkers() {
  if (typeof globalThis === 'undefined') return
  globalThis.MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === 'graphql') return new GraphQLWorker()
      if (label === 'json') return new JsonWorker()
      return new EditorWorker()
    },
  }
}

/**
 * Returns the CSS text inlined into this payload, in graph order. The light
 * shell passes these strings to `injectPluginStyles` on mount and releases them
 * on unmount; the build never injects them itself.
 */
export function getHeavyStyles() {
  const collected = globalThis.__indrameshHeavyCss
  return Array.isArray(collected) ? collected.slice() : []
}

// Renders nothing; it only hands the provider's Monaco editors to the
// controller so the light shell can load/save saved queries (GQL-05). GraphiQL
// renders only Toolbar/Logo/Footer children, so it rides in an empty Footer.
function EditorBridge({ documentBridge }) {
  const queryEditor = useGraphiQL((state) => state.queryEditor)
  const variableEditor = useGraphiQL((state) => state.variableEditor)
  useEffect(() => {
    documentBridge.attach({ queryEditor, variableEditor })
  }, [documentBridge, queryEditor, variableEditor])
  return null
}

// The interactive query/variables/result workspace. It is the plugin's own
// GraphiQL surface; the host framing (heading, launcher, saved-query bar,
// Close/Retry) lives in the light shell. The schema is optional — when absent
// GraphiQL introspects through the supplied `fetcher` (the live
// `/api/v1/graphql` endpoint).
function StudioGraphiQL({ schema, fetcher, defaultQuery, defaultVariables, documentBridge, labels = {} }) {
  return (
    <div className="min-w-0 space-y-2" data-testid="graphql-studio-heavy-editor">
      {labels.hint ? (
        <p className="text-xs text-muted-foreground" data-testid="graphql-studio-heavy-hint">
          {labels.hint}
        </p>
      ) : null}
      <div className="h-[60vh] min-w-0" data-testid="graphql-studio-heavy-graphiql">
        <GraphiQL
          schema={schema}
          fetcher={fetcher}
          defaultQuery={defaultQuery}
          defaultVariables={defaultVariables}
          isHeadersVisible={false}
          plugins={[explorerPlugin()]}
        >
          <GraphiQL.Footer>
            <EditorBridge documentBridge={documentBridge} />
          </GraphiQL.Footer>
        </GraphiQL>
      </div>
    </div>
  )
}

// A bounded worker-protocol probe is provided by the shared lifecycle module
// (`createWorkerReadinessProbe`). Readiness is an actual protocol reply
// (`client.proxy.$ping()`), never constructor success; a construction throw, a
// protocol rejection or the bounded timeout all resolve to a local failure
// result. It never creates a synchronous main-thread fallback (the fail-closed
// adapter below neutralizes that path).

/**
 * Mount the interactive editor into `container`.
 *
 * The returned controller separates "start/verify" from "render":
 *   * `probe()` constructs an inline editor worker and waits for an actual
 *     worker protocol reply within the bounded timeout;
 *   * `render()` mounts the editor only after the probe succeeded;
 *   * `unmount()` releases the injected styles, adopts and disposes the dynamic
 *     sheets the editor created and restores the fail-closed adapter.
 *
 * @param {HTMLElement} container
 * @param {{ labels?: object, pluginName?: string, styleRoot?: ParentNode, schema?: object,
 *           fetcher?: Function, defaultQuery?: string, defaultVariables?: string }} [options]
 * @returns {{ probe: () => Promise<object>, render: () => void, unmount: () => void,
 *            getDocument: () => { query: string, variables: string },
 *            setDocument: (doc: { query?: string, variables?: string }) => void }}
 */
export function mountStudioEditor(container, options = {}) {
  if (!container) throw new Error('mountStudioEditor requires a container element')

  const pluginName = options.pluginName ?? STUDIO_PLUGIN_NAME
  const styleRoot = options.styleRoot ?? document.head

  installWorkers()

  // D-16: neutralize the pinned build's synchronous main-thread worker fallback
  // before any editor is created. The adapter asserts the pinned vendor shape, so
  // an upstream change fails loudly instead of silently degrading. It is
  // restored on unmount.
  const failClosed = installFailClosedWorkerAdapter({ EditorWorkerClient })

  // Inject the static inline CSS through the host scoped-style helper and
  // remember the exact handles so unmount releases precisely this set.
  const injector = createStyleInjector()
  const styleHandles = getHeavyStyles().map((cssText, index) =>
    injectPluginStyles(pluginName, `studio-heavy-${index}`, cssText, { root: styleRoot }),
  )

  // Snapshot AFTER the static sheets are attached: adopting the diff below then
  // captures only the dynamic sheets/portals the editor creates, never the
  // pre-existing host sheets.
  const before = injector.snapshotChildren(styleRoot)

  // The probe uses the exact descriptor the standalone editor itself uses
  // (`esmModuleLocation: undefined`), so the worker resolves only through
  // `MonacoEnvironment.getWorker` and the inline constructors above.
  const probe = createWorkerReadinessProbe({
    createWorker: ({ label }) => createWebWorker({ ...standaloneEditorWorkerDescriptor, label }),
  })

  let root = null
  const documentBridge = createStudioDocumentBridge()

  return {
    probe,
    // The current operation and variables text, read from the live editors.
    getDocument: documentBridge.getDocument,
    // Replace the active tab's operation and variables (loading a saved query).
    setDocument: documentBridge.setDocument,
    render() {
      if (root) return
      root = createRoot(container)
      root.render(
        createElement(StudioGraphiQL, {
          schema: options.schema,
          fetcher: options.fetcher,
          defaultQuery: options.defaultQuery,
          defaultVariables: options.defaultVariables,
          documentBridge,
          labels: options.labels ?? {},
        }),
      )
    },
    unmount() {
      documentBridge.dispose()
      if (root) {
        try {
          root.unmount()
        } finally {
          root = null
        }
      }
      // Adopt and dispose the dynamic sheets/portals the editor created during
      // init, then release the static sheets. Pre-existing host sheets are never
      // in the diff and are never touched; no global DOM method is patched.
      injector.adoptNewChildren(pluginName, styleRoot, before).forEach((handle) => handle.release())
      styleHandles.forEach((handle) => handle.release())
      releaseOwner(pluginName)
      failClosed.restore()
      // Emitting the editor API keeps the editor core referenced (used by the
      // GraphiQL integration); the worker environment stays host-scoped.
      void monaco
    },
  }
}

export default mountStudioEditor
