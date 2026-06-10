/* Set `level` and `prereq` on cards from a map {id:{level,prereq:[...]}} to form
 * depth ladders. Line-based: rewrites "level": N on the id line and inserts a
 * "prereq": [...] line after it (skips if a prereq line already follows).
 *   node scripts/set-ladder.mjs /tmp/ladder_X.json
 */
import fs from "node:fs";
const map = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const lines = fs.readFileSync("knowledge.json", "utf8").split("\n");
const out = []; let lvls = 0, pre = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/^(\s*)"id":\s*"([^"]+)"/);
  if (!m || !map[m[2]]) { out.push(line); continue; }
  const cfg = map[m[2]];
  let l = line;
  if (cfg.level != null && /"level":\s*\d+/.test(l)) { l = l.replace(/"level":\s*\d+/, `"level": ${cfg.level}`); lvls++; }
  out.push(l);
  if (cfg.prereq && cfg.prereq.length) {
    const ahead = lines.slice(i + 1, i + 5).join(" ");
    if (!/"prereq"/.test(ahead)) { out.push(`${m[1]}"prereq": ${JSON.stringify(cfg.prereq)},`); pre++; }
  }
}
fs.writeFileSync("knowledge.json", out.join("\n"));
console.log(`levels set: ${lvls} | prereq lines added: ${pre}`);
