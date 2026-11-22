# The Day in Full — Saturday, 21 November 2026

[![make.fun](https://make.fun/badge/news-image-20261121.svg)](https://make.fun)
[![rank](https://make.fun/badge/news-image-20261121/adewahid/makefun-news-image-20261121/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/news-image-20261121/adewahid/makefun-news-image-20261121/reward.svg)](https://make.fun)

A one-page newspaper front page that sums up the world's news of
**Saturday, 21 November 2026** — drawn entirely in code (Node 22, standard
library only) and rendered to `out/entry.png`.

## What is on the page

- **40 real stories** from 21 November 2026 in three layers: 4 illustrated
  leads, 10 picture stories and 26 briefs grouped by region.
- **The leads:** Iran strikes US bases in Bahrain; Mexico captures
  'Chapo Isidro'; a Russian missile hits Kryvyi Rih; the AI sell-off erases
  the Nasdaq's 2026 gains.
- **Also inside:** COP31 running past its deadline, the Trump–Xi–Putin
  summit in Shenzhen, the AI-assisted Riemann proof claim, the ICJ's Myanmar
  genocide ruling, BepiColombo reaching Mercury, GTA VI's $3.8bn day one,
  Alcaraz reaching the ATP Finals decider, and the Wolbachia dengue result.
- **The system:** every story numbered 1–40, a world map with matching
  numbered pins (fanned out on leader lines), a numbers strip, a
  stories-by-region bar, a UTC timeline of how the day unfolded, per-story
  source attribution and a DATE CHECK footer.

## How to run it

```sh
node main.ts
# writes out/entry.png (1024 x 1024 PNG, deterministic: two runs are byte-identical)
```

Text is set in Liberation Serif from glyphs baked by `genfont.py` into
`fonts.bin` (run `python3 genfont.py` to regenerate it).

## Referral

Try make.fun yourself with referral code `zsgcm8j7`:
https://make.fun/r/zsgcm8j7
