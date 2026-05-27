# radarr-mcp

MCP server exposing [Radarr](https://radarr.video/) as tools for any MCP-compatible AI client — Claude Desktop, Claude Code, Cursor, Codex, or your own agent.

Talk to your movie library in natural language: *"add Dune Part Two in 4K"*, *"what's downloading?"*, *"delete movies I haven't watched in a year"*. The AI picks the right tools, chains them, and reports back.

## Features

- **34 tools** covering library, search, queue, releases, files, calendar, health, and stats
- **Two transports**: stdio (default — local AI clients) and HTTP streamable (remote agents, docker-compose)
- **Stateless HTTP** — a fresh server instance per request, safe for concurrent calls
- **No magic defaults** — root folders, quality profiles, tags are all looked up via dedicated tools, never hardcoded

## Tools

### Library
| Tool | Purpose |
| --- | --- |
| `list_movies` | All movies in the library |
| `search_library` | Find movies by title fragment |
| `get_movie` | Full details for one movie |
| `lookup_movie` | TMDB lookup (before adding) |
| `add_movie` | Add by TMDB id |
| `delete_movie` | Remove movie (optionally with files) |
| `refresh_movie` | Refresh metadata from TMDB |
| `set_monitored` | Toggle monitoring |
| `change_quality` | Change quality profile |
| `set_movie_tags` | Replace tags on a movie |
| `get_movie_files` | List physical files for a movie |
| `delete_movie_file` | Delete a specific file |

### Search & download
| Tool | Purpose |
| --- | --- |
| `trigger_search` | Force indexer search |
| `search_releases` | List available releases with built-in retry |
| `download_release` | Send release to download client |
| `get_queue` | Current download queue |
| `cancel_queue_item` | Remove from queue |
| `get_manual_import` | Inspect files awaiting manual import |
| `process_manual_import` | Approve / commit a manual import |
| `get_blocklist` | Blocked releases |

### Insights
| Tool | Purpose |
| --- | --- |
| `get_movie_history` | History for a movie |
| `get_missing_movies` | Monitored movies without files |
| `get_duplicates` | Movies with multiple file copies |
| `get_wanted_cutoff` | Movies below quality cutoff |
| `get_calendar` | Upcoming theatrical / digital releases |
| `get_credits` | Cast & crew for a movie |
| `get_collections` | TMDB collections |
| `get_collection_stats` | Aggregate library stats |
| `get_health` | Radarr health issues |

### System
| Tool | Purpose |
| --- | --- |
| `get_quality_profiles` | List quality profiles |
| `get_root_folders` | Root folders + free space |
| `get_tags` | List tags |
| `get_disk_space` | Disk space per volume |
| `get_system_status` | Radarr system info |

## Setup

```bash
git clone https://github.com/<your-handle>/radarr-mcp
cd radarr-mcp
npm install
RADARR_URL=http://localhost:7878 RADARR_API_KEY=your-key npm start
```

Get your API key from Radarr → Settings → General → Security.

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop. The `radarr` server should appear in the tools menu.

## Claude Code

```bash
claude mcp add radarr \
  -e RADARR_URL=http://localhost:7878 \
  -e RADARR_API_KEY=your-key \
  -- node /absolute/path/to/radarr-mcp/src/index.js
```

## HTTP mode

For remote agents, docker-compose, or claude.ai remote MCPs:

```bash
MCP_TRANSPORT=http MCP_PORT=3000 \
  RADARR_URL=http://localhost:7878 \
  RADARR_API_KEY=your-key \
  npm start
```

Verify the handshake:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

## Docker

The included `Dockerfile` runs HTTP mode on port 3000:

```bash
docker build -t radarr-mcp .
docker run --rm -p 3000:3000 \
  -e RADARR_URL=http://radarr:7878 \
  -e RADARR_API_KEY=your-key \
  radarr-mcp
```

Or compose:

```yaml
services:
  radarr-mcp:
    build: ./radarr-mcp
    environment:
      RADARR_URL: http://radarr:7878
      RADARR_API_KEY: ${RADARR_API_KEY}
    ports:
      - "3000:3000"
```

## Remote access via claude.ai

Run HTTP mode behind a reverse proxy (nginx, Caddy) or Cloudflare Tunnel, then register the public HTTPS endpoint as a remote MCP in claude.ai → Settings → Connectors.

## Claude Skill (optional)

A ready-to-use [Claude Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) lives in [`examples/claude-skill/`](./examples/claude-skill/). It teaches Claude how to chain these tools into clean add-movie / search / download / cleanup flows. Drop it into `~/.claude/skills/media-library/` and Claude Code picks it up automatically.

## Configuration

| Env var | Required | Default | Description |
| --- | --- | --- | --- |
| `RADARR_URL` | yes | — | Base URL of your Radarr instance |
| `RADARR_API_KEY` | yes | — | Radarr API key |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http` |
| `MCP_PORT` | no | `3000` | HTTP port (only when transport=http) |

## Project layout

```
src/
  radarr.js   ← thin Radarr v3 REST client, no MCP concerns
  index.js    ← MCP server bootstrap, tool registration, transport selection
Dockerfile
package.json
```

Adding a tool: extend `RadarrClient` in `radarr.js`, then register it inside `createServer()` in `index.js`.

## License

MIT
