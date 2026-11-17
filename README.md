# mrHumildad.github.io

The root user site: a one-page developer portfolio for Maximilien Notaro /
[@mrHumildad](https://github.com/mrHumildad). Sections: profile, five selected
builds, a short bio, and a GitHub telemetry panel at the
bottom that refreshes daily.

## What lives here

| Path | What it is |
|---|---|
| `index.html` | The whole page. English copy is inline; Spanish is swapped in from `assets/i18n/es.js`. |
| `assets/css/style.css` | Hand-written CSS, no framework. |
| `assets/js/main.js` | Language toggle, stats rendering, theme, receipt counter, two easter eggs. |
| `assets/i18n/es.js` | Spanish copy, keyed by the `data-i18n` attributes in `index.html`. Loaded as a script, so the toggle also works from `file://`. |
| `assets/img/` | Screenshots, logos, OG image and favicon. |
| `llm.md` | Markdown summary of the page for LLMs and scrapers, linked by the CRT banner under the hero. Update it when a project or the numbers change. |
| `stats.json` | Generated daily — **do not edit by hand**. Machine-readable copy, also read by the fallback image script. |
| `assets/js/stats.js` | The same payload as `stats.json`, wrapped in `window.MH_STATS` and loaded with a `<script>`, so the telemetry block also renders from `file://`. Generated daily too. |
| `scripts/fetch-stats.mjs` | Stats generator (REST API + GitHub's public contribution calendar). |
| `scripts/render-stats-fallback.py` | Renders `assets/img/stats-fallback.png`, the static snapshot shown when the live stats call fails. Needs Pillow. |
| `.github/workflows/stats.yml` | Runs the generator every morning and commits `stats.json`, `assets/js/stats.js` and the fallback image when they changed. |
| `app-ads.txt` | AdMob verification for the Android apps. **Must stay at the domain root, unchanged and byte-identical.** |

## Editing copy

English lives directly in `index.html`. Spanish lives in
`assets/i18n/es.js` under the same keys as the `data-i18n`,
`data-i18n-aria` and `data-i18n-content` attributes. Change one, change the
other — no build step will catch a missing key.

`es.js` is a plain script that assigns `window.MH_I18N_ES`, pulled in only
when the visitor picks Spanish. It was a `fetch`ed JSON file before, which
broke the toggle whenever `index.html` was opened straight from disk.

## Replacing a screenshot

Drop a new `assets/img/<project>.webp` (and `.avif` next to it) and update the
`width`/`height` attributes on that card's `<img>`. Keep portraits around
560 px wide and landscape shots around 900 px.

## Refreshing stats locally

```bash
node scripts/fetch-stats.mjs
python3 scripts/render-stats-fallback.py   # refresh the static fallback image
```

No secret is needed. Repository counts come from the public REST API (the
workflow passes `GITHUB_TOKEN` for the higher rate limit) and the contribution
calendar is parsed from `https://github.com/users/<login>/contributions`, since
the Action's bot token cannot read a personal GraphQL contributions collection.

If the calendar cannot be read, `stats.json` is still written with the repo
totals and the page shows a "calendar pending" line instead of an empty grid.
The page reads `assets/js/stats.js` (`window.MH_STATS`), falling back to a
`stats.json` fetch if that script is missing — a local file `fetch()` fails, a
`<script>` does not.

## Preview

```bash
python3 -m http.server 8080
# http://localhost:8080/
```

## Deploy

Push to `main`. GitHub Pages serves this repository at
`https://mrhumildad.github.io/`.
