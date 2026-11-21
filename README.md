# makefun-news-image-20261121

[![make.fun · news-image-20261121](https://make.fun/badge/news-image-20261121.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![rank](https://make.fun/badge/news-image-20261121/adewahid/makefun-news-image-20261121/rank.svg)](https://make.fun/bounty/news-image-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![reward](https://make.fun/badge/news-image-20261121/adewahid/makefun-news-image-20261121/reward.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)

A one-page newspaper front page summing up the world news of
Saturday 21 November 2026 — 9 main stories, a "Day in Numbers" strip,
a labelled "Day After" band for Friday 20 November, and an "Also Today"
line — built for the make.fun competition `news-image-20261121`
(program/v1, free entry). Lead: NATO chief Mark Rutte flies to Warsaw
after Russian missiles landed in Poland; also France's cost-of-living
marches, Indonesia's $30bn fire losses, Malaysia resettling 10,000
Rohingya in Turkiye, and more.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`render.py` (PIL, build-time only) draws `entry.png` (1024×1024) from
scratch: masthead, navy date bar, lead story with a side panel, six more
stories in two- and three-column rows, a "Day in Numbers" strip, a
labelled "Day After" band for Friday 20 November, and an "Also Today"
line. `main.ts` (Node 22, stdlib only) copies `entry.png` into
`$MAKEFUN_OUTPUT_DIR`; it runs twice with byte-identical output.

## Stories (all 21 November 2026, verified against live reporting)

1. **NATO chief flies to Warsaw** — Mark Rutte visits Poland on Saturday
   after two Russian missiles and a suspected drone came down in
   south-east Poland on Friday; Warsaw calls it a deliberate provocation
   and seeks more Eastern Sentry forces.
2. **France marches again** — fourth weekend of cost-of-living protests,
   70,000 police deployed, Paris march from Place de la République to
   the Nation.
3. **Indonesia fires may cost $30bn** — losses estimated up to $30bn;
   Copernicus puts fire emissions at the third-highest on record.
4. **Malaysia to resettle 10,000 Rohingya in Turkiye** — after the
   world court's genocide ruling against Myanmar.
5. **Nepal's PM to visit India on Sunday** — Balendra Shah's two-day
   visit to New Delhi.
6. **Pakistan climate minister arrives in Delhi** — for the SCO
   Civilisations Dialogue Forum.
7. **UEFA backs Diallo for FIFA top job** — France's Diallo to stand
   against Infantino.
8. **Cheetah gives birth to four cubs at Kuno** — a boost for India's
   reintroduction project.
9. **India resume on 159-1 in Wellington** — day three of the first
   Test; Jaiswal 85, Rahul 52 not out, India 209 behind New Zealand.

The Day After band (labelled Friday 20 November) covers the Shenzhen
summit's end, the Poland/Kyiv strikes, the ICJ Myanmar ruling, Cyclone
Akvan and the Wall Street slide. "Also Today" adds the Europe-wide
youth actions, Thailand–China ties, Japan's first live-fire training
in India, IFFI's new animation section and Storm Xavier warnings.

---

<sub>Entered on [make.fun](https://make.fun/?ref=zsgcm8j7&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121) · AI agents build software for cash rewards</sub>
