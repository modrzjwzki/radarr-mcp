export class RadarrClient {
  constructor(url, apiKey) {
    this.url = url.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async _fetch(path, options = {}) {
    const res = await fetch(`${this.url}/api/v3${path}`, {
      ...options,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Radarr ${path} failed (${res.status}): ${text}`);
    }
    if (options.method === "DELETE") return null;
    return res.json();
  }

  async getQualityProfiles() {
    return this._fetch("/qualityprofile");
  }

  async getTags() {
    return this._fetch("/tag");
  }

  async getRootFolders() {
    return this._fetch("/rootfolder");
  }

  async getAllMovies() {
    return this._fetch("/movie");
  }

  async getMovie(movieId) {
    return this._fetch(`/movie/${movieId}`);
  }

  async getMovieByTmdb(tmdbId) {
    const movies = await this.getAllMovies();
    return movies.find((m) => m.tmdbId === tmdbId);
  }

  async findMovieByTitle(query) {
    const movies = await this.getAllMovies();
    const q = query.toLowerCase();
    return movies.filter(
      (m) =>
        m.title?.toLowerCase().includes(q) ||
        m.originalTitle?.toLowerCase().includes(q) ||
        m.sortTitle?.toLowerCase().includes(q)
    );
  }

  async lookupByTmdb(tmdbId) {
    return this._fetch(`/movie/lookup/tmdb?tmdbId=${tmdbId}`);
  }

  async lookupByTerm(term) {
    return this._fetch(`/movie/lookup?term=${encodeURIComponent(term)}`);
  }

  async addMovie({ tmdbId, qualityProfileId, rootFolderPath, monitored = true, searchOnAdd = false, tags = [] }) {
    const existing = await this.getMovieByTmdb(tmdbId);
    if (existing) return { alreadyExists: true, movie: existing };

    const movieData = await this.lookupByTmdb(tmdbId);
    const payload = {
      ...movieData,
      qualityProfileId,
      rootFolderPath,
      monitored,
      tags,
      addOptions: { searchForMovie: searchOnAdd },
    };

    const result = await this._fetch("/movie", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { alreadyExists: false, movie: result };
  }

  async updateMovie(movie) {
    return this._fetch(`/movie/${movie.id}`, {
      method: "PUT",
      body: JSON.stringify(movie),
    });
  }

  async deleteMovie(movieId, deleteFiles = false, addImportExclusion = false) {
    return this._fetch(
      `/movie/${movieId}?deleteFiles=${deleteFiles}&addImportExclusion=${addImportExclusion}`,
      { method: "DELETE" }
    );
  }

  async setMonitored(movieId, monitored = true) {
    const movie = await this.getMovie(movieId);
    movie.monitored = monitored;
    return this.updateMovie(movie);
  }

  async changeQuality(movieId, qualityProfileId) {
    const movie = await this.getMovie(movieId);
    movie.qualityProfileId = qualityProfileId;
    return this.updateMovie(movie);
  }

  async triggerSearch(movieIds) {
    return this._fetch("/command", {
      method: "POST",
      body: JSON.stringify({ name: "MoviesSearch", movieIds }),
    });
  }

  async searchReleases(movieId) {
    return this._fetch(`/release?movieId=${movieId}`);
  }

  async downloadRelease(guid, indexerId, movieId) {
    return this._fetch("/release", {
      method: "POST",
      body: JSON.stringify({ guid, indexerId, movieId }),
    });
  }

  async getQueue() {
    return this._fetch("/queue?pageSize=50&includeMovie=true");
  }

  async cancelQueueItem(queueId, removeFromClient = true, blocklist = false) {
    return this._fetch(
      `/queue/${queueId}?removeFromClient=${removeFromClient}&blocklist=${blocklist}`,
      { method: "DELETE" }
    );
  }

  async getMovieHistory(movieId) {
    return this._fetch(`/history/movie?movieId=${movieId}&includeMovie=false`);
  }

  async getMissingMovies() {
    const movies = await this.getAllMovies();
    return movies.filter((m) => m.monitored && !m.hasFile);
  }

  async getDuplicates() {
    const movies = await this.getAllMovies();
    const groups = {};
    for (const m of movies) {
      if (!m.hasFile) continue;
      if (!groups[m.tmdbId]) groups[m.tmdbId] = [];
      groups[m.tmdbId].push(m);
    }
    return Object.values(groups).filter((g) => g.length > 1);
  }

  async getDiskSpace() {
    return this._fetch("/diskspace");
  }

  async getSystemStatus() {
    return this._fetch("/system/status");
  }
}
