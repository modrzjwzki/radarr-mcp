# Claude Skill — `media-library`

A drop-in [Claude Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) that teaches Claude how to use `radarr-mcp` (and optionally `sonarr-mcp`) effectively — when to add movies/series, which quality profile to pick, how to format release lists, etc.

Without the skill: Claude sees 34 raw tools and figures it out turn-by-turn.
With the skill: Claude follows your library's conventions, asks the right questions, returns concise answers.

## Install — Claude Code

```bash
mkdir -p ~/.claude/skills/media-library
cp SKILL.md ~/.claude/skills/media-library/SKILL.md
```

The skill activates automatically in any Claude Code session where `radarr_*` (or `sonarr_*`) tools are available.

## Install — Claude Desktop / claude.ai Projects

Claude Desktop doesn't load `~/.claude/skills/` directly. Two options:

1. **Custom instructions on a Project** — copy the body of `SKILL.md` (everything below the `---` frontmatter) into a Project's custom instructions on claude.ai
2. **Pin to a Claude Desktop conversation** — paste it as the first system message of a long-running chat

## What it covers

- Adding a movie / series end-to-end (lookup → profile → folder → add → search → download → upgrade profile → monitor)
- Smart quality profile selection from release tags (Remux/4K/1080p/etc.)
- Folder routing (kids content → Bajki/Kids folder, otherwise → Movies)
- Confirmation block format
- Empty-result handling
- Library query patterns (queue, missing, disk space, duplicates)
- Cleanup workflows with explicit confirmation gates

## Customise

The defaults in `SKILL.md` assume:
- Polish-language responses
- Quality profiles named like `4K REMUX`, `Ultra-HD`, `HD-1080p`
- Root folders named `Movies` / `Filmy` and `Bajki` / `Kids`

Edit the file to match your Radarr/Sonarr setup. Skills are plain markdown — no build step.
