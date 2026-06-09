/* One-time seed: add a second quiz question to a few cards by converting their single
 * `quiz` object into a [existing, new] array. Line-based (tracks the current card id),
 * so knowledge.json formatting is preserved. Skips cards whose quiz is already an array.
 *   node scripts/seed-quizzes.mjs
 */
import fs from "node:fs";

const extra = {
  "fun-octopus-hearts": { q: "An octopus's blue blood carries oxygen using…", choices: ["Iron-based haemoglobin", "Copper-based haemocyanin", "Dissolved chlorophyll", "Nitrogen gas"], answer: 1 },
  "math-infinities":     { q: "Which set is the 'bigger', uncountable infinity?", choices: ["The integers", "The rational numbers", "The real numbers", "The even numbers"], answer: 2 },
  "econ-what-is":        { q: "Economics begins from the problem of…", choices: ["Inflation", "Scarcity — unlimited wants, limited means", "Taxation", "The money supply"], answer: 1 },
  "philo-falsifiability":{ q: "By Popper's criterion, which claim is LEAST scientific (unfalsifiable)?", choices: ["Heavy objects fall at g in a vacuum", "Light bends near the Sun", "Whatever happens was meant to be", "Water boils at 100°C at sea level"], answer: 2 },
  "pe-keynes":           { q: "Keynes's prescription for a demand-deficient slump was…", choices: ["Cut public spending to balance the budget", "Government spending to lift aggregate demand", "Raise interest rates sharply", "Wait for wages to fall on their own"], answer: 1 },
  "econ-comparative-advantage": { q: "A country should specialise where it has the lowest…", choices: ["Absolute cost", "Opportunity cost", "Tax rate", "Wage bill"], answer: 1 },
};

const lines = fs.readFileSync("knowledge.json", "utf8").split("\n");
const idRe = /^\s*"id":\s*"([^"]+)"/;
const quizRe = /^(\s*)"quiz"\s*:\s*(\{.*\})\s*(,?)\s*$/;
let cur = null, added = 0;

const out = lines.map((line) => {
  const im = line.match(idRe);
  if (im) { cur = im[1]; return line; }
  const qm = line.match(quizRe);
  if (!qm || !cur || !extra[cur]) return line;
  const [, indent, obj, comma] = qm;
  const merged = `${indent}"quiz": [${obj}, ${JSON.stringify(extra[cur])}]${comma}`;
  added++;
  return merged;
});

fs.writeFileSync("knowledge.json", out.join("\n"));
console.log(`Added a second question to ${added} cards.`);
