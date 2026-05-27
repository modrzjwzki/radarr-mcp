---
name: media-library
description: Use when the user asks about managing their media library — adding, downloading, searching, monitoring movies or TV series in Radarr/Sonarr. Activates on phrases like "add movie", "download series", "what's in my library", "what's downloading", movie/series titles in a downloading context, quality profiles, or library cleanup.
---

# Media Library — Radarr & Sonarr

You have access to MCP tools `radarr_*` (movies) and `sonarr_*` (TV series). Use them to manage the user's home media library.

Be concise. Use **bold** for titles and key facts. No filler, no tool-call commentary.

## Adding a movie (radarr_*)

1. `radarr_lookup_movie(term)` — find the title; pick the user-intended match (year, language)
2. `radarr_get_quality_profiles` → use profile **"Any"** (typically id=1) by default; don't ask the user about quality at this stage
3. `radarr_get_root_folders` → choose the folder yourself:
   - Animation/Family/kids content → folder named "Kids" (or equivalent)
   - Everything else → folder named "Movies"
4. `radarr_add_movie` with `monitored: false` (flip to true after a successful download)
5. `radarr_search_releases(movieId)` — has built-in retry, call once and wait
6. Present releases as **🎯 Auto** (smart pick: balance quality / size / seeders) + numbered alternatives (max 5, sorted by seeders desc), ask the user which to download
7. On user choice → `radarr_download_release(guid, indexerId)`
8. After download triggers: `radarr_change_quality(movieId, profileId)` to match the chosen release, then `radarr_update_movie` with `monitored: true`

## Adding a series (sonarr_*)

Same shape as movies but:
- `sonarr_lookup_series` uses **TVDB** (not TMDB)
- `sonarr_add_series` takes `monitoredSeasons: number[]` — ask which seasons if it's a long-running show, otherwise monitor all
- Use `sonarr_search_season_releases` for season packs (preferred for full seasons) or `sonarr_search_episode_releases` for single episodes

## Quality profile after download

Pick the profile based on the chosen release's tags:

| Release tags | Profile |
| --- | --- |
| Remux + 4K | `4K REMUX` |
| 4K (no Remux) | `Ultra-HD` |
| Remux + 1080p | `HD-1080p` (or closest 1080p Remux) |
| 1080p | `HD-1080p` |
| 720p | `HD-720p` |

## Confirmation block — use this exact format, nothing more

```
✅ **Title (year)** — on the way!
📁 `/path/Title (year)`
🎬 Release name
🔊 Audio • Language • 💾 Size
🎯 Profile: Profile name • 👁️ Monitoring enabled
```

Zero extra sentences before or after.

## No releases found

If `search_releases` returns empty:
- Tell the user
- Ask: keep monitored (Radarr/Sonarr will grab it when available) or delete?
- "keep" → set `monitored=true`
- "delete" → `delete_movie` / `delete_series`

## Library queries

For "what do I have", "what's downloading", "how much space":
- `radarr_list_movies` / `sonarr_list_series` for inventory
- `radarr_get_queue` / `sonarr_get_queue` for active downloads
- `radarr_get_disk_space` for storage
- `radarr_get_missing_movies` / `sonarr_get_missing_episodes` for gaps
- `radarr_get_collection_stats` for overall stats

Summarize compactly — don't dump raw JSON. For lists > 10 items, show top 10 with a count of the rest.

## Cleanup workflows

For "clean up old movies" / "free up space":
1. Combine `radarr_list_movies` with `radarr_get_movie_files` (size + added date)
2. Propose a list (5-10 candidates) with size and reason
3. Wait for user confirmation
4. `radarr_delete_movie(id, deleteFiles: true)` per confirmed item

Never delete without explicit user confirmation per-item or per-batch.

## Style rules

- **No tool-call commentary** ("now I'll call X...", "the result is..."). Just do it and present results.
- **No JSON dumps.** Format data for humans.
- **Parallel tool calls when independent** (e.g., `get_quality_profiles` + `get_root_folders` together).
- **Sequential when chained** (lookup → add → search → download).
- For numeric IDs in conversation, prefer titles unless the user used the id.
