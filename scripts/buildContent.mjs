/**
 * Content Builder — downloads external JSON sources, transforms local files,
 * and outputs merged data files into static/data/.
 *
 * Usage: node scripts/buildContent.mjs
 *
 * Sources:
 * - Characters.json (local Downloads) → who_am_i_characters.json
 * - Riddles1.json (local Downloads) + Alghaz (GitHub) → riddles.json (merged)
 * - Faris answerIt.JSON (GitHub) + IslamicQuizAPI (GitHub) → trivia_questions.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "static", "data");
const DOWNLOADS = path.join(process.env.USERPROFILE || "", "Downloads");

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Fetch JSON from a URL with retry.
 * @param {string} url
 * @param {number} retries
 * @returns {Promise<string>} raw text
 */
async function fetchText(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "FamilyGamesII-ContentBuilder/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`  Retry ${i + 1}/${retries} for ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

/**
 * Write JSON to a file in static/data/.
 * @param {string} filename
 * @param {any} data
 */
function writeData(filename, data) {
  const dest = path.join(DATA_DIR, filename);
  fs.writeFileSync(dest, JSON.stringify(data, null, 2), "utf-8");
  console.log(`  ✓ Wrote ${dest}`);
}

// ── 1. Who Am I — Characters.json ────────────────────────────────────

async function buildWhoAmI() {
  console.log("\n[Who Am I] Building characters...");
  const srcPath = path.join(DOWNLOADS, "Characters.json");

  if (!fs.existsSync(srcPath)) {
    console.error(`  ✗ File not found: ${srcPath}`);
    console.error("    Please place Characters.json in your Downloads folder.");
    return;
  }

  const raw = JSON.parse(fs.readFileSync(srcPath, "utf-8"));
  // raw is an array of { id, name_ar, name_en, field, summary_ar }

  // Deduplicate by name_ar
  const seen = new Set();
  const characters = [];
  for (const c of raw) {
    if (seen.has(c.name_ar)) continue;
    seen.add(c.name_ar);
    characters.push({
      name: c.name_ar,
      name_en: c.name_en || "",
      category: c.field || "",
      hint: c.summary_ar || "",
    });
  }

  writeData("who_am_i_characters.json", { characters });
  console.log(`  Total: ${characters.length} unique characters`);
}

// ── 2. Riddles — merge existing + Riddles1.json + Alghaz ─────────────

async function buildRiddles() {
  console.log("\n[Riddles] Building riddles...");

  // 2a. Existing riddles.json
  const existingPath = path.join(DATA_DIR, "riddles.json");
  let existing = [];
  if (fs.existsSync(existingPath)) {
    const raw = JSON.parse(fs.readFileSync(existingPath, "utf-8"));
    existing = raw.riddles || [];
    console.log(`  Existing riddles: ${existing.length}`);
  }

  // 2b. Local Riddles1.json
  const riddles1Path = path.join(DOWNLOADS, "Riddles1.json");
  let fromLocal = [];
  if (fs.existsSync(riddles1Path)) {
    const raw = JSON.parse(fs.readFileSync(riddles1Path, "utf-8"));
    fromLocal = raw.map((r) => ({
      riddle: r.riddle,
      answer: r.solution,
      accepted_answers: [r.solution, ...(r.egyptian_slang || [])],
      hints: r.hint ? [r.hint] : [],
      category: "ألغاز عامة",
      difficulty: "medium",
    }));
    console.log(`  From Riddles1.json: ${fromLocal.length}`);
  } else {
    console.warn(`  ⚠ Riddles1.json not found at ${riddles1Path}`);
  }

  // 2c. Alghaz from GitHub
  let fromAlghaz = [];
  try {
    const text = await fetchText("https://raw.githubusercontent.com/MeherJebali/Alghaz/master/data.js");
    // Format: var data = [ [["answer"], [["riddle"], ["hint"]]], ... ]
    // Extract the array after "var data ="
    let jsonStr = text.replace(/^var\s+data\s*=\s*/, "").replace(/;\s*$/, "").trim();
    // Fix trailing commas (invalid JSON but valid JS)
    jsonStr = jsonStr.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
    const parsed = JSON.parse(jsonStr);

    fromAlghaz = parsed.map((item) => {
      const answer = item[0] && item[0][0] ? item[0][0] : "";
      const clues = item[1] || [];
      const riddle = clues[0] && clues[0][0] ? clues[0][0] : "";
      const hint = clues[1] && clues[1][0] ? clues[1][0] : "";
      return {
        riddle,
        answer,
        accepted_answers: [answer],
        hints: hint ? [hint] : [],
        category: "ألغاز عامة",
        difficulty: "medium",
      };
    }).filter((r) => r.riddle && r.answer);

    console.log(`  From Alghaz (GitHub): ${fromAlghaz.length}`);
  } catch (err) {
    console.warn(`  ⚠ Failed to fetch Alghaz: ${err.message}`);
  }

  // Merge + deduplicate by riddle text (normalized)
  const allRiddles = [...existing, ...fromLocal, ...fromAlghaz];
  const seen = new Set();
  const merged = [];
  for (const r of allRiddles) {
    const key = r.riddle.replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }

  writeData("riddles.json", { riddles: merged });
  console.log(`  Total merged: ${merged.length} unique riddles`);
}

// ── 3. Trivia + Rapid Fire ───────────────────────────────────────────

async function buildTrivia() {
  console.log("\n[Trivia] Building trivia questions...");

  // 3a. Faris answerIt.JSON — general Arabic trivia
  let farisQuestions = [];
  try {
    const text = await fetchText(
      "https://raw.githubusercontent.com/Faris-abukhader/-JSON-/master/answerIt.JSON"
    );
    const raw = JSON.parse(text);
    farisQuestions = raw.map((q) => ({
      question: q.question,
      options: q.answers || [],
      correctAnswer: q.correctAnswer,
      category: "معلومات عامة",
      source: "faris",
    }));
    console.log(`  From Faris JSON: ${farisQuestions.length}`);
  } catch (err) {
    console.warn(`  ⚠ Failed to fetch Faris JSON: ${err.message}`);
  }

  // 3b. IslamicQuizAPI — fetch select categories
  let islamicQuestions = [];
  const categories = [
    { file: "akida/e-anbya/level-1.json", cat: "العقيدة" },
    { file: "akida/e-book/level-1.json", cat: "العقيدة" },
    { file: "akida/e-kader/level-1.json", cat: "العقيدة" },
    { file: "figh/salah/level-1.json", cat: "الفقه" },
    { file: "hadith/hadith01/level-1.json", cat: "الحديث" },
    { file: "hadith/hadith02/level-1.json", cat: "الحديث" },
  ];

  // Arabic language category (correct subfolder names)
  const arabiaCategories = [
    { file: "arabia/al-adab/level-1.json", cat: "اللغة العربية" },
    { file: "arabia/al-blaga/level-1.json", cat: "اللغة العربية" },
    { file: "arabia/al-imla/level-1.json", cat: "اللغة العربية" },
  ];

  for (const { file, cat } of [...categories, ...arabiaCategories]) {
    try {
      const url = `https://raw.githubusercontent.com/rn0x/IslamicQuizAPI/main/database/${file}`;
      const text = await fetchText(url);
      const raw = JSON.parse(text);
      const transformed = raw.map((q) => {
        const options = q.answers.map((a) => a.answer);
        const correctAnswer = q.answers.find((a) => a.t === 1)?.answer || options[0];
        return {
          question: q.q,
          options,
          correctAnswer,
          category: cat,
          source: "islamicQuizAPI",
        };
      });
      islamicQuestions.push(...transformed);
      console.log(`  From IslamicQuizAPI/${file}: ${transformed.length}`);
    } catch (err) {
      console.warn(`  ⚠ Skipped ${file}: ${err.message}`);
    }
  }

  // Merge + deduplicate
  const all = [...farisQuestions, ...islamicQuestions];
  const seen = new Set();
  const merged = [];
  for (const q of all) {
    const key = q.question.replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(q);
  }

  writeData("trivia_questions.json", { questions: merged });
  console.log(`  Total merged: ${merged.length} unique trivia questions`);
}

// ── Main ──────────────────────────────────────────────────────────────

(async () => {
  console.log("=== FamilyGamesII Content Builder ===");
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Downloads: ${DOWNLOADS}`);

  await buildWhoAmI();
  await buildRiddles();
  await buildTrivia();

  console.log("\n=== Content build complete! ===");
  console.log("Next: run 'node scripts/fetchTmdb.mjs' for Charades TMDB content.");
  console.log("Then: run 'node scripts/seedContent.mjs' to seed into Convex.");
})().catch((err) => {
  console.error("Content build failed:", err);
  process.exit(1);
});
