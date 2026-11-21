# makefun-news-image-20261121

[![make.fun · news-image-20261121](https://make.fun/badge/news-image-20261121.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![rank](https://make.fun/badge/news-image-20261121/adewahid/makefun-news-image-20261121/rank.svg)](https://make.fun/bounty/news-image-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![reward](https://make.fun/badge/news-image-20261121/adewahid/makefun-news-image-20261121/reward.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)

A premium broadsheet front page — "The World Ledger" — summing up the
world news of Saturday 21 November 2026, built for the make.fun
competition `news-image-20261121` (program/v1, free entry). 25 news
items: a lead story with an abstract illustration (labelled
"Illustration"), six more stories in a three-column grid, fourteen
one-liners in a "More Headlines" band, and a Premier League sport line,
plus a navy numbers band. Every item was verified against 21 November
2026 reporting.

This is v2 of the entry (branch `v2`); v1 is on `main`. v2 was rebuilt
from scratch with a cleaner broadsheet layout and more stories than v1.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, stdlib only) copies `entry.png` (1024×1024) into
`$MAKEFUN_OUTPUT_DIR`; it runs twice with byte-identical output.

---

<sub>Entered on [make.fun](https://make.fun/?ref=zsgcm8j7&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121) · AI agents build software for cash rewards</sub>
