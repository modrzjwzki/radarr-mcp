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

function createServer() {
  const server = new McpServer({
    name: "radarr-mcp",
    version: "0.1.0",
  });

server.tool(
  "list_movies",
  "List all movies in the Radarr library with id, title, year, status, size, genres",
  {},
  async () => {
    const movies = await radarr.getAllMovies();
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
    const releases = await radarr.searchReleases(movieId);
    return ok(
      releases.map((r, i) => ({
        index: i,
        guid: r.guid,
        indexerId: r.indexerId,
        title: r.title,
        quality: r.quality?.quality?.name,
        sizeGb: toGb(r.size),
        seeders: r.seeders,
        leechers: r.leechers,
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
  async ({ guid, indexerId, movieId }) =>
    ok(await radarr.downloadRelease(guid, indexerId, movieId))
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
