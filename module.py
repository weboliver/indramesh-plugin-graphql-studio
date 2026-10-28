"""The graphql-studio plugin module (Phase 304, GQL-05/GQL-06).

A deliberately capability-free :class:`IndraMeshPlugin`: this plugin owns no
backend capability, no database metadata and no Core permission beyond its own
``graphql-studio:use``. It contributes a frontend page plus a Tools nav item
(the interactive studio), and its manifest sets ``enables_http_graphql = true``
so the Core per-request gate unlocks ``/api/v1/graphql`` in production while the
plugin is active (D-15/D-16).

The plugin never owns the saved-queries table: saved queries stay Core
(Carry-06), and the studio loads/saves them through the Core REST
``/saved-queries`` endpoints. Live queries run against ``/api/v1/graphql``.
"""

from indramesh.sdk import IndraMeshPlugin


class GraphqlStudioPlugin(IndraMeshPlugin):
    """The directory-scanned, capability-free graphql-studio plugin (GQL-05)."""

    async def on_load(self, ctx):
        ctx.logger.info("graphql-studio plugin loaded")
        return None

    async def on_unload(self, ctx):
        ctx.logger.info("graphql-studio plugin unloaded")
        return None

    async def health_check(self, ctx):
        return True