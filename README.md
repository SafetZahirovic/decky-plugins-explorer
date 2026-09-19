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
- Client-side search, tag filter, and sort by stars / downloads / release date /
  name. No backend.

## Structure

- `index.html`, `style.css`, `app.js` — the static site itself.
- `data/plugins.json` — pre-fetched dataset (repo metadata, plugin.json contents,
  README markdown, install script path) consumed by `app.js` at load time.
- `scripts/fetch_data.py` — rebuilds `data/plugins.json` from a list of
  `owner/repo<TAB>https://github.com/owner/repo/blob/<sha>/<path-to-plugin.json>` lines
  (as produced by a GitHub code search for `plugin.json` files). Requires `gh auth login`.
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
gh search code "flags" "publish" filename:plugin.json --limit 1000 \
  --json path,repository,url > repos.json
# convert repos.json to owner/repo<TAB>blob-url lines, then:
python3 scripts/fetch_data.py repos.txt data/plugins.json
python3 scripts/filter_dataset.py data/plugins.json
python3 scripts/fetch_releases.py data/plugins.json
```

## Caching

GitHub Pages caches `index.html`, `app.js`, `style.css`, and `data/plugins.json`
independently (`max-age=600`). Deploying `app.js`/`style.css` changes without
also changing `index.html`'s reference to them can leave a visitor with a
mismatched, stale copy of one file for up to 10 minutes. Each is referenced
with a `?v=N` query string in `index.html` (and the fetch call in `app.js`
for the data file) — **bump `N` on every deploy that touches `app.js`,
`style.css`, or `data/plugins.json`** so the new `index.html` always points
at the matching fresh copies.

## Disclaimer

Not affiliated with Valve or the Decky Loader project. Data is collected from public
GitHub repositories; install scripts are executed at the user's own risk — review any
script before piping it into `bash`.
