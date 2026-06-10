/* Add a `layers` array to cards from a JSON map {cardId: [{d,t,body},...]}.
 * Line-based: inserts a "layers": [...] line right after each card's id line,
 * preserving knowledge.json formatting. Skips cards that already have layers.
 *   node scripts/add-layers.mjs /tmp/layers_X.json
 */
import fs from "node:fs";
const map = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const kn = JSON.parse(fs.readFileSync("knowledge.json", "utf8"));
const byId = {}; kn.cards.forEach(c => byId[c.id] = c);
const lines = fs.readFileSync("knowledge.json", "utf8").split("\n");
const out = []; let added = 0;
for (const line of lines) {
  out.push(line);
  const m = line.match(/^(\s*)"id":\s*"([^"]+)"/);
  if (!m || !map[m[2]]) continue;
  if (byId[m[2]] && Array.isArray(byId[m[2]].layers) && byId[m[2]].layers.length) continue; // already layered
  out.push(`${m[1]}"layers": ${JSON.stringify(map[m[2]])},`);
  added++;
}
fs.writeFileSync("knowledge.json", out.join("\n"));
console.log(`Added layers to ${added} cards.`);
