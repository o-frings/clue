/* Merge a research result file into evidence.json + knowledge.json.
 * Usage: node scripts/merge-evidence.mjs /tmp/result_X.json
 * For each {id,who,title,year,url,kind,strength} (with a non-empty url): create/overwrite
 * evidence entry "ev-<id>" and point that card's src at it. Line-based knowledge.json edit
 * preserves formatting (replaces an existing src line, or inserts one after the id line).
 */
import fs from "node:fs";

const resPath = process.argv[2];
if (!resPath) { console.error("need a result file path"); process.exit(1); }
const results = JSON.parse(fs.readFileSync(resPath, "utf8")).filter(r => r.url && r.url.trim());

const ev = JSON.parse(fs.readFileSync("evidence.json", "utf8"));
ev.sources = ev.sources || {};
for (const r of results) {
  ev.sources["ev-" + r.id] = { who: r.who || "", year: r.year || 0, title: r.title || "", where: "", url: r.url, kind: r.kind || "", strength: r.strength || "" };
}
fs.writeFileSync("evidence.json", JSON.stringify(ev, null, 2) + "\n");

// which result cards already have a src line (replace) vs none (insert)?
const kn = JSON.parse(fs.readFileSync("knowledge.json", "utf8"));
const byId = {}; kn.cards.forEach(c => byId[c.id] = c);
const want = new Map(results.map(r => [r.id, "ev-" + r.id]));

const lines = fs.readFileSync("knowledge.json", "utf8").split("\n");
const out = []; let cur = null; let replaced = 0, inserted = 0;
for (const line of lines) {
  const im = line.match(/^(\s*)"id":\s*"([^"]+)"/);
  if (im) {
    cur = im[2];
    out.push(line);
    if (want.has(cur) && !(byId[cur] && byId[cur].src)) { // card has no src → insert
      out.push(`${im[1]}"src": ["${want.get(cur)}"],`); inserted++;
    }
    continue;
  }
  const sm = line.match(/^(\s*)"src"\s*:\s*\[.*\](,?)\s*$/);
  if (sm && cur && want.has(cur)) { out.push(`${sm[1]}"src": ["${want.get(cur)}"]${sm[2]}`); replaced++; continue; }
  out.push(line);
}
fs.writeFileSync("knowledge.json", out.join("\n"));
console.log(`evidence: +${results.length} | knowledge src replaced ${replaced}, inserted ${inserted}`);
