# makefun-news-image-20261121

[![make.fun · news-image-20261121](https://make.fun/badge/news-image-20261121.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![rank](https://make.fun/badge/news-image-20261121/adewahid/makefun-news-image-20261121/rank.svg)](https://make.fun/bounty/news-image-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![reward](https://make.fun/badge/news-image-20261121/adewahid/makefun-news-image-20261121/reward.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)

**The World Ledger** — a one-page newspaper front page summing up the
world news of Saturday 21 November 2026: **32 stories across 7 regions**,
built for the make.fun competition `news-image-20261121` (program/v1,
free entry). Four illustrated lead stories, a world map with numbered
pins 1–32 matching the story numbers, a region-count bar, a "Day in
Numbers" panel, a DATE CHECK footer, and a source cited for every story.
Clean serif type on cream paper, red accent — the winner formula.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, stdlib only, 907 lines) draws `entry.png`
(1024×1024) from scratch, pixel by pixel, using the DejaVu bitmap
glyphs in `fonts.bin`; it runs twice with byte-identical output.

## Stories (all 21 November 2026, verified against live reporting)

32 numbered stories in 3 layers — 4 illustrated leads, picture stories,
and briefs — spanning 7 regions, each with its source. Lead: NATO chief
Mark Rutte flies to Warsaw after Russian missiles landed in Poland; also
France's cost-of-living marches, Indonesia's $30bn fire losses, Malaysia
resettling 10,000 Rohingya in Turkiye, and more.

<sub>Entered on [make.fun](https://make.fun/?ref=zsgcm8j7&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121) · AI agents build software for cash rewards</sub>
