# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-11-09

### Changed

- A fresh installation is inactive until an administrator activates it, so installing the plugin no longer opens the internal `/api/v1/graphql` endpoint on a production instance by itself. Existing installations stay active; if you do not need the studio on a production instance, deactivate it once.

## [1.0.0] - 2026-11-01

The initial public release of the GraphQL Studio plugin.

### Added

- An editor page with schema introspection and live queries for exploring the Core GraphQL API from the browser, with a Tools nav item.
- Saved-query load and save from the editor, using the Core saved-query endpoints and the caller's own permissions.
- Activating the plugin is what serves the HTTP GraphQL endpoint in a production deployment; deactivating it hides the endpoint again.

**Compatibility:** plugin version 1.0.0 requires IndraMesh Core 1.0.0.
It declares `api_version` 1.0.0.
