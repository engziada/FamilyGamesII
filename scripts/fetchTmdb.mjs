/**
 * TMDB Content Fetcher — fetches Arabic movies and Egyptian TV shows from TMDB API.
 *
 * Usage: node scripts/fetchTmdb.mjs
 *
 * Requires TMDB_API_TOKEN in .env or .env.local (Bearer token).
 * Get yours from: https://www.themoviedb.org/settings/api
 *
 * Output: static/data/tmdb_charades.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "static", "data");

// ── Read TMDB token from .env.local or .env ──────────────────────────

function loadToken() {
  for (const envFile of [".env.local", ".env"]) {
    const envPath = path.join(ROOT, envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/TMDB_API_TOKEN=(.+)/);
      if (match) return match[1].trim();
    }
  }
  return process.env.TMDB_API_TOKEN || "";
}

const TMDB_TOKEN = loadToken();
if (!TMDB_TOKEN) {
  console.error("ERROR: TMDB_API_TOKEN not found.");
  console.error("Add TMDB_API_TOKEN=your_bearer_token to .env.local or .env");
  process.exit(1);
}

const BASE = "https://api.themoviedb.org/3";
const HEADERS = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  "Content-Type": "application/json",
};

// ── Genre map (Arabic) ───────────────────────────────────────────────

const GENRE_MAP = {
  28: "أكشن", 12: "مغامرة", 16: "رسوم متحركة", 35: "كوميدي",
  80: "جريمة", 99: "وثائقي", 18: "دراما", 10751: "عائلي",
  14: "خيال", 36: "تاريخي", 27: "رعب", 10402: "موسيقي",
  9648: "غموض", 10749: "رومانسي", 878: "خيال علمي", 10770: "تلفزيوني",
  53: "إثارة", 10752: "حرب", 37: "ويسترن",
  10759: "أكشن ومغامرة", 10762: "أطفال", 10763: "أخبار",
  10764: "واقعي", 10765: "خيال علمي", 10766: "مسلسل",
  10767: "حواري", 10768: "حرب وسياسة",
};

/**
 * Fetch a TMDB discover page.
 * @param {string} endpoint - "discover/movie" or "discover/tv"
 * @param {object} params - query params
 * @param {number} page
 * @returns {Promise<object>}
 */
async function tmdbGet(endpoint, params = {}, page = 1) {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set("language", "ar");
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort_by", "popularity.desc");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TMDB ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Fetch multiple pages from a discover endpoint.
 * @param {string} endpoint
 * @param {object} params
 * @param {number} maxPages
 * @returns {Promise<Array>}
 */
async function fetchPages(endpoint, params, maxPages = 5) {
  const items = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await tmdbGet(endpoint, params, page);
    if (!data.results || data.results.length === 0) break;
    items.push(...data.results);
    if (page >= data.total_pages) break;
    // Rate limit: 50 req/s, be polite
    await new Promise((r) => setTimeout(r, 250));
  }
  return items;
}

// ── Main ──────────────────────────────────────────────────────────────

(async () => {
  console.log("=== TMDB Arabic Content Fetcher ===\n");

  // Fetch Arabic movies (popular, with Arabic original language)
  console.log("[Movies] Fetching Arabic movies (with_original_language=ar)...");
  const movies = await fetchPages("discover/movie", {
    with_original_language: "ar",
    "vote_count.gte": "10",
  }, 5);
  console.log(`  Found ${movies.length} movies`);

  // Fetch Egyptian TV shows
  console.log("[TV] Fetching Egyptian TV shows (with_origin_country=EG)...");
  const tvShows = await fetchPages("discover/tv", {
    with_origin_country: "EG",
    "vote_count.gte": "5",
  }, 5);
  console.log(`  Found ${tvShows.length} TV shows`);

  // Transform to charades format
  const charadesItems = [];
  const seen = new Set();

  for (const m of movies) {
    const title = m.title || m.original_title || "";
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const genres = (m.genre_ids || []).map((id) => GENRE_MAP[id] || "").filter(Boolean);
    charadesItems.push({
      name: title,
      category: "فيلم",
      year: (m.release_date || "").slice(0, 4),
      starring: "",
      type: genres.join("، ") || "دراما",
    });
  }

  for (const t of tvShows) {
    const title = t.name || t.original_name || "";
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const genres = (t.genre_ids || []).map((id) => GENRE_MAP[id] || "").filter(Boolean);
    charadesItems.push({
      name: title,
      category: "مسلسل",
      year: (t.first_air_date || "").slice(0, 4),
      starring: "",
      type: genres.join("، ") || "دراما",
    });
  }

  // Load existing charades_items.json and merge
  const existingPath = path.join(DATA_DIR, "charades_items.json");
  let existingItems = [];
  if (fs.existsSync(existingPath)) {
    const raw = JSON.parse(fs.readFileSync(existingPath, "utf-8"));
    existingItems = raw.items || [];
    console.log(`\n[Merge] Existing charades items: ${existingItems.length}`);
  }

  // Deduplicate against existing
  for (const item of existingItems) {
    if (!seen.has(item.name)) {
      seen.add(item.name);
      charadesItems.push(item);
    }
  }

  // Write merged output
  const output = { items: charadesItems };
  const dest = path.join(DATA_DIR, "charades_items.json");
  fs.writeFileSync(dest, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n✓ Wrote ${charadesItems.length} total charades items to ${dest}`);
  console.log("  (TMDB movies + TV shows + existing items merged)");
})().catch((err) => {
  console.error("TMDB fetch failed:", err);
  process.exit(1);
});
