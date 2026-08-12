#!/usr/bin/env node
/**
 * build-data.mjs
 *
 * Reads the raw card database from the-fab-cube/flesh-and-blood-cards and
 * produces a slim `data/cards.min.json` used by the static proxy site.
 *
 * The slim file keeps only what the print UI needs:
 *   - name, pitch, type text, whether the card plays horizontally
 *   - a de-duplicated list of printable "versions" (distinct artwork),
 *     each with its image URL, a human label, and any rotation.
 *
 * It also diffs against the previous build and, with --update-banner, rewrites
 * the announcement banner in index.html to name the sets that were added.
 *
 * Usage:
 *   node scripts/build-data.mjs <path-to-source-repo> [output-file] [--update-banner]
 *
 * Defaults:
 *   source repo : ./source
 *   output      : ./data/cards.min.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const SOURCE = args[0] || "./source";
const OUT = args[1] || "./data/cards.min.json";
const UPDATE_BANNER = flags.has("--update-banner");
const INDEX_HTML = "./index.html";

const EN = join(SOURCE, "json", "english");

function loadJson(name) {
  return JSON.parse(readFileSync(join(EN, name), "utf8"));
}

// id -> friendly name for art variations (EA -> "Extended Art", etc.)
const artVariationNames = Object.fromEntries(
  loadJson("art-variation.json").map((a) => [a.id, a.name])
);

// set id -> friendly name ("MPW" -> "Mastery Pack Warrior")
const setNames = Object.fromEntries(loadJson("set.json").map((s) => [s.id, s.name]));

const cards = loadJson("card.json");

// Snapshot the previous build (if any) so we can report what's new.
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;

/**
 * Build a short label describing a printing so a user can tell versions apart,
 * e.g. "DTD" for the base print or "DTD · Extended Art".
 */
function versionLabel(printing) {
  const parts = [printing.set_id || "?"];
  const variations = (printing.art_variations || [])
    .map((v) => artVariationNames[v] || v)
    .filter(Boolean);
  if (variations.length) parts.push(variations.join(", "));
  return parts.join(" · ");
}

const out = [];

for (const card of cards) {
  const versionsByImage = new Map();

  for (const p of card.printings || []) {
    const url = p.image_url;
    if (!url) continue; // skip printings with no artwork
    // De-duplicate by image: foil variants usually share the same artwork.
    if (versionsByImage.has(url)) continue;
    versionsByImage.set(url, {
      u: url,
      l: versionLabel(p),
      // printing / collector code, e.g. "WTR054", "GEM149"
      id: p.id || "",
      // rotation needed to display the stored image upright (0/90/180/270)
      r: p.image_rotation_degrees || 0,
      // sort hint: base prints (no art variation) first
      _base: (p.art_variations || []).length === 0 ? 0 : 1,
    });
  }

  const versions = [...versionsByImage.values()];
  if (!versions.length) continue; // nothing printable

  // Base printings first, then the rest in stable order.
  versions.sort((a, b) => a._base - b._base);
  versions.forEach((v) => delete v._base);

  out.push({
    n: card.name,
    p: card.pitch || "",
    t: card.type_text || "",
    h: !!card.played_horizontally,
    v: versions,
  });
}

// Sort by name, then pitch, for a predictable search experience.
out.sort((a, b) => a.n.localeCompare(b.n) || String(a.p).localeCompare(String(b.p)));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));

const versionCount = out.reduce((s, c) => s + c.v.length, 0);
console.log(
  `Wrote ${out.length} cards / ${versionCount} versions -> ${OUT} ` +
    `(${(readFileSync(OUT).length / 1024 / 1024).toFixed(2)} MB)`
);

/* ---------------------------------------------------------------------------
   Diff against the previous build and (optionally) refresh the announcement
   banner in index.html so it names whatever was just added.
   --------------------------------------------------------------------------- */

const setOf = (v) => (v.id || "").replace(/[0-9].*$/, "");

function summarize() {
  if (!previous) return null;

  const prevNames = new Set(previous.map((c) => c.n));
  const prevVersions = new Set(previous.flatMap((c) => c.v.map((v) => v.u)));

  const newCards = out.filter((c) => !prevNames.has(c.n));
  const newVersionCount = out
    .flatMap((c) => c.v)
    .filter((v) => !prevVersions.has(v.u)).length;

  if (!newCards.length && !newVersionCount) return null;

  // Rank the sets that the new cards belong to, most cards first.
  const counts = new Map();
  for (const card of newCards) {
    const code = setOf(card.v[0]);
    if (code) counts.set(code, (counts.get(code) || 0) + 1);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => setNames[code] || code)
    // Skip placeholder names the source uses for unannounced sets.
    .filter((name) => !/^\?+|\?\?\?/.test(name));

  return { newCards: newCards.length, newVersionCount, setNames: ranked };
}

/** Build the banner sentence, e.g. "Mastery Pack Warrior cards have been added…" */
function bannerSentence(summary, date) {
  const [first, second, ...rest] = summary.setNames;
  let body;

  if (!first) {
    // Only new printings of existing cards.
    body = `${summary.newVersionCount} new card printing${summary.newVersionCount === 1 ? "" : "s"} added.`;
  } else if (!second) {
    body = `${first} cards have been added.`;
  } else if (!rest.length) {
    body = `${first} and ${second} cards have been added.`;
  } else {
    body = `${first} cards have been added, along with ${second} and other new printings.`;
  }

  return `<strong>${date}:</strong> ${body}`;
}

const summary = summarize();

if (summary) {
  console.log(
    `New since last build: ${summary.newCards} cards, ${summary.newVersionCount} versions` +
      (summary.setNames.length ? ` (${summary.setNames.join(", ")})` : "")
  );
}

// Expose a short description for the workflow (PR title/body).
if (process.env.GITHUB_OUTPUT) {
  const desc = summary
    ? (summary.setNames[0] ? summary.setNames.slice(0, 2).join(", ") : "new printings")
    : "";
  appendFileSync(process.env.GITHUB_OUTPUT, `new_sets=${desc}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `new_cards=${summary ? summary.newCards : 0}\n`);
}

if (UPDATE_BANNER && summary && existsSync(INDEX_HTML)) {
  const date = new Date().toISOString().slice(0, 10);
  const html = readFileSync(INDEX_HTML, "utf8");

  const slug =
    (summary.setNames[0] || "printings")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "update";

  const idRe = /(<div id="announcement"[^>]*\sdata-id=")[^"]*(")/;
  const textRe = /(<p class="ann-text">)[\s\S]*?(<\/p>)/;

  if (!idRe.test(html) || !textRe.test(html)) {
    console.warn(`Could not find the banner markup in ${INDEX_HTML}; left unchanged.`);
  } else {
    const updated = html
      // data-id drives dismissal: a new id re-shows the banner to everyone.
      .replace(idRe, `$1${date}-${slug}$2`)
      // Replace the banner sentence.
      .replace(textRe, `$1\n      ${bannerSentence(summary, date)}\n    $2`);

    if (updated !== html) {
      writeFileSync(INDEX_HTML, updated);
      console.log(`Updated announcement banner in ${INDEX_HTML}`);
    } else {
      console.log("Announcement banner already up to date.");
    }
  }
}
