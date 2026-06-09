/* One-time seed (round 2): add xref links to cards that still have none, to densify the
 * mental web. Line-based; skips any card that already has a prereq/xref line. Targets must
 * exist (validated after). node scripts/seed-links-2.mjs */
import fs from "node:fs";

const links = {
  "bio-natural-selection": ["bio-crispr", "philo-falsifiability"],
  "bio-crispr": ["bio-natural-selection"],
  "bio-microbiome": ["bio-natural-selection"],
  "eco-planetary-boundaries": ["sys-commons", "econ-externalities"],
  "eco-yellowstone": ["sys-feedback", "bio-natural-selection"],
  "eco-haber-bosch": ["eco-planetary-boundaries", "eh-industrial-revolution"],
  "sys-commons": ["econ-externalities", "poli-collective-action"],
  "sys-feedback": ["sys-commons", "sys-powerlaw"],
  "sys-powerlaw": ["math-simpson"],
  "poli-collective-action": ["sys-commons"],
  "poli-median-voter": ["poli-duverger"],
  "poli-duverger": ["poli-median-voter"],
  "geo-heartland": ["geo-thucydides", "geo-hormuz"],
  "geo-hormuz": ["geo-heartland"],
  "geo-demographic": ["eco-planetary-boundaries"],
  "hist-blackdeath": ["eh-enclosure", "date-constantinople-1453"],
  "hist-printing": ["date-constantinople-1453"],
  "hist-westphalia": ["geo-thucydides", "date-french-revolution-1789"],
  "math-godel": ["math-infinities"],
  "math-simpson": ["math-base-rate", "sys-powerlaw"],
  "math-infinities": ["math-godel"],
  "phys-cmb": ["phys-light-speed", "phys-entropy"],
  "phys-light-speed": ["phys-cmb"],
  "eh-2008": ["pe-keynes", "econ-externalities"],
  "eh-bretton-woods": ["eh-great-depression", "pe-keynes"],
  "eh-enclosure": ["pe-smith-wealth", "hist-blackdeath"],
  "eh-industrial-revolution": ["eh-enclosure", "eco-haber-bosch"],
  "fun-1816-no-summer": ["eco-planetary-boundaries"],
  "philo-veil": ["philo-is-ought", "date-french-revolution-1789"],
  "philo-is-ought": ["philo-falsifiability"],
  "pe-historical-materialism": ["pe-marx-capital", "eh-industrial-revolution"],
  "econ-gdp": ["econ-externalities"],
};

const lines = fs.readFileSync("knowledge.json", "utf8").split("\n");
const out = [];
let added = 0;
for (let i = 0; i < lines.length; i++) {
  out.push(lines[i]);
  const m = lines[i].match(/^(\s*)"id":\s*"([^"]+)"/);
  if (!m || !links[m[2]]) continue;
  if (/"prereq"|"xref"/.test(lines.slice(i + 1, i + 4).join(" "))) continue; // already linked
  out.push(`${m[1]}"xref": ${JSON.stringify(links[m[2]])},`);
  added++;
}
fs.writeFileSync("knowledge.json", out.join("\n"));
console.log(`Added xref to ${added} cards.`);
