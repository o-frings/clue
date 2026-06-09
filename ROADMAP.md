# Clue — Roadmap

A structured plan for the 38 update ideas. They are grouped into seven workstreams.
Most content ideas depend on two foundations — a richer content schema and a content
renderer — so those come first. Each idea below is tagged with its source checkbox.

---

## The hierarchy

```
1. FOUNDATIONS (enable everything else)
   1.1 Content schema v3
        - hyperlinked sources                          [always hyperlink]
        - evidence registry, logged per entry          [evidence.json like yalla]
        - concrete evidence-strength labels            [describe how thick, concretely]
        - cross-references between cards                [mental web]
        - prerequisite links (unlock chains)           [many layers / unlock next]
        - new card kinds: date, language, symbol        [important dates; languages]
        - glossary / symbol registry                    [jargon + canonical symbols]
   1.2 Content renderer
        - math notation (KaTeX)                         [formal notation; equations]
        - figures, graphs, images                       [figures/graphs]
        - maps                                          [geography via maps]
        - inline source links + glossary tooltips       [hyperlinks; glossary]

2. PEDAGOGY ENGINE (how content is sequenced & sticks)
        - layered unlock progression                    [many palatable layers]
        - notation introduced from zero knowledge       [maths from 0]
        - spacing / interleaving / retrieval            [follow neuroscience]
        - expanded quizzes across every aspect          [quizzes on all aspects]
        - surprise + connection mix in the feed         [surprises & connections]

3. AUTHORING STANDARDS (cross-cutting content rules)
        - always cite with links                        [hyperlinks]
        - state evidence strength concretely            [how thick, not vaguely]
        - avoid western / any bias                      [avoid bias]
        - build cross-references as you write           [mental web]

4. SUBJECT EXPANSION (the content backlog, clustered)
   4.1 World regions & geopolitics
        - China: econ, politics, history, culture, provinces, cities
        - Middle East history & geopolitics
        - colonial / post-colonial (Sahel today & past, Libya)
        - international relations & diplomacy
        - human-rights NGO conflict reports
   4.2 Quantitative & computing
        - probability, statistics, machine learning
        - computer science basics
        - clean coding
        - game theory
        - formal logic
   4.3 Philosophy
        - history of philosophy
        - epistemology
   4.4 Earth & engineering
        - climate science
        - civil engineering
   4.5 Geography & dates
        - geography via maps
        - important dates
   4.6 Languages
        - Arabic, Turkish, Chinese: words, grammar, facts
        - informal French words & expressions

5. DEBATE UPGRADE
        - draw on Mehdi Hasan, "Win Every Argument", as one source beside research
        - surface evidence strength inside case builder

6. UX FIXES
        - fix horizontal swipe on the feed
        - feed filter: learned vs unlearned
        - field-balance radar: tap to expand / read

7. ENGAGEMENT & GAMIFICATION
        - slot-machine feel (variable reward)
        - activity ring, more achievements, social leanings
        - build learn plans
```

---

## Phased roadmap

### Phase 0 — Fixes & quick wins (small, no schema change)

Ship the things that annoy daily use and need no new data.

- **Fix feed swipe.** Investigate the pager at [app.js:989-1000](app.js#L989-L1000). The
  gesture only locks horizontal when `adx > ady` at touch start, so on a scrollable feed
  most drags read as vertical. Loosen the threshold / add an edge-zone, and confirm the
  feed list isn't swallowing the gesture.
- **Feed filter: learned vs unlearned.** Add a toggle to the field-filter chip row in
  `renderFeed` ([app.js:577-640](app.js#L577-L640)), filtering on the existing per-card
  `learned` flag.
- **Field-balance radar tap-to-expand.** The radar at [app.js:827-843](app.js#L827-L843)
  is unreadable at a glance. Make it tappable to open a sheet with per-field counts and a
  legend.

### Phase 1 — Content schema v3 (the keystone)

Everything in Subject Expansion and Authoring Standards waits on this. Bump
`knowledge.json` `_meta.version` to 3 and add:

- **Evidence registry.** A dedicated `evidence.json` (mirroring the yalla pattern),
  fetched alongside `knowledge.json`: each entry `{ id, title, author, year, url, kind,
  strength }` where `strength` is a concrete description ("two RCTs, n≈12k" — never
  "strong"). Cards reference sources by id, so every citation is logged once and reused.
  Migrate the current per-card `source` object into it.
- **Cross-references.** `xref: [cardId,...]` for the mental-web links.
- **Prerequisites.** `prereq: [cardId,...]` to drive unlock chains in the pedagogy engine.
- **New card kinds.** Extend `depth`/kind with `date` (for important dates), `language`
  (word + grammar + usage fields), and `symbol` (glossary/notation entry).
- **Media slots.** `media: [{ type: 'equation'|'figure'|'map'|'image', ... }]`.
- **Glossary registry.** Top-level `glossary` map of `{ term, symbol, def, field }`, so
  jargon and canonical symbols are explained once and linkable everywhere.

Write a one-time migration so existing cards keep working (schema v2 → v3 shim).

### Phase 2 — Content renderer

Add the rendering Phase 1 made expressible. Keep the no-build-step constraint — load
libraries from CDN in [index.html](index.html), as Supabase already is.

- **Math** via KaTeX: render `equation` media and inline `$...$` in `detail`/`layers`.
- **Figures / images / maps**: a media block component the reader and feed cards can show.
  Maps can start as static SVG/image assets keyed by region.
- **Inline links**: render source ids as hyperlinks; render glossary terms as
  tap-for-definition tooltips.

### Phase 3 — Pedagogy engine

- **Layered unlock.** Formalize `layers` (gist → basics → deeper → debate) plus `prereq`
  into an unlock model: the next layer/card opens once the prior is learned. Each layer
  stays short enough to digest in one sitting.
- **Notation from zero.** Authoring rule + renderer support so a formula is always
  introduced in words first, then symbol, building up.
- **Spacing & interleaving.** Extend the existing SM-2 scheduler
  ([app.js:286-301](app.js#L286-L301)) with interleaving across fields and retrieval
  prompts, following the learning-science literature (spacing, testing effect, dual coding
  via the new figures).
- **Quiz expansion.** Generate/author quizzes across more facets per card, not just one MCQ.
- **Surprise + connection feed.** Tune feed ordering ([app.js:577-640](app.js#L577-L640))
  to interleave a surprising card with one that connects to recently-seen cards via `xref`.

### Phase 4 — Authoring standards (apply during Phase 5 writing)

A written content guide, enforced as cards are authored:
- every claim cites a registry source with a link;
- evidence strength stated concretely;
- actively counter western/other bias (sourcing, framing, examples);
- add `xref` links while writing, not after.

### Phase 5 — Subject expansion

Author content cluster by cluster (each is a self-contained batch of cards + sources +
xrefs). Suggested order — start where the renderer pays off most and bias-avoidance
matters most:

1. **World regions & geopolitics** — China, Middle East, colonial/post-colonial
   (Sahel, Libya), IR & diplomacy, human-rights NGO conflict reports. Heavy use of the
   evidence registry and maps; strong bias discipline.
2. **Quantitative & computing** — probability/statistics/ML, CS basics, clean coding,
   game theory, formal logic. Heavy use of math notation.
3. **Philosophy** — history of philosophy, epistemology.
4. **Earth & engineering** — climate science, civil engineering.
5. **Geography & dates** — map-driven geography, important dates.
6. **Languages** — Arabic, Turkish, Chinese, informal French (uses the `language` kind).

New fields will need ids/labels/icons/colors added alongside the existing 13.

### Phase 6 — Debate upgrade

- Bring in Mehdi Hasan's *Win Every Argument* as a named source beside research when
  building debate categories and rebuttal scaffolds; cite it like any other source.
- Surface each card's `strength` label inside the case builder
  ([app.js:745-774](app.js#L745-L774)) so users argue with calibrated confidence.

### Phase 7 — Engagement & gamification

- **Variable reward feed** — the slot-machine principle: occasional surprise cards, saved-card
  callbacks, streak bonuses, layered on the existing XP/streak system
  ([app.js:365-374](app.js#L365-L374)).
- **Activity ring + more achievements** — extend the achievement list
  ([app.js:382-395](app.js#L382-L395)); add a daily activity ring to the Me page.
- **Learn plans** — curated sequences over the new `prereq` graph (e.g. "China in 20 cards").
- **Social** — leaderboards / shared plans (needs a Supabase schema extension; lowest
  priority, defer until the rest lands).

---

## Dependency summary

```
Phase 0  (independent — ship first)
Phase 1  ──> Phase 2 ──> Phase 3
   │                       │
   └──> Phase 4 ──> Phase 5 (clusters) ──> Phase 6
                              └──────────> Phase 7
```

Phase 0 is independent. Phases 1→2→3 are the technical spine. Phase 5 (the bulk of the
work, content authoring) needs 1, 2, and 4 in place. Phases 6 and 7 build on the content
and the gamification primitives respectively.
