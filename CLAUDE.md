# radarr-mcp — Claude guidance

MCP server that exposes Radarr as tools. Standalone repo, also consumed by `../arr-agent/` over HTTP in the arr-stack docker-compose.

See `../ARCHITECTURE.md` for the bigger picture.

## Code map

- `src/radarr.js` — thin Radarr v3 REST client (`RadarrClient`). No MCP concerns.
- `src/index.js` — bootstrap. `createServer()` registers all tools on a fresh `McpServer`. Bottom branch chooses stdio (default) or HTTP transport from `MCP_TRANSPORT` env.

## Invariants

- **stdio must keep working.** It's the default for local AI clients (Claude Desktop, Cursor). Never make HTTP a hard requirement.
- **One `createServer()` per HTTP request.** Stateless mode — don't share a single McpServer instance across HTTP requests; the SDK isn't reentrant on `server.connect()`.
- **Tool names are stable.** External clients (arr-agent, Claude Desktop configs) reference them. Renaming = breaking change.
- **No assumptions about root folder paths or quality profile ids.** Tools take them as arguments; lookups are exposed via `get_root_folders` and `get_quality_profiles`.

## Adding a tool

1. Add the method to `RadarrClient` in `src/radarr.js`.
2. Add `server.tool(name, description, zodSchema, handler)` inside `createServer()` in `src/index.js`. Return shape: `ok({...})` (helper at top of file).
3. Mention it in the README tools table.

## Env

- `RADARR_URL`, `RADARR_API_KEY` — required.
- `MCP_TRANSPORT=stdio|http` (default `stdio`).
- `MCP_PORT` (default `3000` for HTTP).

## Smoke test

```bash
# stdio
RADARR_URL=http://x RADARR_API_KEY=y node -e "import('./src/index.js').then(()=>setTimeout(()=>process.exit(0),500))"

# http
MCP_TRANSPORT=http MCP_PORT=3000 RADARR_URL=http://x RADARR_API_KEY=y node src/index.js
# then POST to /mcp with initialize handshake
```
