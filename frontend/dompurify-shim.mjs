/**
 * Build-time stand-in for the DOMPurify copy vendored inside
 * `monaco-editor@0.52.2` (`esm/vs/base/browser/dompurify/dompurify.js`, which
 * reports version 3.1.7).
 *
 * `vite.heavy.config.mjs` maps every import of that vendored path onto this
 * module, so the heavy payload embeds the application's fixed DOMPurify release
 * instead of shipping a second, stale sanitiser. Monaco imports the file both as
 * a namespace (`import * as dompurify from './dompurify/dompurify.js'`) and via
 * a named binding (`import { sanitize } from ...`), while the app package's ESM
 * build exposes only a default export — hence the explicit named re-exports,
 * mirroring Monaco's own export surface exactly.
 *
 * `verify-bundle.mjs` asserts that the embedded sanitiser version is not older
 * than the `dompurify` version resolved in this directory.
 */
import DOMPurify from 'dompurify'

export default DOMPurify

export const version = DOMPurify.version
export const isSupported = DOMPurify.isSupported
export const sanitize = DOMPurify.sanitize
export const setConfig = DOMPurify.setConfig
export const clearConfig = DOMPurify.clearConfig
export const isValidAttribute = DOMPurify.isValidAttribute
export const addHook = DOMPurify.addHook
export const removeHook = DOMPurify.removeHook
export const removeHooks = DOMPurify.removeHooks
export const removeAllHooks = DOMPurify.removeAllHooks
