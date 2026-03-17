/**
 * Content Seeder Script — syncs all JSON data files into Convex gameItems table.
 *
 * Usage: node scripts/seedContent.mjs
 *
 * Uses the Convex HTTP API to call contentSeeder:seedItems mutation directly.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "static", "data");

// Read CONVEX_URL from .env.local
const envPath = path.join(ROOT, ".env.local");
let CONVEX_URL = "";
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  const match = content.match(/CONVEX_URL=(.+)/);
  if (match) CONVEX_URL = match[1].trim();
}
if (!CONVEX_URL) {
  console.error("ERROR: CONVEX_URL not found in .env.local");
  process.exit(1);
}

/**
 * Call the Convex mutation via HTTP API.
 * @param {string} fnPath - e.g. "contentSeeder:seedItems"
 * @param {object} args
 * @returns {Promise<any>}
 */
async function convexMutation(fnPath, args) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: fnPath, args }),
  });
  const data = await res.json();
  if (data.status === "error") throw new Error(data.errorMessage || JSON.stringify(data));
  return data.value;
}

/**
 * Seed items in batches via Convex HTTP API.
 * @param {string} gameType
 * @param {Array} items
 */
async function seedBatch(gameType, items) {
  const BATCH = 50;
  let totalAdded = 0;
  let totalSkipped = 0;

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    try {
      const result = await convexMutation("contentSeeder:seedItems", { gameType, items: batch });
      totalAdded += result.added || 0;
      totalSkipped += result.skipped || 0;
    } catch (err) {
      console.error(`  ERROR seeding ${gameType} batch ${i}-${i + batch.length}:`, err.message.slice(0, 200));
    }
  }
  console.log(`[${gameType}] Added: ${totalAdded}, Skipped: ${totalSkipped}, Total: ${items.length}`);
}

// ── Charades ──────────────────────────────────────────────────────────
async function seedCharades() {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "charades_items.json"), "utf-8"));
  const items = raw.items.map((item) => ({
    title: item.name,
    category: item.category || "",
    content: { year: item.year, starring: item.starring, type: item.type },
  }));
  await seedBatch("charades", items);
}

// ── Riddles ───────────────────────────────────────────────────────────
async function seedRiddles() {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "riddles.json"), "utf-8"));
  const items = raw.riddles.map((r) => ({
    title: r.riddle,
    category: r.category || "ألغاز عامة",
    content: {
      answer: r.answer,
      accepted_answers: r.accepted_answers,
      hints: r.hints,
      difficulty: r.difficulty,
    },
  }));
  await seedBatch("riddles", items);
}

// ── Who Am I ──────────────────────────────────────────────────────────
async function seedWhoAmI() {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "who_am_i_characters.json"), "utf-8"));
  const items = raw.characters.map((c) => ({
    title: c.name,
    category: c.category || "",
  }));
  await seedBatch("who_am_i", items);
}

// ── Twenty Questions ──────────────────────────────────────────────────
async function seedTwentyQuestions() {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "twenty_questions_words.json"), "utf-8"));
  const words = Array.isArray(raw) ? raw : raw.words || [];
  const items = words.map((w) => {
    if (typeof w === "string") return { title: w, category: "" };
    return { title: w.word || w.name, category: w.category || "" };
  });
  await seedBatch("twenty_questions", items);
}

// ── Main ──────────────────────────────────────────────────────────────
(async () => {
  console.log("Seeding content into Convex...\n");
  await seedCharades();
  await seedRiddles();
  await seedWhoAmI();
  await seedTwentyQuestions();
  console.log("\nDone! All content seeded.");
})().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
