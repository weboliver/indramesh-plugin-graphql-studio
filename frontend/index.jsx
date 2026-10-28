import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Button,
  PageHeader,
  FormField,
  TextInput,
  showToast,
  api,
  usePluginTranslation,
  extractErrorMessage,
  IS_PRODUCTION,
  loadPluginModule,
} from '@indramesh/plugin-api'
import en from './locales/en.json'
import de from './locales/de.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import pt from './locales/pt.json'
import { STUDIO_STATES, createStudioStateMachine } from './studio-state.js'
import {
  STUDIO_HEAVY_STATES,
  STUDIO_HEAVY_FAILURE_REASONS,
  createStudioHeavyStateMachine,
  isWorkerBlockedReason,
} from './studio-heavy-state.js'

// Phase 304 (GQL-05/D-15): the plugin's own identity. It owns only its page and
// Tools nav; saved queries stay Core (Carry-06).
const PLUGIN_NAME = 'graphql-studio'
// The saved-query picker filters client-side, so it loads a generous page.
const LIST_LIMIT = 500
// The manifest's `[frontend.deferred_assets]` id for the interactive editor
// payload (`plugin.toml`). The host resolves the built file from this id; the
// light bundle never imports the heavy module directly.
const HEAVY_ASSET_ID = 'studio'

// Client-side variables pre-check (server stays authoritative): an empty field
// means "no request variables"; anything else must be a JSON object.
function parseVariablesText(text) {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return { ok: true, value: null }
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, value: null }
    }
    return { ok: true, value: parsed }
  } catch {
    return { ok: false, value: null }
  }
}

// Client-side query-only pre-check (D-03). The server rejects a non-query
// document with 422 as well; this is immediate feedback, not the authority.
function queryOnlyIssue(documentText) {
  return /(^|\n)\s*(mutation|subscription)\b/.test(documentText ?? '')
}

// The pure lifecycle machine (studio-state.js) bound to React: one machine per
// mount, subscribed for re-render, disposed on unmount (which aborts any
// in-flight request). Repeat navigation therefore starts a single fresh load
// and never leaks a request or a second mount (GQL-05 idempotency).
function useStudioMachine() {
  const machineRef = useRef(null)
  if (machineRef.current === null) machineRef.current = createStudioStateMachine()
  const machine = machineRef.current
  const [snapshot, setSnapshot] = useState(() => machine.getSnapshot())
  useEffect(() => machine.subscribe(setSnapshot), [machine])
  useEffect(() => () => machine.dispose(), [machine])
  return [machine, snapshot]
}

// D-16 fail-closed style check: the host injector appends each heavy style as an
// inline <style> element tagged with this owner. Under a `style-src` that
// refuses inline styles the browser keeps the element but associates no
// stylesheet, so `element.sheet` is null. Detecting that lets the shell report a
// clear local failure instead of rendering an unstyled editor; Core and other
// contributions stay usable.
function stylesWereRefused(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return false
  const sheets = root.querySelectorAll('style[data-plugin-owner="' + PLUGIN_NAME + '"]')
  for (const element of sheets) {
    if (element.sheet === null) return true
  }
  return false
}

// GQL-05/D-14/D-16: the interactive editor launcher. The heavy bytes are fetched
// ONLY when the user opens it (never at login or on unrelated pages) through the
// host deferred-module helper. The lifecycle is a pure state machine so `ready`
// is only ever reached after styles apply and a real worker reply arrives; each
// failure mode (module load, refused styles, blocked worker) renders a distinct
// local error with Retry and never mounts a half-initialized editor.
function StudioHeavyEditor({ initialDocument }) {
  const { t: tp } = usePluginTranslation(PLUGIN_NAME)
  const machineRef = useRef(null)
  if (machineRef.current === null) machineRef.current = createStudioHeavyStateMachine()
  const machine = machineRef.current
  const [snapshot, setSnapshot] = useState(() => machine.getSnapshot())
  const containerRef = useRef(null)
  const controllerRef = useRef(null)

  useEffect(() => machine.subscribe(setSnapshot), [machine])

  const teardown = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.unmount()
      controllerRef.current = null
    }
    if (containerRef.current) {
      // A failed or superseded load must never leave a partial editor mounted.
      containerRef.current.replaceChildren()
    }
  }, [])

  useEffect(
    () => () => {
      teardown()
      machine.reset()
    },
    [machine, teardown],
  )

  // D-15: live queries run as the calling user against `/api/v1/graphql` (the
  // baseURL override drops the Core REST `/api/v1` prefix). The host api client
  // keeps the authenticated user's Bearer token.
  const fetcher = useCallback(async ({ query, variables, operationName }) => {
    const response = await api.post(
      '/api/v1/graphql',
      { query, variables, operationName },
      { baseURL: '/' },
    )
    return response.data
  }, [])

  const open = useCallback(async () => {
    const { started, generation } = machine.beginLoad()
    if (!started) return
    teardown()
    const result = await loadPluginModule(PLUGIN_NAME, HEAVY_ASSET_ID)
    // A stale generation (canceled / superseded navigation) never mounts.
    if (!machine.isCurrent(generation)) return
    if (!result?.ok) {
      machine.moduleLoadFailed(generation)
      return
    }
    const mount = result.module?.mountStudioEditor
    if (typeof mount !== 'function') {
      machine.moduleLoadFailed(generation)
      return
    }
    const controller = mount(containerRef.current, {
      pluginName: PLUGIN_NAME,
      fetcher,
      labels: {
        hint: tp('heavy.hint', 'Runs live queries against /api/v1/graphql as you.'),
      },
    })
    controllerRef.current = controller
    // D-16: a production `style-src` that refuses the inline heavy styles must
    // fail this contribution locally, before any editor is rendered — never a
    // silent unstyled fallback.
    if (stylesWereRefused(document.head)) {
      teardown()
      machine.stylesRefused(generation)
      return
    }
    const outcome = await machine.awaitWorkerReadiness(generation, controller.probe)
    if (outcome.state === STUDIO_HEAVY_STATES.READY) {
      controller.render()
    } else {
      teardown()
    }
  }, [machine, teardown, fetcher, tp])

  // Navigating to the studio page is the explicit use that loads the editor
  // (never login/preload). Run once per mount; the generation guard drops a
  // load superseded by an unmount.
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])
  useEffect(() => {
    void openRef.current()
  }, [])

  const retry = useCallback(() => {
    teardown()
    machine.reset()
    void open()
  }, [machine, teardown, open])

  const failureCopy = () => {
    if (snapshot.failure === STUDIO_HEAVY_FAILURE_REASONS.STYLES_REFUSED) {
      return tp(
        'heavy.failed_styles',
        'The editor styles could not be applied, so the editor is unavailable. Try again; the rest of the page still works.',
      )
    }
    if (isWorkerBlockedReason(snapshot.failure)) {
      return tp(
        'heavy.failed_worker',
        'The editor worker could not start, so the editor is unavailable. Try again; other features still work.',
      )
    }
    return tp(
      'heavy.failed_module',
      'The interactive editor could not be loaded. Try again, or use the GraphQL Library page.',
    )
  }

  return (
    <section
      className="min-w-0 space-y-3"
      aria-label={tp('heavy.heading', 'Interactive editor')}
      data-testid="graphql-studio-heavy-panel"
    >

      {snapshot.state === STUDIO_HEAVY_STATES.LOADING ||
      snapshot.state === STUDIO_HEAVY_STATES.LAUNCHER ? (
        <div
          className="rounded-lg border bg-card p-4 space-y-3"
          aria-busy="true"
          data-testid="graphql-studio-heavy-loading"
        >
          <p className="text-sm text-muted-foreground">
            {tp('heavy.loading', 'Loading editor…')}
          </p>
          {/* Neutral skeleton: no fabricated editor chrome while loading. */}
          <div className="space-y-2" aria-hidden="true">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-24 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ) : null}

      {snapshot.state === STUDIO_HEAVY_STATES.FAILED ? (
        <div
          className="rounded-lg border border-destructive bg-card p-4 space-y-4"
          role="alert"
          data-testid="graphql-studio-heavy-failed"
          data-failure={snapshot.failure}
        >
          <p className="text-sm text-destructive">{failureCopy()}</p>
          <div className="flex flex-wrap items-start gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto min-h-8 whitespace-normal px-4 py-2 font-semibold"
              data-testid="graphql-studio-heavy-retry"
              onClick={retry}
            >
              {tp('heavy.retry', 'Try again')}
            </Button>
          </div>
        </div>
      ) : null}

      {snapshot.state === STUDIO_HEAVY_STATES.READY ? (
        <SavedQueryBar controllerRef={controllerRef} initialDocument={initialDocument} />
      ) : null}

      {/* E7 overflow backstop: the editor workspace contains its own scrolling;
          the mount stays min-w-0/overflow-hidden so the page body never scrolls
          horizontally. */}
      <div
        ref={containerRef}
        className="min-w-0 overflow-x-hidden"
        data-testid="graphql-studio-heavy-mount"
      />
    </section>
  )
}

// A searchable saved-query picker (combobox). Typing filters by name and query
// text; arrow keys move, Enter picks, Escape closes the list. The first entry
// always starts a new query.
function SavedQueryPicker({ id, items, selectedId, onSelect, disabled, newLabel, searchPlaceholder, emptyLabel }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef(null)
  const listId = `${id}-listbox`

  const selected = items.find((item) => item.id === selectedId)
  const term = search.trim().toLowerCase()
  const matches = term
    ? items.filter(
        (item) =>
          (item.name ?? '').toLowerCase().includes(term) ||
          (item.query_text ?? '').toLowerCase().includes(term)
      )
    : items
  // Index 0 is the "new query" entry; matches follow from index 1.
  const options = [{ id: '', name: newLabel }, ...matches]

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex])

  const openList = () => {
    setSearch('')
    setActiveIndex(0)
    setOpen(true)
  }

  const pick = (option) => {
    setOpen(false)
    setSearch('')
    onSelect(option.id)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openList()
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => Math.min(Math.max(index + step, 0), options.length - 1))
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      const option = options[activeIndex]
      if (option) pick(option)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      setSearch('')
    }
  }

  return (
    <div className="relative">
      <TextInput
        id={id}
        data-testid="graphql-studio-load"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={open ? searchPlaceholder : newLabel}
        value={open ? search : (selected?.name ?? '')}
        onFocus={openList}
        onClick={() => {
          if (!open) openList()
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setSearch(event.target.value)
          setActiveIndex(event.target.value.trim() ? 1 : 0)
          setOpen(true)
        }}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-lg"
          data-testid="graphql-studio-load-list"
        >
          {options.map((option, index) => (
            <li
              key={option.id || 'new'}
              id={`${id}-option-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === activeIndex}
              // mousedown keeps focus in the input so blur does not close the
              // list before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option)}
              onMouseEnter={() => setActiveIndex(index)}
              className={
                'cursor-pointer px-3 py-1.5 ' +
                (index === activeIndex ? 'bg-accent text-accent-foreground ' : '') +
                (option.id === '' ? 'text-sm text-muted-foreground' : '')
              }
              data-testid={option.id ? 'graphql-studio-load-option-' + option.id : 'graphql-studio-load-option-new'}
            >
              {option.id ? (
                <>
                  <span className="block truncate text-sm font-semibold">{option.name}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {option.query_text ?? ''}
                  </span>
                </>
              ) : (
                option.name
              )}
            </li>
          ))}
          {matches.length === 0 && term ? (
            <li className="px-3 py-1.5 text-sm text-muted-foreground" aria-disabled="true">
              {emptyLabel}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

// GQL-05: load/save Core saved queries straight into/out of the interactive
// editor. The editor text is read from and written to the live editors through
// the heavy controller; the studio owns no table of its own (D-15).
function SavedQueryBar({ controllerRef, initialDocument }) {
  const { t: tp } = usePluginTranslation(PLUGIN_NAME)
  const [machine, snapshot] = useStudioMachine()
  const listLoading = snapshot.state === STUDIO_STATES.LOADING

  const [items, setItems] = useState([])
  const [listError, setListError] = useState(null)
  const [selectedId, setSelectedId] = useState(initialDocument?.id ?? '')
  const [name, setName] = useState(initialDocument?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Apply the navigation snapshot independently of the saved-query list. The
  // controller queues it until the actual editors mount. List reloads never
  // replace it with the saved version or overwrite subsequent user edits.
  useEffect(() => {
    if (initialDocument) controllerRef.current?.setDocument(initialDocument)
  }, [controllerRef, initialDocument])

  const loadList = useCallback(async () => {
    const { started, generation } = machine.beginLoad()
    if (!started) return
    setListError(null)
    const controller = new AbortController()
    const release = machine.trackResource(() => controller.abort())
    try {
      const response = await api.get('/saved-queries/', {
        params: { skip: 0, limit: LIST_LIMIT },
        signal: controller.signal,
      })
      if (!machine.isCurrent(generation)) return
      setItems(Array.isArray(response.data) ? response.data : [])
      machine.loadSucceeded(generation)
    } catch (error) {
      if (!machine.isCurrent(generation)) return
      setListError(extractErrorMessage(error))
      machine.loadFailed(generation)
    } finally {
      if (typeof release === 'function') release()
    }
  }, [machine])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const handleSelect = (id) => {
    setSelectedId(id)
    setSaveError(null)
    const item = items.find((entry) => entry.id === id)
    if (!item) {
      setName('')
      controllerRef.current?.setDocument({ query: '', variables: '' })
      return
    }
    setName(item.name ?? '')
    controllerRef.current?.setDocument({
      query: item.query_text ?? '',
      variables: item.variables ? JSON.stringify(item.variables, null, 2) : '',
    })
  }

  // D-15: saves through the Core REST `/saved-queries` endpoints. The checks
  // below are immediate feedback; the server stays authoritative.
  const save = async ({ asNew }) => {
    const doc = controllerRef.current?.getDocument()
    if (!doc || saving) return
    if (!name.trim() || !doc.query.trim()) {
      setSaveError(tp('save_incomplete', 'A name and a query are required.'))
      return
    }
    if (queryOnlyIssue(doc.query)) {
      setSaveError(
        tp(
          'query_only',
          'Only query operations are allowed. This document contains a mutation or subscription.'
        )
      )
      return
    }
    const variables = parseVariablesText(doc.variables)
    if (!variables.ok) {
      setSaveError(tp('variables_invalid', 'Variables must be a valid JSON object.'))
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = { name: name.trim(), query_text: doc.query, variables: variables.value }
      const saved =
        selectedId && !asNew
          ? (await api.patch(`/saved-queries/${selectedId}`, payload)).data
          : (await api.post('/saved-queries/', payload)).data
      showToast(tp('save_success', 'Query saved.'))
      await loadList()
      setSelectedId(saved.id)
      setName(saved.name ?? name)
    } catch (error) {
      setSaveError(
        tp('save_failure_detail', 'The query could not be saved: {{reason}}', {
          reason: extractErrorMessage(error),
        })
      )
      showToast(tp('save_failure', 'The query could not be saved.'), { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3" data-testid="graphql-studio-saved-bar">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <FormField id="graphql-studio-load" label={tp('field.saved_query', 'Saved query')}>
            <SavedQueryPicker
              id="graphql-studio-load"
              items={items}
              selectedId={selectedId}
              onSelect={handleSelect}
              disabled={listLoading}
              newLabel={tp('field.saved_query_new', '— New query —')}
              searchPlaceholder={tp('field.saved_query_search', 'Search saved queries…')}
              emptyLabel={tp('field.saved_query_none', 'No matching saved queries.')}
            />
          </FormField>
        </div>
        <div className="min-w-64 flex-1">
          <FormField id="graphql-studio-name" label={tp('field.name', 'Name')} required>
            <TextInput
              id="graphql-studio-name"
              data-testid="graphql-studio-name"
              value={name}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => void save({ asNew: false })}
            loading={saving}
            disabled={saving}
            className="h-auto min-h-9 whitespace-normal font-semibold"
            data-testid="graphql-studio-save"
          >
            {tp('action.save', 'Save query')}
          </Button>
          {selectedId ? (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => void save({ asNew: true })}
              disabled={saving}
              className="h-auto min-h-9 whitespace-normal"
              data-testid="graphql-studio-save-as-new"
            >
              {tp('action.save_as_new', 'Save as new')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => void loadList()}
            disabled={listLoading}
            className="h-auto min-h-9 whitespace-normal"
            data-testid="graphql-studio-reload"
          >
            {tp('action.reload', 'Reload list')}
          </Button>
        </div>
      </div>
      {listError ? (
        <p role="alert" className="text-sm text-destructive" data-testid="graphql-studio-list-error">
          {tp('list.error', 'Saved queries could not be loaded.')} {listError}
        </p>
      ) : null}
      {saveError ? (
        <p role="alert" className="text-sm text-destructive" data-testid="graphql-studio-save-error">
          {saveError}
        </p>
      ) : null}
    </div>
  )
}

function StudioPage() {
  const { t: tp } = usePluginTranslation(PLUGIN_NAME)
  const location = useLocation()

  return (
    <div className="space-y-6" data-testid="graphql-studio-page">
      {/* GQL-06/D-18: production-only, non-dismissable plugin-owned warning. The
          value comes from the host's baked build flag; outside production the
          banner is not rendered at all. */}
      {IS_PRODUCTION ? (
        <div
          role="status"
          data-testid="graphql-studio-production-banner"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          <p className="font-semibold">{tp('production.title', 'Not for production')}</p>
          <p>
            {tp(
              'production.banner',
              'Not intended for production. This editor enables /api/v1/graphql while the plugin is active.'
            )}
          </p>
        </div>
      ) : null}

      <PageHeader
        title={tp('page.title', 'GraphQL Studio')}
        description={tp(
          'page.description',
          'Run queries interactively against /api/v1/graphql, and load or save them as Core saved queries.'
        )}
        icon="square-terminal"
      />

      {/* GQL-05/D-14: the late-loaded interactive editor. Its bytes are fetched
          only when the user opens it, never on page load. */}
      <StudioHeavyEditor key={location.key} initialDocument={location.state?.studioDocument} />
    </div>
  )
}

export default {
  // FEEXT-04/D9: the plugin ships its own per-language JSON; the host installs it
  // under the plugin-assigned namespace (never core `systemui`).
  translations: { en, de, es, fr, pt },
  pages: [
    {
      id: 'graphql-studio-page',
      // Served at `/plugins/graphql-studio/studio` -- the fixed target used by the
      // Core `tools/graphql` redirect and the "Open in Studio" handoff (D-12/D-15).
      path: 'studio',
      component: StudioPage,
    },
  ],
  navItems: [
    {
      id: 'graphql-studio-nav',
      label: 'GraphQL Studio',
      labelKey: 'nav.label',
      path: '/plugins/graphql-studio/studio',
      icon: 'square-terminal',
      group: 'Tools',
      // The host `plugin-runtime:use` gate applies to the plugin surface on top
      // of this plugin-owned permission (T-304-07).
      permission: 'graphql-studio:use',
    },
  ],
}
