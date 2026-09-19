#!/usr/bin/env python3
"""Search GitHub for plugin.json files and print candidate repos.

Prints deduped `owner/repo<TAB>blob-url` lines to stdout, one per repo,
in the format `fetch_data.py` expects. Requires `gh` to be authenticated
(either via `gh auth login`, or a GH_TOKEN/GITHUB_TOKEN env var, which
`gh` picks up automatically).

`flags`+`publish` is deliberately broader than the Decky-specific
`api_version` field (which is optional and some real plugins omit) —
`filter_dataset.py` is what actually separates genuine Decky manifests
from unrelated ecosystems that reuse the same filename/keys.

GitHub's `/search/code` index (what `gh search code` hits) is also known
to simply not cover every public repo, with no documented way to force
it to. `data/manual_repos.txt` lists repos confirmed to have a real
plugin.json that the index has missed; they're resolved and merged in
here so they survive every nightly refresh.
"""
import json
import os
import subprocess
import sys

MANUAL_REPOS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "manual_repos.txt")


def gh_api(path):
    result = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)


def resolve_manual_entry(entry):
    if ":" in entry:
        repo, path = entry.split(":", 1)
    else:
        repo, path = entry, "plugin.json"

    meta = gh_api(f"repos/{repo}")
    if meta is None:
        print(f"  manual entry {entry}: repo not found or inaccessible, skipping", file=sys.stderr)
        return None
    branch = meta.get("default_branch", "main")

    commit = gh_api(f"repos/{repo}/commits/{branch}")
    if commit is None:
        print(f"  manual entry {entry}: couldn't resolve HEAD commit, skipping", file=sys.stderr)
        return None
    sha = commit["sha"]

    contents = gh_api(f"repos/{repo}/contents/{path}?ref={sha}")
    if contents is None:
        print(f"  manual entry {entry}: {path} not found at HEAD, skipping", file=sys.stderr)
        return None

    return repo, f"https://github.com/{repo}/blob/{sha}/{path}"


def load_manual_repos():
    if not os.path.exists(MANUAL_REPOS_PATH):
        return {}
    resolved = {}
    with open(MANUAL_REPOS_PATH) as f:
        entries = [line.split("#", 1)[0].strip() for line in f]
    entries = [e for e in entries if e]
    for entry in entries:
        result = resolve_manual_entry(entry)
        if result:
            repo, url = result
            resolved[repo] = url
    return resolved


def main():
    result = subprocess.run(
        [
            "gh", "search", "code", "flags", "publish", "filename:plugin.json",
            "--limit", "1000",
            "--json", "path,repository,url",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode)

    data = json.loads(result.stdout)
    seen = {}
    for d in data:
        repo = d["repository"]["nameWithOwner"]
        if repo not in seen:
            seen[repo] = d["url"]

    print(f"Found {len(seen)} candidate repos from code search", file=sys.stderr)

    manual = load_manual_repos()
    new_from_manual = sum(1 for repo in manual if repo not in seen)
    seen.update(manual)
    print(f"Resolved {len(manual)} manual entries ({new_from_manual} not already in search results)", file=sys.stderr)

    for repo, url in sorted(seen.items()):
        print(f"{repo}\t{url}")


if __name__ == "__main__":
    main()
