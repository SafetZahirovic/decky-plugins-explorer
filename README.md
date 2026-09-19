# Decky Loader Plugin Registry

A static, searchable index of public GitHub repositories that ship a `plugin.json`
manifest matching the [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)
plugin schema.

Live site: served via GitHub Pages from the repository root.

## What it does

- Lists every discovered plugin repo with its name, author, description, and tags
  (pulled from `plugin.json`'s `publish` block).
- Lets you preview each repo's rendered README in a modal, without leaving the page.
- Detects an install script (any `*install*.sh` file, excluding uninstallers) in the
  repo and shows the one-line `curl | bash` command to run it on Linux.
- Shows total release-asset downloads and the latest release date/tag, where the
  repo publishes GitHub Releases.
- Client-side search, a multi-select tag picker (searchable, selections shown as
  removable pills; matches any selected tag), and sort by stars / downloads /
  release date / name. No backend.

## Structure

- `index.html`, `style.css`, `app.js` — the static site itself.
- `data/plugins.json` — pre-fetched dataset (repo metadata, plugin.json contents,
  README markdown, install script path) consumed by `app.js` at load time.
- `scripts/search_repos.py` — runs the GitHub code search for `plugin.json` files
  and prints deduped `owner/repo<TAB>blob-url` lines.
- `scripts/fetch_data.py` — rebuilds `data/plugins.json` from a list of
  `owner/repo<TAB>https://github.com/owner/repo/blob/<sha>/<path-to-plugin.json>` lines
  (as produced by `search_repos.py`). Requires `gh auth login`, or a `GH_TOKEN`/
  `GITHUB_TOKEN` env var.
- `scripts/fix_install_scripts.py` — re-runs only the install-script detection step
  against an existing `data/plugins.json`.
- `scripts/filter_dataset.py` — drops entries whose `plugin.json` doesn't actually
  match the Decky schema (`flags` as a list, `publish` as an object). The code
  search also turns up unrelated ecosystems — AI "skill" manifests, WordPress/TFS/
  XL-Release plugins — that happen to reuse a `plugin.json` filename and some of
  the same key names.
- `scripts/fetch_releases.py` — adds `downloads` (sum of release-asset download
  counts) and `latest_release` (tag + published date) to each entry.

## Regenerating the data

```bash
python3 scripts/search_repos.py > repos.txt
python3 scripts/fetch_data.py repos.txt data/plugins.json
python3 scripts/filter_dataset.py data/plugins.json
python3 scripts/fetch_releases.py data/plugins.json
```

## Nightly refresh

[`.github/workflows/refresh.yml`](.github/workflows/refresh.yml) runs the four
commands above every night at **01:00 UTC** (plus on-demand via the Actions tab's
"Run workflow" button) and commits `data/plugins.json` if anything changed.

The full refresh makes roughly 2,500+ GitHub API requests (a handful per repo,
across ~600 repos). The default `GITHUB_TOKEN` GitHub Actions provides is capped
at 1,000 requests/hour, so the workflow needs a personal access token with the
normal 5,000/hour limit instead, stored as a repo secret named
`PLUGIN_DATA_TOKEN`:

1. Create a token at [github.com/settings/tokens](https://github.com/settings/tokens)
   (classic token, no scopes needed — everything read here is public) or a
   fine-grained token scoped to "Public repositories (read-only)".
2. Add it as a repo secret without ever pasting it into chat or a file:
   ```bash
   gh secret set PLUGIN_DATA_TOKEN --repo SafetZahirovic/decky-plugins-explorer
   ```
   (paste the token at the prompt), or via the repo's Settings → Secrets and
   variables → Actions → "New repository secret" in the browser.

Without that secret, the workflow fails fast with a clear error instead of
silently hitting the rate limit partway through.

## Caching

GitHub Pages caches `index.html`, `app.js`, `style.css`, and `data/plugins.json`
independently (`max-age=600`). Deploying `app.js`/`style.css` changes without
also changing `index.html`'s reference to them can leave a visitor with a
mismatched, stale copy of one file for up to 10 minutes. Each is referenced
with a `?v=N` query string in `index.html` (and the fetch call in `app.js`
for the data file) — **bump `N` on every deploy that touches `app.js`,
`style.css`, or `data/plugins.json`** so the new `index.html` always points
at the matching fresh copies.

## AI use in this project

This project was built with [Claude Code](https://claude.com/claude-code), Anthropic's
AI coding assistant, directed and reviewed by a human ([@SafetZahirovic](https://github.com/SafetZahirovic)).
In the interest of transparency:

- **The site, scripts, and this README were written by Claude**, prompted and
  steered turn-by-turn by the repo owner (what to build, which bugs to fix, which
  features to add). The owner reviewed and approved each change before it was
  pushed, but did not hand-write the code.
- **The plugin dataset (`data/plugins.json`) was assembled by an AI agent**, not
  hand-curated. It ran GitHub code searches for `plugin.json` files, applied a
  heuristic filter (`flags` is a list and `publish` is an object) to separate real
  Decky plugins from unrelated projects that happen to reuse the same filename and
  key names, and fetched each repo's README/release data via the GitHub API. That
  heuristic is imperfect: it has already been tightened once after false positives
  slipped through (see git history), and it may still miss valid plugins with an
  unusual manifest shape, or include a repo that isn't actually a working plugin.
- **Install commands are extracted mechanically**, not vetted for safety. The site
  shows a `curl | bash` command whenever a repo contains a file matching
  `*install*.sh` (excluding uninstallers) — no one has reviewed what those scripts
  actually do. Treat every install command as untrusted third-party code, same as
  you would if you found it by browsing the repo yourself.
- **Nothing here has been fact-checked against the Decky Store or Discord** —
  this is an independent index built purely from public GitHub metadata.
- **The dataset re-runs unattended every night** (see "Nightly refresh" below).
  Each run re-applies the same heuristics with no human in the loop, so a
  misclassification isn't a one-off — check the pipeline logic, not just today's
  data, before assuming an issue is fixed.

If you spot a misclassified repo, a bad install-script match, or stale data,
[open an issue](https://github.com/SafetZahirovic/decky-plugins-explorer/issues) —
it likely reflects a limitation of the automated pipeline described above rather
than a manually-reviewed editorial decision.

## Disclaimer

Not affiliated with Valve or the Decky Loader project. Data is collected from public
GitHub repositories; install scripts are executed at the user's own risk — review any
script before piping it into `bash`.
