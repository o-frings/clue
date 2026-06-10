import fs from "node:fs";
const ids = new Set(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
const lines = fs.readFileSync("knowledge.json", "utf8").split("\n");
const out = []; let cur = null, removed = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/^\s*"id":\s*"([^"]+)"/);
  if (m) cur = m[1];
  if (cur && ids.has(cur) && /^\s*"layers":\s*\[/.test(line)) {
    removed++;
    // single-line array? (closes on same line)
    if (/\]\s*,?\s*$/.test(line)) continue;
    // multi-line: skip until the array-closing line (indented "]," or "]")
    while (i + 1 < lines.length && !/^\s*\]\s*,?\s*$/.test(lines[i + 1])) i++;
    i++; // also skip the closing bracket line
    continue;
  }
  out.push(line);
}
fs.writeFileSync("knowledge.json", out.join("\n"));
console.log("removed layers blocks:", removed);
