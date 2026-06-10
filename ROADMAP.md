# Clue — Roadmap

A structured plan for the 38 update ideas. They are grouped into seven workstreams.
Most content ideas depend on two foundations — a richer content schema and a content
renderer — so those come first. Each idea below is tagged with its source checkbox.

---

## North star (the engagement model)

Clue is addictive the way TikTok/Instagram are — a frictionless, variable-reward feed —
and **not** the way Duolingo is. There are **no daily/weekly targets, no streaks, no XP,
no levels, no badge grid, no guilt**. Curiosity is the engine; obligation is banned.

Decisions that govern everything below:

1. **No obligation.** Delete streaks, XP, levels, daily `pace`/ration, the "N due" queue,
   and the volume/habit achievements. Nothing nags; nothing punishes a missed day.
2. **Two surfaces, shared state.**
   - **Feed** — the slot machine: flawless swipe, variable reward, every *gist* written as
     a sub-second hook. The acquisition + habit engine.
   - **Web** — a living mind-map of *your* knowledge: learned nodes, real `xref` edges, dim
     frontier stubs for what's next, faded nodes for memory due a refresh. The depth,
     navigation, and progress artifact — it replaces XP/levels/streak/badges.
   The Feed periodically pays out a *door to the Web* ("you've grazed 5 cards near the Hu
   line — open the thread?").
3. **Optimize engaged-learning, not time-on-app.** The recommender blends an *engagement*
   signal (dwell, swipe-through, voluntary return, saves) with a *learning* signal (rungs
   climbed, retrieval that succeeded, new web nodes/edges, clusters completed). It favors
   items likely to be **both** enjoyed and advancing; an anti-fluency guard caps shallow
   gist runs and periodically surfaces a depth-pull or retrieval. A pure engagement
   maximiser is forbidden — it would ship a fluency-illusion machine that teaches nothing.
4. **Invisible spaced repetition.** Keep the SM-2 science; kill the queue. Due cards gain
   feed weight and render as faded web nodes; retrieval is woven in as the *price of
   climbing* the next rung — effortful, intrinsic, never a counted chore.
5. **Six discoveries, not achievements.** Recast as one-time observations living on the
   web: first connection · crossed fields · climbed to debate · closed a thread · completed
   a cluster · read-it-unaided. Framed "here's what you can now do," never a trophy.
6. **The atom is the thread/ladder, not the flashcard.** A card is a rung
   (gist → basics → deeper → debate).
7. **Guardrail.** Pull comes from quality and personalization, never engineered
   attention-traps. No removed stopping cues — sustained attention *is* deep curiosity.

Why this is sound (not just taste): removing extrinsic rewards avoids the
**overjustification effect** (Lepper et al. 1973) that poisons intrinsic interest; the
frontier/open-loop design is **information-gap curiosity** (Loewenstein 1994) which also
*improves* memory (Gruber et al. 2014); retrieval-as-price-of-climbing preserves the
**testing effect** (Roediger & Karpicke) without obligation; the blended objective protects
**desirable difficulty** (Bjork) against the **fluency illusion** a TikTok recommender would
otherwise create.

**Shell:** Web · Feed · Debate · You(settings). (The old "Today" tab and its chore
dashboard are deleted.)

**Build order, front of queue:** (1) flawless feed swipe — the slot machine must not jank;
(2) the preference-learning recommender on the engaged-learning objective;
(3) gist-as-hook authoring.

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

7. ENGAGEMENT (curiosity, not compliance — see North star)
        - frictionless variable-reward feed             [slot-machine feel]
        - preference-learning recommender (engaged-learning objective)
        - the living web as the sole progress artifact  [replaces ring/achievements]
        - six discoveries, recast from achievements
        - DELETED: streaks, XP, levels, daily pace, due queue, badge grid, "Today" tab
```

---

## Phased roadmap

### Phase 0 — Fixes & quick wins (small, no schema change)

Ship the things that annoy daily use and need no new data.

- **Fix feed swipe — PRIORITY #1 (the slot machine must not jank).** Investigate the pager
  at [app.js:989-1000](app.js#L989-L1000). The gesture only locks horizontal when
  `adx > ady` at touch start, so on a scrollable feed most drags read as vertical. Loosen
  the threshold / add an edge-zone, and confirm the feed list isn't swallowing the gesture.
  Under the North star the feed *is* the acquisition engine; a janky swipe is fatal.
- **Feed filter: learned vs unlearned.** Add a toggle to the field-filter chip row in
  `renderFeed` ([app.js:577-640](app.js#L577-L640)), filtering on the existing per-card
  `learned` flag.
- **Field-balance radar tap-to-expand.** (Superseded by the living web in Phase 7; keep
  only if the web slips.) The radar at [app.js:827-843](app.js#L827-L843) is unreadable at
  a glance.

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

### Phase 3 — Pedagogy engine (reframed around the web + blended recommender)

See the North star — there is no SRS queue and no daily ration; retrieval and depth live
inside exploration.

- **Layered unlock.** Formalize `layers` (gist → basics → deeper → debate) plus `prereq`
  into an unlock model: the next layer/card opens once the prior is learned. Each layer
  stays short enough to digest in one sitting. The ladder is the atom; a card is a rung.
- **Retrieval as the price of climbing.** Before opening the next rung, a light recall of
  the prior gist ("does it still land?") — effortful, intrinsic, never a counted chore.
  This is how the testing effect survives the deletion of the due queue.
- **Invisible SM-2.** Keep `schedule()` ([app.js:294-309](app.js#L294-L309)); delete the
  visible `due` queue/counter and `newAllowedToday()` ([app.js:319](app.js#L319)). Due
  cards instead gain feed weight and render as faded web nodes.
- **Blended recommender.** Replace `candidateScore`/feed ordering
  ([app.js:577-640](app.js#L577-L640)) with a preference-learning scorer on the
  *engaged-learning* objective (engagement signal × learning signal), with an anti-fluency
  guard. This is the engagement workstream's core; detailed in Phase 7.
- **Notation from zero.** Authoring rule + renderer support so a formula is always
  introduced in words first, then symbol, building up.

### Phase 3b — The living web (the progress artifact)

The single replacement for XP/levels/streak/achievements. Renders **only the user's known
region + its frontier**, so it never becomes a hairball:

- **Nodes** = learned cards; **edges** = real `xref` links; **dim stubs** = unexplored
  neighbors (the open loops — tap to learn next); **faded nodes** = memory due a refresh
  (tap → the soft-retrieval moment). Recently-refreshed nodes render bright.
- Cluster-seeded force layout (nodes gravitate to their field region) on the existing
  canvas stack (`drawRing`/`drawFieldRadar` patterns). Pan/zoom; tap a node → reader.
- The **six discoveries** live here as one-time annotations.
- **Dependency:** richness scales with `xref` density — every new card ships with its
  connections (Authoring Standards, Phase 4).

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

### Phase 7 — Engagement (curiosity, not compliance)

This phase replaces the old gamification entirely. See the North star for the rationale.

**7.0 Obligation teardown (do first — it's the identity change).** Delete from `app.js`:
streak + `drawRing` streak usage, XP/`awardXp`/`levelFor`, daily `pace`/`newAllowedToday`,
the visible `due` queue/counter, the `ACHIEVEMENTS[]` grid + `checkAchievements` toasts,
and the "Today" tab/home dashboard. Restructure the shell to **Web · Feed · Debate · You**.
Keep `schedule()` (now invisible) and `progress` (now powers web node state).

**7.1 The slot-machine feed.** Frictionless swipe (Phase 0 #1), variable reward
(surprise / connection / saved-card callback / a door to the web), each gist a sub-second
hook.

**7.2 Preference-learning recommender (engaged-learning objective).** Per-user weights
over fields, surprise-types, and depth, updated online from behavior. Score blends:
- *engagement* — dwell, swipe-through, return, saves;
- *learning* — rungs climbed, retrieval success, new web nodes/edges, cluster completion.
Anti-fluency guard caps consecutive shallow gists and injects a depth-pull or retrieval.
Forbidden: optimizing engagement alone.

**7.3 The living web** — see Phase 3b. The sole progress artifact.

**7.4 Six discoveries** — recast from achievements, one-time annotations on the web:
first connection · crossed fields · climbed to debate · closed a thread · completed a
cluster · read-it-unaided. Never a trophy grid.

**7.5 Social (deferred, optional).** Only *non-competitive* relatedness (share a thread,
"someone explored this corner") — never leaderboards. Lowest priority; needs Supabase.

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
work, content authoring) needs 1, 2, and 4 in place. Phase 6 builds on the content.
Phase 7 (engagement, per the North star) starts with the obligation teardown (7.0), which
is independent and can land early; the feed/recommender/web build on 1–3.
