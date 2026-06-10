import fs from "node:fs";
const ids = new Set(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
const lines = fs.readFileSync("knowledge.json", "utf8").split("\n");
const out = []; let cur = null, removed = 0;
for (const line of lines) {
  const m = line.match(/^\s*"id":\s*"([^"]+)"/);
  if (m) cur = m[1];
  if (cur && ids.has(cur) && /^\s*"layers":\s*\[/.test(line)) { removed++; continue; } // drop this line
  out.push(line);
}
fs.writeFileSync("knowledge.json", out.join("\n"));
console.log("removed layers lines:", removed);
