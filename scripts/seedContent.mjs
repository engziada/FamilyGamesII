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

// Read CONVEX_URL from environment variable or .env.local
let CONVEX_URL = process.env.CONVEX_URL || "";

if (!CONVEX_URL) {
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    const match = content.match(/CONVEX_URL=(.+)/);
    if (match) CONVEX_URL = match[1].trim();
  }
}

if (!CONVEX_URL) {
  console.error("ERROR: CONVEX_URL not found in environment or .env.local");
  console.error("Usage: CONVEX_URL=https://your-prod.convex.cloud node scripts/seedContent.mjs");
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
    content: {
      name_en: c.name_en || "",
      hint: c.hint || "",
    },
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

// ── Trivia ───────────────────────────────────────────────────────────
async function seedTrivia() {
  const filePath = path.join(DATA_DIR, "trivia_questions.json");
  if (!fs.existsSync(filePath)) {
    console.log("[trivia] No trivia_questions.json found — skipping.");
    return;
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const questions = raw.questions || [];

  // Split: 'faris' source → rapid_fire, 'islamicQuizAPI' → trivia
  const triviaItems = [];
  const rapidFireItems = [];

  for (const q of questions) {
    // Compute answer index from correctAnswer text
    const options = q.options || [];
    const correctAnswer = q.correctAnswer || "";
    const answer = options.findIndex(opt => opt === correctAnswer);
    
    const item = {
      title: q.question,
      category: q.category || "معلومات عامة",
      content: {
        options: options,
        correctAnswer: correctAnswer,
        answer: answer >= 0 ? answer : 0, // Store index for backend
      },
    };
    // Seed into both trivia and rapid_fire — both use the same format
    triviaItems.push(item);
    if (q.source === "faris") {
      rapidFireItems.push(item);
    }
  }

  if (triviaItems.length > 0) await seedBatch("trivia", triviaItems);
  if (rapidFireItems.length > 0) await seedBatch("rapid_fire", rapidFireItems);
}

// ── Meen Yazood ─────────────────────────────────────────────────────
async function seedMeenYazood() {
  const filePath = path.join(DATA_DIR, "meen_yazood_questions.json");
  if (!fs.existsSync(filePath)) {
    console.log("[meen_yazood] No meen_yazood_questions.json found — skipping.");
    return;
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const questions = raw.questions || [];

  const items = questions.map((q) => ({
    title: q.question,
    category: q.category || "",
    content: {
      question: q.question,
      difficulty: q.difficulty || "medium",
    },
  }));
  await seedBatch("meen_yazood", items);
}

// ── Main ──────────────────────────────────────────────────────────────
(async () => {
  console.log("Seeding content into Convex...\n");
  await seedCharades();
  await seedRiddles();
  await seedWhoAmI();
  await seedTwentyQuestions();
  await seedTrivia();
  await seedMeenYazood();
  console.log("\nDone! All content seeded.");
})().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
