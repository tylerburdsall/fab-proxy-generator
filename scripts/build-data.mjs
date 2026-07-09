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
 * Usage:
 *   node scripts/build-data.mjs <path-to-source-repo> [output-file]
 *
 * Defaults:
 *   source repo : ./source
 *   output      : ./data/cards.min.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const SOURCE = process.argv[2] || "./source";
const OUT = process.argv[3] || "./data/cards.min.json";

const EN = join(SOURCE, "json", "english");

function loadJson(name) {
  return JSON.parse(readFileSync(join(EN, name), "utf8"));
}

// id -> friendly name for art variations (EA -> "Extended Art", etc.)
const artVariationNames = Object.fromEntries(
  loadJson("art-variation.json").map((a) => [a.id, a.name])
);

const cards = loadJson("card.json");

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
