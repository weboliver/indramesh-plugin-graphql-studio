#!/usr/bin/env node
/**
 * Build-output inspection for the graphql-studio plugin heavy payload
 * (Phase 304, GQL-05/D-14; Phase-303 SEAM-06 model, review correction R06-3).
 *
 * Fails the build unless `plugins/graphql-studio/static/graphql-studio-heavy.js`
 * is a single self-contained ES file that:
 *   * imports ONLY the host singletons, externalized by identity;
 *   * makes no blob-relative sibling chunk/CSS/worker/font request;
 *   * embeds its workers inline (no external worker URL);
 *   * has a default export; and
 * while the sibling registration bundle stays lightweight (no heavy markers).
 *
 * The detector is self-tested at startup: it must flag a synthetic non-host
 * import and a synthetic relative dynamic import, and must NOT flag a host-only
 * module. A regression in the detector therefore fails the build too.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = import.meta.dirname
const STATIC_DIR = path.resolve(HERE, '..', 'static')
const HEAVY_FILE = path.join(STATIC_DIR, 'graphql-studio-heavy.js')
const REGISTRATION_FILE = path.join(STATIC_DIR, 'graphql-studio.js')

// The exact host singleton allow-list (frontend/index.html import map). Keep in
// sync with both vite.config.mjs and vite.heavy.config.mjs.
export const HOST_SINGLETONS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'react-router',
  'react-router-dom',
  '@tanstack/react-query',
  '@indramesh/plugin-api',
]
const HOST_SET = new Set(HOST_SINGLETONS)

// Static `import ... from`, bare `import "..."`, `export ... from`, and literal
// dynamic `import("...")` specifiers. Line/quote anchoring keeps library strings
// that merely contain the word "from" from being treated as imports.
const IMPORT_SPECIFIER_PATTERNS = [
  /^[ \t]*import\s+[^;\n]*?\bfrom\s+["']([^"']+)["']/gm,
  /^[ \t]*import\s+["']([^"']+)["']/gm,
  /^[ \t]*export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
]

// A default export must survive the build.
const DEFAULT_EXPORT_RE = /\bas\s+default\b/

// Evidence that at least one worker was embedded inline rather than emitted as a
// sibling file.
const INLINE_WORKER_RE = /Worker\(/
const INLINE_WORKER_EVIDENCE_RE = /createObjectURL|data:text\/javascript/

// Markers that must never appear in the lightweight registration bundle.
const HEAVY_MARKERS = ['monaco', 'graphiql', 'codicon']

// `vite.heavy.config.mjs` redirects Monaco's vendored DOMPurify (3.1.7 in
// monaco-editor 0.52.2) onto dompurify-shim.mjs, i.e. the app's fixed package.
// Every DOMPurify release stamps its version immediately before `removed`; that
// pair identifies the embedded sanitiser in the minified payload.
const EMBEDDED_SANITIZER_VERSION_RE =
  /[\w$]+\.version\s*=\s*["'](\d+\.\d+\.\d+)["']\s*[,;]\s*[\w$]+\.removed\s*=\s*\[\]/g

const VIOLATION_PATTERNS = [
  { label: 'external font/image URL', re: /url\(\s*["']?(?:\.\.?\/)[^)"']*["']?\s*\)/g },
  { label: 'external font/image URL', re: /url\(\s*["']?\/[^)"']*["']?\s*\)/g },
  { label: 'external font/image URL', re: /url\(\s*["']?https?:[^)"']*["']?\s*\)/g },
  { label: 'CSS @import', re: /@import\b/g },
  { label: 'blob-relative sibling resolution', re: /import\s*\(\s*["']\.\.?\//g },
  { label: 'blob-relative sibling resolution', re: /import\.meta\.url/g },
  { label: 'blob-relative sibling resolution', re: /new\s+URL\s*\(\s*["']\.\.?\//g },
  { label: 'external worker URL', re: /new\s+Worker\s*\(\s*["'](?!data:|blob:)[^"']*["']/g },
]

/**
 * Returns the list of contract violations found in a heavy-payload source
 * string. Exported so the detector can be exercised directly.
 */
export function findViolations(code) {
  const violations = []
  for (const re of IMPORT_SPECIFIER_PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(code)) !== null) {
      if (!HOST_SET.has(match[1])) {
        violations.push(`non-host runtime import: ${match[1]}`)
      }
    }
  }
  for (const { label, re } of VIOLATION_PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(code)) !== null) {
      violations.push(`${label}: ${match[0].slice(0, 80)}`)
    }
  }
  return violations
}

/**
 * Returns every embedded DOMPurify version marker found in a heavy-payload
 * source string. Exported so the detector can be exercised directly.
 */
export function findEmbeddedSanitizerVersions(code) {
  const versions = []
  EMBEDDED_SANITIZER_VERSION_RE.lastIndex = 0
  let match
  while ((match = EMBEDDED_SANITIZER_VERSION_RE.exec(code)) !== null) {
    versions.push(match[1])
  }
  return versions
}

/** Numeric dotted-triplet comparison: negative when a < b. */
export function compareVersions(a, b) {
  const left = String(a).split('.').map(Number)
  const right = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Version of the dompurify package this directory resolves (the build floor). */
function resolvedSanitizerVersion() {
  const manifest = path.join(HERE, 'node_modules', 'dompurify', 'package.json')
  if (!existsSync(manifest)) return null
  return JSON.parse(readFileSync(manifest, 'utf8')).version
}

function assertDetector() {
  const nonHost = 'import evil from "left-pad";\nexport default evil;\n'
  if (!findViolations(nonHost).some((v) => v.includes('left-pad'))) {
    throw new Error('detector self-test: a non-host import was NOT detected')
  }
  const relative = 'const lazy = () => import("./sibling-chunk.js");\n'
  if (!findViolations(relative).some((v) => v.includes('sibling-chunk'))) {
    throw new Error('detector self-test: a relative dynamic import was NOT detected')
  }
  const hostOnly = 'import { useState } from "react";\nexport default useState;\n'
  const falsePositives = findViolations(hostOnly)
  if (falsePositives.length > 0) {
    throw new Error(`detector self-test: false positive on a host import: ${falsePositives.join('; ')}`)
  }
  const staleSanitizer = 'function f(){ if (t.version = "3.1.7", t.removed = [], !window) return t; }\n'
  if (!findEmbeddedSanitizerVersions(staleSanitizer).includes('3.1.7')) {
    throw new Error('detector self-test: an embedded sanitiser version was NOT detected')
  }
  if (compareVersions('3.1.7', '3.4.17') >= 0) {
    throw new Error('detector self-test: version comparison does not order 3.1.7 below 3.4.17')
  }
}

function main() {
  const problems = []
  try {
    assertDetector()
  } catch (error) {
    console.error('verify-bundle: FAILED')
    console.error(` - ${error.message}`)
    process.exit(1)
  }

  if (!existsSync(HEAVY_FILE)) problems.push(`missing heavy output: ${HEAVY_FILE}`)
  if (!existsSync(REGISTRATION_FILE)) problems.push(`missing registration output: ${REGISTRATION_FILE}`)

  if (existsSync(STATIC_DIR)) {
    const cssFiles = readdirSync(STATIC_DIR).filter((name) => name.endsWith('.css'))
    if (cssFiles.length > 0) problems.push(`separate CSS asset(s) emitted: ${cssFiles.join(', ')}`)
  }

  if (existsSync(HEAVY_FILE)) {
    const code = readFileSync(HEAVY_FILE, 'utf8')
    problems.push(...findViolations(code).map((violation) => `heavy payload: ${violation}`))
    if (!DEFAULT_EXPORT_RE.test(code)) problems.push('heavy payload has no default export')
    if (!INLINE_WORKER_RE.test(code) || !INLINE_WORKER_EVIDENCE_RE.test(code)) {
      problems.push('heavy payload has no inline worker evidence')
    }
    // The embedded sanitiser must be at least the app's fixed release: a stale
    // copy (e.g. Monaco's vendored 3.1.7) fails the build instead of shipping.
    const expectedSanitizer = resolvedSanitizerVersion()
    if (!expectedSanitizer) {
      problems.push('cannot resolve dompurify version from node_modules/dompurify/package.json')
    }
    const embeddedSanitizers = findEmbeddedSanitizerVersions(code)
    if (embeddedSanitizers.length === 0) {
      problems.push('heavy payload embeds no sanitizer version marker')
    }
    if (expectedSanitizer) {
      for (const embedded of embeddedSanitizers) {
        if (compareVersions(embedded, expectedSanitizer) < 0) {
          problems.push(
            `heavy payload embeds stale sanitizer ${embedded} (resolved dompurify ${expectedSanitizer})`,
          )
        }
      }
    }
  }

  if (existsSync(REGISTRATION_FILE)) {
    const registration = readFileSync(REGISTRATION_FILE, 'utf8').toLowerCase()
    for (const marker of HEAVY_MARKERS) {
      if (registration.includes(marker)) {
        problems.push(`registration bundle leaked heavy marker: ${marker}`)
      }
    }
  }

  if (problems.length > 0) {
    console.error('verify-bundle: FAILED')
    for (const problem of problems) console.error(` - ${problem}`)
    process.exit(1)
  }

  console.log(
    'verify-bundle: OK — self-contained heavy payload (host-only imports, inline workers, no sibling assets, sanitizer ' +
      `${findEmbeddedSanitizerVersions(readFileSync(HEAVY_FILE, 'utf8')).join(', ')})`,
  )
}

// Run only when invoked directly (`node verify-bundle.mjs`), so the detector
// can be imported and unit-exercised without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}