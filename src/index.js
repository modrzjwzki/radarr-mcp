#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RadarrClient } from "./radarr.js";

const RADARR_URL = process.env.RADARR_URL;
const RADARR_API_KEY = process.env.RADARR_API_KEY;
const TRANSPORT = process.env.MCP_TRANSPORT || "stdio";
const PORT = parseInt(process.env.MCP_PORT || "3000", 10);

if (!RADARR_URL || !RADARR_API_KEY) {
  console.error("Missing RADARR_URL or RADARR_API_KEY");
  process.exit(1);
}

const radarr = new RadarrClient(RADARR_URL, RADARR_API_KEY);

const toGb = (bytes) => (bytes ? (bytes / 1073741824).toFixed(2) : "0");

const movieSummary = (m) => ({
  id: m.id,
  tmdbId: m.tmdbId,
  imdbId: m.imdbId,
  title: m.title,
  year: m.year,
  monitored: m.monitored,
  hasFile: m.hasFile,
  qualityProfileId: m.qualityProfileId,
  sizeGb: toGb(m.sizeOnDisk),
  genres: m.genres || [],
  added: m.added,
  path: m.path,
});

const ok = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const err = (message) => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

function parseTorrentTags(title) {
  const t = title.toUpperCase();
  const tags = [];
  if (t.includes("REMUX")) tags.push("Remux");
  if (t.includes("2160P") || t.includes("UHD") || t.includes("4K")) tags.push("4K");
  else if (t.includes("1080P")) tags.push("1080p");
  else if (t.includes("720P")) tags.push("720p");
  if (t.includes("DOVI") || t.includes("DOV") || t.includes("DOLBY.VISION") || t.includes("DOLBYVISION") || /[.\-\s]DV[.\-\s]/.test(t)) tags.push("Dolby Vision");
  if (t.includes("HDR10+")) tags.push("HDR10+");
  else if (t.includes("HDR")) tags.push("HDR");
  if (t.includes("ATMOS")) tags.push("Atmos");
  else if (t.includes("TRUEHD")) tags.push("TrueHD");
  else if (t.includes("DTS-HD") || t.includes("DTSHD")) tags.push("DTS-HD");
  else if (t.includes("DTS")) tags.push("DTS");
  if (t.includes("HEVC") || t.includes("X265") || t.includes("H.265") || t.includes("H265")) tags.push("HEVC");
  else if (t.includes("X264") || t.includes("H.264") || t.includes("H264") || t.includes("AVC")) tags.push("AVC");
  if (t.includes("PLDUB") || t.includes("PL.DUB")) tags.push("PL Dubbing");
  else if (t.includes("PL.DUAL") || t.includes("PLDUAL") || t.includes("MULTI")) tags.push("PL + Oryginał");
  else if (/[.\-]PL[.\-]/.test(t)) tags.push("PL");
  return tags;
}

function createServer() {
  const server = new McpServer({
    name: "radarr-mcp",
    version: "0.1.0",
  });

server.tool(
  "list_movies",
  "List all movies in the Radarr library. Optional filters: year, downloaded (has file), genres (comma-separated, case-insensitive).",
  {
    year: z.number().int().optional(),
    downloaded: z.boolean().optional(),
    genres: z.string().optional().describe("Comma-separated genres, e.g. 'Action,Drama'"),
  },
  async ({ year, downloaded, genres } = {}) => {
    let movies = await radarr.getAllMovies();
    if (year !== undefined) movies = movies.filter((m) => m.year === year);
    if (downloaded !== undefined) movies = movies.filter((m) => m.hasFile === downloaded);
    if (genres) {
      const wanted = genres.split(",").map((g) => g.trim().toLowerCase());
      movies = movies.filter((m) =>
        (m.genres || []).some((g) => wanted.includes(g.toLowerCase()))
      );
    }
    return ok(movies.map(movieSummary));
  }
);

server.tool(
  "search_library",
  "Search the Radarr library for movies matching a title query",
  { query: z.string().describe("Title fragment to search for") },
  async ({ query }) => {
    const movies = await radarr.findMovieByTitle(query);
    return ok(movies.map(movieSummary));
  }
);

server.tool(
  "get_movie",
  "Get full details for a single movie by Radarr id",
  { movieId: z.number().int() },
  async ({ movieId }) => ok(await radarr.getMovie(movieId))
);

server.tool(
  "lookup_movie",
  "Look up a movie on TMDB (via Radarr) by free text term. Returns candidates with tmdbId. Not yet added to library.",
  { term: z.string().describe("Free text query, e.g. movie title or 'tmdb:603'") },
  async ({ term }) => {
    const results = await radarr.lookupByTerm(term);
    return ok(
      (results || []).map((m) => ({
        tmdbId: m.tmdbId,
        title: m.title,
        originalTitle: m.originalTitle,
        year: m.year,
        overview: m.overview,
        runtime: m.runtime,
        genres: m.genres,
        ratings: m.ratings,
        posterUrl: m.images?.find((i) => i.coverType === "poster")?.remoteUrl,
      }))
    );
  }
);

server.tool(
  "add_movie",
  "Add a movie to Radarr by TMDB id. Requires qualityProfileId and rootFolderPath (use get_quality_profiles / get_root_folders first).",
  {
    tmdbId: z.number().int(),
    qualityProfileId: z.number().int(),
    rootFolderPath: z.string().describe("Absolute path, e.g. /data/Movies"),
    monitored: z.boolean().optional().default(true),
    searchOnAdd: z.boolean().optional().default(false),
    tags: z.array(z.number().int()).optional().default([]),
  },
  async (args) => ok(await radarr.addMovie(args))
);

server.tool(
  "delete_movie",
  "Delete a movie from Radarr. Optionally remove files from disk.",
  {
    movieId: z.number().int(),
    deleteFiles: z.boolean().optional().default(false),
    addImportExclusion: z.boolean().optional().default(false),
  },
  async ({ movieId, deleteFiles, addImportExclusion }) =>
    ok(await radarr.deleteMovie(movieId, deleteFiles, addImportExclusion))
);

server.tool(
  "set_monitored",
  "Toggle monitoring for a movie",
  { movieId: z.number().int(), monitored: z.boolean() },
  async ({ movieId, monitored }) => ok(await radarr.setMonitored(movieId, monitored))
);

server.tool(
  "change_quality",
  "Change the quality profile of a movie. Does not trigger search; use trigger_search after.",
  { movieId: z.number().int(), qualityProfileId: z.number().int() },
  async ({ movieId, qualityProfileId }) =>
    ok(await radarr.changeQuality(movieId, qualityProfileId))
);

server.tool(
  "trigger_search",
  "Trigger an indexer search for one or more movie ids",
  { movieIds: z.array(z.number().int()).min(1) },
  async ({ movieIds }) => ok(await radarr.triggerSearch(movieIds))
);

server.tool(
  "search_releases",
  "Search available releases (torrents/nzb) for a movie. Returns list with guid, indexerId, quality, size, seeders.",
  { movieId: z.number().int() },
  async ({ movieId }) => {
    let releases = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 5000));
      releases = await radarr.searchReleases(movieId);
      if (releases.length > 0) break;
    }
    return ok(
      releases.map((r, i) => ({
        index: i + 1,
        guid: r.guid,
        indexerId: r.indexerId,
        indexer: r.indexer,
        tags: parseTorrentTags(r.title),
        quality: r.quality?.quality?.name,
        sizeGb: toGb(r.size),
        seeders: r.seeders ?? "?",
        protocol: r.protocol,
        rejected: r.rejected,
        rejections: r.rejections,
      }))
    );
  }
);

server.tool(
  "download_release",
  "Send a release to the download client. Use guid + indexerId from search_releases.",
  {
    guid: z.string(),
    indexerId: z.number().int(),
    movieId: z.number().int(),
  },
  async ({ guid, indexerId, movieId }) => {
    const [release, movie] = await Promise.all([
      radarr.downloadRelease(guid, indexerId, movieId),
      radarr.getMovie(movieId).catch(() => null),
    ]);
    return ok({ ...release, movieId, movieTitle: movie?.title ?? null });
  }
);

server.tool(
  "get_queue",
  "Get the current Radarr download queue",
  {},
  async () => {
    const q = await radarr.getQueue();
    return ok({
      total: q.totalRecords,
      records: (q.records || []).map((r) => ({
        id: r.id,
        movieId: r.movieId,
        title: r.title || r.movie?.title,
        status: r.status,
        sizeGb: toGb(r.size),
        sizeLeftGb: toGb(r.sizeleft),
        timeLeft: r.timeleft,
        protocol: r.protocol,
        downloadClient: r.downloadClient,
      })),
    });
  }
);

server.tool(
  "cancel_queue_item",
  "Remove an item from the download queue",
  {
    queueId: z.number().int(),
    removeFromClient: z.boolean().optional().default(true),
    blocklist: z.boolean().optional().default(false),
  },
  async ({ queueId, removeFromClient, blocklist }) =>
    ok(await radarr.cancelQueueItem(queueId, removeFromClient, blocklist))
);

server.tool(
  "get_movie_history",
  "Get history entries (grabbed/imported/deleted/failed) for a movie",
  { movieId: z.number().int() },
  async ({ movieId }) => ok(await radarr.getMovieHistory(movieId))
);

server.tool(
  "get_missing_movies",
  "List monitored movies that do not have a file yet",
  {},
  async () => {
    const missing = await radarr.getMissingMovies();
    return ok(missing.map(movieSummary));
  }
);

server.tool(
  "get_duplicates",
  "Find movies with multiple file entries for the same TMDB id",
  {},
  async () => {
    const groups = await radarr.getDuplicates();
    return ok(
      groups.map((g) => ({
        tmdbId: g[0].tmdbId,
        title: g[0].title,
        copies: g.map(movieSummary),
      }))
    );
  }
);

server.tool(
  "get_manual_import",
  "Scan a completed download for importable files. Pass downloadId (from get_queue) OR folder path. Returns files with suggested movie matches, quality, and any rejections.",
  {
    downloadId: z.string().optional().describe("Download client ID from get_queue"),
    folder: z.string().optional().describe("Absolute path to scan, e.g. /downloads/some-movie"),
    filterExistingFiles: z.boolean().optional().default(true),
  },
  async ({ downloadId, folder, filterExistingFiles }) => {
    const items = await radarr.getManualImport({ downloadId, folder, filterExistingFiles });
    return ok(
      (items || []).map((item) => ({
        id: item.id,
        path: item.path,
        relativePath: item.relativePath,
        sizeGb: toGb(item.size),
        movie: item.movie ? { id: item.movie.id, title: item.movie.title, year: item.movie.year } : null,
        quality: item.quality?.quality?.name,
        languages: (item.languages || []).map((l) => l.name),
        rejections: (item.rejections || []).map((r) => r.reason),
      }))
    );
  }
);

server.tool(
  "process_manual_import",
  "Confirm and execute a manual import. Pass the array of items returned by get_manual_import (optionally override movieId/quality). Each item needs: id, path, movieId, qualityId.",
  {
    items: z.array(
      z.object({
        id: z.number().int(),
        path: z.string(),
        movieId: z.number().int(),
        quality: z.object({ qualityId: z.number().int() }).optional(),
        languages: z.array(z.object({ id: z.number().int() })).optional(),
        downloadId: z.string().optional(),
        importMode: z.enum(["move", "copy", "hardlink"]).optional().default("move"),
      })
    ).min(1),
  },
  async ({ items }) => ok(await radarr.processManualImport(items))
);

server.tool(
  "get_health",
  "Get Radarr health checks — shows warnings/errors for indexers, download client, disk space, etc.",
  {},
  async () => {
    const checks = await radarr.getHealth();
    return ok(
      checks.map((c) => ({
        source: c.source,
        type: c.type,
        message: c.message,
        wikiUrl: c.wikiUrl,
      }))
    );
  }
);

server.tool(
  "get_movie_files",
  "Get files on disk for a movie (codec, resolution, path, size). Useful before delete_movie_file.",
  { movieId: z.number().int() },
  async ({ movieId }) => {
    const files = await radarr.getMovieFiles(movieId);
    return ok(
      (files || []).map((f) => ({
        id: f.id,
        movieId: f.movieId,
        path: f.relativePath || f.path,
        sizeGb: toGb(f.size),
        quality: f.quality?.quality?.name,
        codec: f.mediaInfo?.videoCodec,
        resolution: f.mediaInfo?.resolution,
        audioCodec: f.mediaInfo?.audioCodec,
        audioChannels: f.mediaInfo?.audioChannels,
      }))
    );
  }
);

server.tool(
  "delete_movie_file",
  "Delete a movie file from disk without removing the movie from Radarr library. Use get_movie_files to find the fileId.",
  { fileId: z.number().int() },
  async ({ fileId }) => ok(await radarr.deleteMovieFile(fileId))
);

server.tool(
  "get_blocklist",
  "Get blocked releases for a movie (releases Radarr won't re-download)",
  { movieId: z.number().int() },
  async ({ movieId }) => {
    const items = await radarr.getBlocklist(movieId);
    return ok(
      (items || []).map((b) => ({
        id: b.id,
        sourceTitle: b.sourceTitle,
        quality: b.quality?.quality?.name,
        date: b.date,
        indexer: b.indexer,
        message: b.message,
      }))
    );
  }
);

server.tool(
  "get_credits",
  "Get cast and crew for a movie (actor names, characters, directors, writers)",
  { movieId: z.number().int() },
  async ({ movieId }) => {
    const credits = await radarr.getCredits(movieId);
    const cast = (credits || []).filter((c) => c.type === "cast");
    const crew = (credits || []).filter((c) => c.type === "crew");
    return ok({
      cast: cast
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
        .map((c) => ({ name: c.personName, character: c.character, order: c.order, tmdbId: c.personTmdbId })),
      crew: crew.map((c) => ({ name: c.personName, job: c.job, department: c.department, tmdbId: c.personTmdbId })),
    });
  }
);

server.tool(
  "get_calendar",
  "Get upcoming movie releases scheduled in Radarr. Optionally filter by date range (ISO 8601).",
  {
    start: z.string().optional().describe("Start date, e.g. 2025-05-26"),
    end: z.string().optional().describe("End date, e.g. 2025-06-26"),
  },
  async ({ start, end } = {}) => {
    const movies = await radarr.getCalendar(start, end);
    return ok(movies.map(movieSummary));
  }
);

server.tool(
  "get_wanted_cutoff",
  "List movies that have a file but don't meet the quality cutoff (upgrade candidates)",
  { pageSize: z.number().int().optional().default(50) },
  async ({ pageSize }) => {
    const result = await radarr.getWantedCutoff(pageSize);
    return ok({
      total: result.totalRecords,
      records: (result.records || []).map(movieSummary),
    });
  }
);

server.tool(
  "get_collections",
  "Get movie collections (sagas/franchises) from Radarr. Optionally filter by TMDB collection id.",
  { tmdbCollectionId: z.number().int().optional() },
  async ({ tmdbCollectionId } = {}) => {
    const collections = await radarr.getCollections(tmdbCollectionId);
    return ok(
      (collections || []).map((c) => ({
        id: c.id,
        title: c.title,
        tmdbId: c.tmdbId,
        overview: c.overview,
        movies: (c.movies || []).map((m) => ({
          tmdbId: m.tmdbId,
          title: m.title,
          year: m.year,
          hasFile: m.hasFile,
          isAvailable: m.isAvailable,
        })),
      }))
    );
  }
);

server.tool(
  "refresh_movie",
  "Force a metadata refresh for a movie (or all movies if no id given)",
  { movieId: z.number().int().optional() },
  async ({ movieId } = {}) => ok(await radarr.refreshMovie(movieId))
);

server.tool(
  "get_quality_profiles",
  "List configured Radarr quality profiles (id + name)",
  {},
  async () => {
    const profiles = await radarr.getQualityProfiles();
    return ok(profiles.map((p) => ({ id: p.id, name: p.name })));
  }
);

server.tool(
  "get_root_folders",
  "List configured Radarr root folders (path + free space)",
  {},
  async () => {
    const folders = await radarr.getRootFolders();
    return ok(
      folders.map((f) => ({
        id: f.id,
        path: f.path,
        accessible: f.accessible,
        freeSpaceGb: toGb(f.freeSpace),
      }))
    );
  }
);

server.tool(
  "get_tags",
  "List configured Radarr tags (id + label)",
  {},
  async () => ok(await radarr.getTags())
);

server.tool(
  "get_disk_space",
  "Get Radarr-reported disk space for all mounted volumes",
  {},
  async () => {
    const disks = await radarr.getDiskSpace();
    return ok(
      disks.map((d) => ({
        path: d.path,
        label: d.label,
        freeSpaceGb: toGb(d.freeSpace),
        totalSpaceGb: toGb(d.totalSpace),
      }))
    );
  }
);

server.tool(
  "get_system_status",
  "Get Radarr system status (version, build, runtime info)",
  {},
  async () => ok(await radarr.getSystemStatus())
);

server.tool(
  "get_collection_stats",
  "Aggregate stats over the entire Radarr library",
  {},
  async () => {
    const movies = await radarr.getAllMovies();
    const downloaded = movies.filter((m) => m.hasFile);
    const missing = movies.filter((m) => !m.hasFile && m.monitored);
    const totalSize = downloaded.reduce((s, m) => s + (m.sizeOnDisk || 0), 0);

    const genreCount = {};
    for (const m of movies) {
      for (const g of m.genres || []) genreCount[g] = (genreCount[g] || 0) + 1;
    }
    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return ok({
      totalMovies: movies.length,
      downloadedMovies: downloaded.length,
      missingMovies: missing.length,
      totalSizeGb: toGb(totalSize),
      topGenres,
    });
  }
);

server.tool(
  "set_movie_tags",
  "Set, add or remove tags on a movie. mode: 'set' replaces all tags, 'add' appends, 'remove' removes. Use get_tags to find tag ids.",
  {
    movieId: z.number().int(),
    tags: z.array(z.number().int()).describe("Tag ids from get_tags"),
    mode: z.enum(["set", "add", "remove"]).optional().default("set"),
  },
  async ({ movieId, tags, mode }) => ok(await radarr.setMovieTags(movieId, tags, mode))
);

  return server;
}

if (TRANSPORT === "http") {
  const { default: express } = await import("express");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("[radarr-mcp http]", e);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });

  const methodNotAllowed = (_req, res) =>
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.listen(PORT, () =>
    console.error(`[radarr-mcp] http on :${PORT}/mcp`)
  );
} else {
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error("[radarr-mcp] connected via stdio");
}
