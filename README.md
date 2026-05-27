# radarr-mcp

MCP server that exposes [Radarr](https://radarr.video/) as tools for any MCP-compatible AI agent (Claude Desktop, Claude Code, Cursor, OpenClaw, Codex, etc.).

Two transports:
- **stdio** (default) — for local clients like Claude Desktop / Claude Code / Cursor
- **HTTP streamable** — for remote clients and in-network agents (e.g. `arr-agent` in docker-compose)

Switch via `MCP_TRANSPORT=stdio|http` (default `stdio`).

## Tools

| Tool | Purpose |
| --- | --- |
| `list_movies` | All movies in the library |
| `search_library` | Find movies by title fragment |
| `get_movie` | Full details for one movie |
| `lookup_movie` | TMDB lookup (not yet added) |
| `add_movie` | Add a movie by TMDB id |
| `delete_movie` | Remove movie (optionally with files) |
| `set_monitored` | Toggle monitoring |
| `change_quality` | Change quality profile |
| `trigger_search` | Force indexer search |
| `search_releases` | List available releases |
| `download_release` | Send release to download client |
| `get_queue` | Current download queue |
| `cancel_queue_item` | Remove from queue |
| `get_movie_history` | History entries for a movie |
| `get_missing_movies` | Monitored movies without files |
| `get_duplicates` | Movies with multiple file copies |
| `get_quality_profiles` | List quality profiles |
| `get_root_folders` | List root folders + free space |
| `get_tags` | List tags |
| `get_disk_space` | Disk space per volume |
| `get_system_status` | Radarr system info |
| `get_collection_stats` | Aggregate library stats |

## Setup

```bash
npm install
cp .env.example .env
# fill in RADARR_URL and RADARR_API_KEY
npm start
```

## Use with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "radarr": {
      "command": "node",
      "args": ["/absolute/path/to/radarr-mcp/src/index.js"],
      "env": {
        "RADARR_URL": "http://localhost:7878",
        "RADARR_API_KEY": "your-key"
      }
    }
  }
}
```

## Use with Claude Code

```bash
claude mcp add radarr -e RADARR_URL=http://localhost:7878 -e RADARR_API_KEY=your-key -- node /absolute/path/to/radarr-mcp/src/index.js
```

## HTTP mode

```bash
MCP_TRANSPORT=http MCP_PORT=3000 \
  RADARR_URL=http://localhost:7878 \
  RADARR_API_KEY=your-key \
  npm start
```

Verify handshake:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

## Docker

Dockerfile defaults to HTTP mode on port 3000.

```bash
docker build -t radarr-mcp .
docker run --rm -p 3000:3000 \
  -e RADARR_URL=http://radarr:7878 \
  -e RADARR_API_KEY=your-key \
  radarr-mcp
```

## Remote access (e.g. claude.ai)

Run in HTTP mode behind a reverse proxy / Cloudflare Tunnel and register the public HTTPS endpoint as a remote MCP in claude.ai.

## License

MIT
