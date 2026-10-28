// Worker readiness does not imply Monaco editor readiness. Keep each field
// pending until its editor exists, applying it once without replaying old text
// when the other editor appears or GraphiQL rerenders.
export function createStudioDocumentBridge() {
  let editors = {}
  let pending = {}
  let disposed = false
  const fields = { query: 'queryEditor', variables: 'variableEditor' }

  function flush() {
    for (const [field, editorKey] of Object.entries(fields)) {
      if (Object.hasOwn(pending, field) && editors[editorKey]) {
        editors[editorKey].setValue(pending[field])
        delete pending[field]
      }
    }
  }

  return {
    attach(nextEditors) {
      if (disposed) return
      editors = nextEditors
      flush()
    },
    setDocument({ query = '', variables = '' } = {}) {
      if (disposed) return
      pending = { query, variables }
      flush()
    },
    getDocument() {
      return Object.fromEntries(Object.entries(fields).map(([field, editorKey]) => [
        field,
        pending[field] ?? editors[editorKey]?.getValue() ?? '',
      ]))
    },
    dispose() {
      disposed = true
      editors = {}
      pending = {}
    },
  }
}
