# graphql-studio plugin

The **interactive GraphQL studio** for IndraMesh Core: a GraphiQL/Monaco editor page plus a Tools
nav item for the Core GraphQL API.

## Install

The plugin is distributed as its own repository and installed into a running IndraMesh Core stack.
**Requires IndraMesh Core 1.0.0 or later** (plugin API `1.0.0`). It is a read-only mirror of the
maintainer's develop repository, so it is **not standalone buildable** today — the plugin SDK ships
in a later release; the committed bundles in this repository are the supported distribution format.

**Compose stack** — from the Core checkout root:

```bash
./install_plugin_docker.sh https://github.com/weboliver/indramesh-plugin-graphql-studio
```

The script clones the repository, copies the plugin to `<core>/plugins/graphql-studio` and restarts
`backend` and `worker` so the plugin registry re-scans. The destination directory name comes from
the plugin's own manifest; a second argument overrides it only if you deliberately want a different
name. The same command accepts a local directory instead of the URL.

**Local k3s stack** — from the Core checkout root, with a kubeconfig for the cluster
(`KUBECONFIG=$HOME/.kube/config` when it is not already at the default location):

```bash
./install_plugin_k8s.sh https://github.com/weboliver/indramesh-plugin-graphql-studio
```

The script copies the plugin directory onto the plugins PVC and restarts `backend` and `worker`.

A URL source accepts an optional ref (tag or branch) as a further argument; without one the default
branch is installed.

**Manual equivalent:** copy the plugin directory to `<core>/plugins/graphql-studio` yourself and
restart `backend` **and** `worker`. Plugin discovery runs exactly once at process startup — there
is no live filesystem watch — so both processes must be restarted before the plugin is registered.

**Replacing an installed plugin:** both installers refuse an existing destination and neither offers
a way around that refusal. An installed plugin is replaced by removing its directory deliberately
first — `plugins/graphql-studio` in a Compose checkout, the plugin's directory on the plugins PVC on
Kubernetes — and installing again. See **Installing and Updating Plugins** in the Core README for the removal commands, including the writable helper pod for the k3s case.

## Purpose

The studio is the developer-facing way to explore and query IndraMesh Core's GraphQL API from the
browser: an editor page with schema introspection, live queries and saved-query load/save. The
plugin owns only the editor. The GraphQL endpoint (`/api/v1/graphql`), the saved-queries table,
every `saved-queries:*` permission and query execution stay Core; the studio calls them through the
Core REST `/saved-queries` endpoints and the GraphQL endpoint.

- Manifest: `plugin.toml` (`capabilities = []`, `active_by_default = false`,
  `enables_http_graphql = true`).
- Backend: `module.py` — a deliberately capability-free `IndraMeshPlugin` (load/unload, health
  check). It owns no Core route, no table and no database branch.
- Frontend: `frontend/index.jsx` (registration bundle) and the deferred heavy editor payload.
- Committed artifacts: `static/graphql-studio.js` (registration) and
  `static/graphql-studio-heavy.js` (heavy editor).

## Permissions

| Permission | Default roles | Purpose |
|---|---|---|
| `graphql-studio:use` | Administrator, Editor | Open and use the GraphQL Studio plugin page. |

Declared in `plugin.toml` (`[[permissions]]`); granted insert-only on first discovery. The plugin
re-declares no Core permission — saving and executing saved queries keeps its Core rights.

## Configuration

- **No `[config_schema]`** — the plugin reads no plugin configuration.
- **Production GraphQL gate (manifest-driven, not configured):** `enables_http_graphql = true`
  makes Core's per-request gate serve `/api/v1/graphql` in production **only while this plugin is
  active**. Deactivating the plugin hides the endpoint in production (a non-production stack is
  unchanged). Core reads only the boolean and never names a plugin.
- **Installed does not mean active:** the manifest declares `active_by_default = false`, so a fresh
  installation is listed but stays inactive; an administrator activates it deliberately, and only
  that activation opens `/api/v1/graphql` on a production stack. Updating or reinstalling never
  deactivates an existing active studio — the manifest default applies on first discovery only. If
  you do not need the studio on a production instance, deactivate it once.
- **Integration surface:** `/public/api/v1/graphql` is the public integration endpoint and does not
  depend on this plugin; the plugin owns only the editor for the internal `/api/v1/graphql`.
- No env key, secret, LLM requirement or network change is added by this plugin.

## Task types

None — `capabilities = []`; the plugin publishes no task type, no connector and no job. Saved-query
validation stays Core.

## Frontend

- **Registration bundle** `static/graphql-studio.js`: one page plus the Tools nav item
  (`extension_points = ["pages", "navItems"]`).
- **Deferred heavy payload** `static/graphql-studio-heavy.js`, declared under
  `[frontend.deferred_assets]` as `studio`: fetched only on explicit navigation through Core's
  deferred-module contract, so Monaco and GraphiQL never load at login. A failed heavy fetch is
  fail-closed (the host page stays usable, the editor does not silently half-load).
- **Saved-query integration:** the editor page loads and saves queries through the Core
  `/saved-queries` REST endpoints and executes them against `/api/v1/graphql`; the plugin stores
  no query of its own.
- **Delivery:** the standard plugin mount (`/api/v1/plugins/graphql-studio/assets/<bundle>`) over
  the read-only `./plugins` mount (Compose) or the plugins PVC (k8s). Plugin discovery runs once at
  process start — restart `backend` **and** `worker` after changing the plugin directory.
- **Pin parity:** the plugin's frontend dependency map is pinned to a deliberate, audited version
  set (the versions in `frontend/package.json`); a dependency upgrade re-audits the set rather than
  bumping a literal in isolation.

## License

Apache-2.0 — see [`LICENSE`](LICENSE).

The registration bundle carries no third-party runtime dependency. The committed heavy payload
`static/graphql-studio-heavy.js` bundles third-party MIT-licensed code (Monaco, GraphiQL,
graphql-js and their transitive dependencies); the bundled notices are recorded in
[`static/THIRD-PARTY-LICENSES`](static/THIRD-PARTY-LICENSES).

## Status

This repository is a **read-only mirror** of the private develop repository: it is regenerated
from the Core source tree at release time, so issues and pull requests are applied upstream by
hand rather than merged here.
