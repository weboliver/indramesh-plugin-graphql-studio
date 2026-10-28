import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createStudioDocumentBridge } from './studio-document.js'

function editor(initial = '') {
  let value = initial
  const writes = []
  return {
    writes,
    getValue: () => value,
    setValue(next) { value = next; writes.push(next) },
    type(next) { value = next },
  }
}

describe('Studio document readiness', () => {
  it('retains a load before either editor exists and applies it once on attachment', () => {
    const bridge = createStudioDocumentBridge()
    const doc = { query: 'query Selected { __typename }', variables: '{"limit":2}' }
    bridge.setDocument(doc)
    assert.deepEqual(bridge.getDocument(), doc)
    const queryEditor = editor('previous query')
    const variableEditor = editor('previous variables')
    bridge.attach({ queryEditor, variableEditor })
    bridge.attach({ queryEditor, variableEditor })
    assert.deepEqual(queryEditor.writes, [doc.query])
    assert.deepEqual(variableEditor.writes, [doc.variables])
    assert.deepEqual(bridge.getDocument(), doc)
  })

  it('handles editors becoming ready separately without overwriting intervening typing', () => {
    const bridge = createStudioDocumentBridge()
    const queryEditor = editor()
    const variableEditor = editor()
    bridge.setDocument({ query: 'selected query', variables: '{"limit":3}' })
    bridge.attach({ queryEditor })
    queryEditor.type('user edited query')
    bridge.attach({ queryEditor, variableEditor })
    assert.deepEqual(bridge.getDocument(), {
      query: 'user edited query', variables: '{"limit":3}',
    })
    assert.deepEqual(queryEditor.writes, ['selected query'])
  })

  it('loads immediately into ready editors and reads their live contents', () => {
    const bridge = createStudioDocumentBridge()
    const queryEditor = editor()
    const variableEditor = editor()
    bridge.attach({ queryEditor, variableEditor })
    bridge.setDocument({ query: 'loaded', variables: '{}' })
    queryEditor.type('edited')
    variableEditor.type('{"edited":true}')
    assert.deepEqual(bridge.getDocument(), { query: 'edited', variables: '{"edited":true}' })
  })

  it('keeps only the latest load requested before editor readiness', () => {
    const bridge = createStudioDocumentBridge()
    const queryEditor = editor()
    const variableEditor = editor()
    bridge.setDocument({ query: 'first', variables: '{"first":true}' })
    bridge.setDocument({ query: 'second', variables: '' })
    bridge.attach({ queryEditor, variableEditor })
    assert.deepEqual(queryEditor.writes, ['second'])
    assert.deepEqual(variableEditor.writes, [''])
  })

  it('clears old query and variables when New query is requested before readiness', () => {
    const bridge = createStudioDocumentBridge()
    const queryEditor = editor('old query')
    const variableEditor = editor('{"old":true}')
    bridge.setDocument()
    bridge.attach({ queryEditor, variableEditor })
    assert.deepEqual(bridge.getDocument(), { query: '', variables: '' })
  })

  it('leaves remembered editor text alone without an explicit document load', () => {
    const bridge = createStudioDocumentBridge()
    const queryEditor = editor('remembered query')
    const variableEditor = editor('remembered variables')
    bridge.attach({ queryEditor, variableEditor })
    assert.deepEqual(queryEditor.writes, [])
    assert.deepEqual(variableEditor.writes, [])
    assert.deepEqual(bridge.getDocument(), { query: 'remembered query', variables: 'remembered variables' })
  })

  it('discards pending loads on unmount and ignores late attachments', () => {
    const bridge = createStudioDocumentBridge()
    const queryEditor = editor()
    const variableEditor = editor()
    bridge.setDocument({ query: 'stale', variables: '{}' })
    bridge.dispose()
    bridge.attach({ queryEditor, variableEditor })
    bridge.setDocument({ query: 'late' })
    assert.deepEqual(queryEditor.writes, [])
    assert.deepEqual(variableEditor.writes, [])
    assert.deepEqual(bridge.getDocument(), { query: '', variables: '' })
  })
})
