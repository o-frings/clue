import fs from "node:fs";
const links = {
  "fun-octopus-hearts": ["bio-natural-selection"],
  "fun-venus-day": ["phys-light-speed"],
  "fun-honey-keeps": ["bio-microbiome"],
  "geo-thucydides": ["geo-heartland", "hist-westphalia"],
  "econ-what-is": ["pe-what-is", "econ-supply-demand"],
  "pe-what-is": ["econ-what-is", "pe-schools"],
};
const lines = fs.readFileSync("knowledge.json","utf8").split("\n");
const out=[]; let added=0;
for(let i=0;i<lines.length;i++){ out.push(lines[i]);
  const m=lines[i].match(/^(\s*)"id":\s*"([^"]+)"/);
  if(!m||!links[m[2]]) continue;
  if(/"prereq"|"xref"/.test(lines.slice(i+1,i+4).join(" "))) continue;
  out.push(`${m[1]}"xref": ${JSON.stringify(links[m[2]])},`); added++;
}
fs.writeFileSync("knowledge.json", out.join("\n"));
console.log("Added xref to "+added+" cards.");
