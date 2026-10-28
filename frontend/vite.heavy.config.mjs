// Plugin-local HEAVY build (Phase 304, GQL-05/D-14; Phase-303 SEAM-06 model).
//
// Builds the graphql-studio plugin's independently self-contained heavy payload
// (`plugins/graphql-studio/static/graphql-studio-heavy.js`) from the plugin's
// own `node_modules`/lockfile — never through a parent host `node_modules`
// fallback. The sibling registration bundle is produced by `vite.config.mjs`;
// both builds root at this directory and share the same host-singleton external
// list.
//
// Delivery contract for the heavy payload:
//   * one ES file, no hashed name, deterministic output path;
//   * every host singleton externalized BY IDENTITY (no second React/Router/
//     Query/plugin-api instance can enter the graph);
//   * every third-party CSS file in the graph inlined into the JS as an exported
//     string (never emitted as a sibling `.css` asset) and every `url()` font/
//     image reference inlined as a data URI, so the payload has zero sibling
//     chunk/CSS/worker/font requests;
//   * editor/JSON/GraphQL workers embedded with `?worker&inline` (no external
//     worker URL).
//
// `emptyOutDir` is deliberately false: the registration build runs first with
// `emptyOutDir: true` and clears `../static`, then this build adds the heavy
// output without deleting `graphql-studio.js`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { esmExternalRequirePlugin } from 'rolldown/plugins'

// Exact host singleton allow-list (frontend/index.html import map).
const HOST_SINGLETONS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'react-router',
  'react-router-dom',
  '@tanstack/react-query',
  '@indramesh/plugin-api',
]

const MIME_TYPES = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

// Rewrite relative `url(...)` references in a CSS file to base64 data URIs so
// the inlined CSS never triggers a sibling font/image request.
function inlineAssetUrls(cssText, cssDir) {
  return cssText.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/g,
    (full, doubleQuoted, singleQuoted, bare) => {
      const ref = doubleQuoted ?? singleQuoted ?? bare ?? ''
      if (!ref || /^(?:data:|https?:|\/\/|#)/i.test(ref)) return full
      const absolute = path.resolve(cssDir, ref.split(/[?#]/)[0])
      try {
        const bytes = readFileSync(absolute)
        const mime = MIME_TYPES[path.extname(absolute).toLowerCase()] || 'application/octet-stream'
        return `url("data:${mime};base64,${bytes.toString('base64')}")`
      } catch {
        // Leave an unresolvable reference intact; verify-bundle.mjs fails the
        // build if a non-data url() survives.
        return full
      }
    },
  )
}

// monaco-editor@0.52.2 vendors its own DOMPurify (3.1.7) inside its ESM tree
// and imports it relatively, so a plain rebuild keeps shipping that stale copy.
// monaco-graphql@1.9.0 peer-declares monaco-editor < 0.53, so Monaco cannot be
// bumped here — instead every resolved id pointing at the vendored file is
// redirected to the local shim, which re-exports the app's fixed `dompurify`
// package (default plus Monaco's named bindings).
const MONACO_DOMPURIFY_SUFFIX = 'monaco-editor/esm/vs/base/browser/dompurify/dompurify.js'
const DOMPURIFY_SHIM = path.resolve(import.meta.dirname, 'dompurify-shim.mjs')

function replaceMonacoDompurify() {
  return {
    name: 'indramesh-plugin-monaco-dompurify-shim',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.includes('dompurify')) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved || !resolved.id.replace(/\\/g, '/').endsWith(MONACO_DOMPURIFY_SUFFIX)) {
        return null
      }
      return DOMPURIFY_SHIM
    },
  }
}

const VIRTUAL_PREFIX = '\0indramesh-heavy-css:'

// Every `.css` module in the graph is converted to a JS module that exports its
// (asset-inlined) CSS text and registers it on a build-scoped collector. The
// heavy entry reads the collector and exposes it for the host's
// `injectPluginStyles`; nothing is injected globally by the build itself.
function inlineHeavyCss() {
  return {
    name: 'indramesh-plugin-inline-heavy-css',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source.includes('?') || !source.endsWith('.css')) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved) return null
      return VIRTUAL_PREFIX + Buffer.from(resolved.id, 'utf-8').toString('base64url')
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null
      const file = Buffer.from(id.slice(VIRTUAL_PREFIX.length), 'base64url').toString('utf-8')
      let raw
      try {
        raw = readFileSync(file, 'utf-8')
      } catch {
        return null
      }
      const css = inlineAssetUrls(raw, path.dirname(file))
      return {
        code: [
          `const cssText = ${JSON.stringify(css)};`,
          ';(globalThis.__indrameshHeavyCss ||= []).push(cssText);',
          'export default cssText;',
        ].join('\n'),
      }
    },
  }
}

export default {
  root: import.meta.dirname,
  plugins: [
    replaceMonacoDompurify(),
    inlineHeavyCss(),
    // D-14/SEAM-06: bundled CommonJS dependencies (the interactive editor and
    // editor-language stack) call `require("react")` etc. at runtime. In an
    // ES-module payload loaded as a Blob there is no `require`, so Rolldown's
    // default passthrough throws ("Calling `require` for \"react\" ..."). This
    // built-in plugin converts `require(<external>)` into an ESM `import` of the
    // host singleton and MUST own the external list itself (Rolldown's
    // documented contract) — hence the host singletons are declared here, not in
    // rollupOptions.external.
    esmExternalRequirePlugin({ external: HOST_SINGLETONS }),
  ],
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  // Bundled CJS deps read `process.env.NODE_ENV` (and the odd `process.env.*`).
  // The Blob ES-module runs in the browser, where `process` does not exist, so
  // these must be replaced at build time (SEAM-06: production payload).
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': '({})',
  },
  build: {
    target: 'esnext',
    lib: {
      entry: 'studio-editor-heavy.jsx',
      formats: ['es'],
      fileName: () => 'graphql-studio-heavy.js',
    },
    outDir: '../static',
    // Registration build owns cleanup; this build must not delete
    // graphql-studio.js.
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      // `external: HOST_SINGLETONS` is intentionally NOT set here: the host
      // singletons are owned by esmExternalRequirePlugin above (Rolldown
      // requires the converting plugin to list them, not the top-level build).
      // Single self-contained file: inline every dynamic import (Monaco's
      // language contributions and the editor's lazy integration) instead of
      // emitting sibling chunks.
      output: { codeSplitting: false },
    },
  },
}