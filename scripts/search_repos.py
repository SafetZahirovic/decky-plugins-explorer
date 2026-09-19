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
"""
import json
import subprocess
import sys


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

    for repo, url in sorted(seen.items()):
        print(f"{repo}\t{url}")

    print(f"Found {len(seen)} candidate repos", file=sys.stderr)


if __name__ == "__main__":
    main()
