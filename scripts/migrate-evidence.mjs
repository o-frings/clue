/* One-time migration: lift each card's inline `source` object into a deduplicated
 * evidence.json registry, and replace it on the card with `src: ["<id>"]`.
 *
 * Line-based so the hand-curated formatting of knowledge.json is preserved — only the
 * `"source": {...}` lines change. Re-runnable: if a card already has `src`, it's skipped.
 *
 *   node scripts/migrate-evidence.mjs
 */
import fs from "node:fs";

const KN_PATH = "knowledge.json";
const EV_PATH = "evidence.json";

const slug = (s) =>
  (s || "src").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "src";

const raw = fs.readFileSync(KN_PATH, "utf8");
const lines = raw.split("\n");

const sources = {};      // id -> {who,year,title,where,url,kind,strength}
const keyToId = {};      // dedup key -> id
let migrated = 0;

const sourceRe = /^(\s*)"source"\s*:\s*(\{.*\})\s*(,?)\s*$/;

const out = lines.map((line) => {
  const m = line.match(sourceRe);
  if (!m) return line;
  const [, indent, objText, comma] = m;
  let s;
  try { s = JSON.parse(objText); } catch { return line; } // leave anything unparseable untouched
  if (!s.who && !s.title) return line;                     // empty source: leave untouched

  const key = [s.who || "", s.title || "", s.year || "", s.where || ""].join("|").toLowerCase();
  let id = keyToId[key];
  if (!id) {
    const base = "ev-" + slug(s.who || s.title);
    id = base;
    let i = 2;
    while (sources[id]) id = `${base}-${i++}`;
    keyToId[key] = id;
    sources[id] = {
      who: s.who || "",
      year: s.year || 0,
      title: s.title || "",
      where: s.where || "",
      url: s.url || "",
      kind: "",        // book | paper | dataset | report | reference | news — to backfill
      strength: "",    // concrete: "two RCTs, n≈12k" — never just "strong" — to backfill
    };
    migrated++;
  }
  return `${indent}"src": ["${id}"]${comma}`;
});

fs.writeFileSync(KN_PATH, out.join("\n"));

const ev = {
  _meta: {
    purpose: "Evidence registry — every source logged once, referenced by id from card.src[].",
    version: 1,
    status: "MIGRATED from knowledge.json source objects. url + kind + strength need backfill.",
    schema: {
      sources: "map of id -> {who,year,title,where,url,kind,strength}",
      strength: "describes how THICK the evidence is, concretely (e.g. 'two RCTs, n≈12k'; 'single case study') — never a bare 'strong'/'weak'",
      kind: "book | paper | dataset | report | reference | news",
    },
  },
  sources,
};
fs.writeFileSync(EV_PATH, JSON.stringify(ev, null, 2) + "\n");

console.log(`Migrated ${migrated} unique sources into ${EV_PATH}.`);
console.log(`knowledge.json source objects → src:[id] references.`);
