/* One-time seed: add a starter cross-reference web (prereq = "builds on",
 * xref = "connects to") to existing cards. Line-based insertion right after each
 * card's "id": line, so knowledge.json formatting is preserved.
 *
 * Run once:  node scripts/seed-links.mjs   (not idempotent — skips cards already linked)
 */
import fs from "node:fs";

const links = {
  // economics core
  "econ-supply-demand":        { prereq: ["econ-what-is"], xref: ["pe-marginalist", "econ-loss-aversion"] },
  "econ-comparative-advantage":{ prereq: ["econ-what-is"], xref: ["pe-ricardo"] },
  "econ-externalities":        { xref: ["sys-commons", "eco-planetary-boundaries", "eh-2008"] },
  "econ-loss-aversion":        { xref: ["math-base-rate"] },
  // political economy web
  "pe-smith-wealth":           { prereq: ["pe-what-is"], xref: ["pe-division-labour", "pe-ltv"] },
  "pe-division-labour":        { prereq: ["pe-smith-wealth"] },
  "pe-ricardo":                { prereq: ["pe-smith-wealth"], xref: ["econ-comparative-advantage"] },
  "pe-ltv":                    { xref: ["pe-marx-capital", "pe-marginalist"] },
  "pe-marginalist":            { prereq: ["pe-ltv"], xref: ["econ-supply-demand"] },
  "pe-marx-capital":           { prereq: ["pe-ltv"], xref: ["pe-historical-materialism"] },
  "pe-keynes":                 { prereq: ["pe-what-is"], xref: ["pe-paradox-thrift", "eh-great-depression", "pe-friedman"] },
  "pe-paradox-thrift":         { prereq: ["pe-keynes"] },
  "pe-friedman":               { xref: ["pe-keynes", "eh-stagflation", "pe-hayek"] },
  "pe-hayek":                  { xref: ["pe-friedman", "pe-schools"] },
  "pe-schools":                { xref: ["pe-keynes", "pe-friedman", "pe-marx-capital", "pe-hayek"] },
  // economic history
  "eh-great-depression":       { xref: ["pe-keynes", "eh-bretton-woods"] },
  "eh-stagflation":            { xref: ["pe-friedman", "eh-neoliberal-turn"] },
  "eh-neoliberal-turn":        { prereq: ["eh-stagflation"], xref: ["pe-hayek", "pe-friedman"] },
  // science / reasoning
  "phys-uncertainty":          { xref: ["phys-light-speed"] },
  "phys-entropy":              { xref: ["phys-cmb"] },
  "math-base-rate":            { xref: ["math-simpson", "econ-loss-aversion"] },
  "philo-falsifiability":      { xref: ["philo-is-ought"] },
};

const raw = fs.readFileSync("knowledge.json", "utf8");
const lines = raw.split("\n");
const out = [];
let added = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  out.push(line);
  const m = line.match(/^(\s*)"id":\s*"([^"]+)"/);
  if (!m || !links[m[2]]) continue;
  // skip if this card already has prereq/xref on the next few lines
  const ahead = lines.slice(i + 1, i + 4).join(" ");
  if (/"prereq"|"xref"/.test(ahead)) continue;
  const [, indent, id] = m;
  const L = links[id];
  if (L.prereq) out.push(`${indent}"prereq": ${JSON.stringify(L.prereq)},`);
  if (L.xref)   out.push(`${indent}"xref": ${JSON.stringify(L.xref)},`);
  added++;
}

fs.writeFileSync("knowledge.json", out.join("\n"));
console.log(`Seeded links on ${added} cards.`);
