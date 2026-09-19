#!/usr/bin/env python3
"""Re-run only the install-script detection step against existing data/plugins.json."""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

TOKEN = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, check=True).stdout.strip()
API = "https://api.github.com"
INSTALL_RE = re.compile(r"(^|/)([\w.\-]*install[\w.\-]*\.sh)$", re.IGNORECASE)


def api_get(path):
    req = urllib.request.Request(
        API + path,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "decky-registry-build",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, None


def find_install(entry):
    full = entry["repo"]
    branch = entry.get("default_branch", "main")
    status, tree = api_get(f"/repos/{full}/git/trees/{branch}?recursive=1")
    if status != 200 or tree is None or tree.get("truncated"):
        return entry["repo"], None
    candidates = [
        item["path"] for item in tree.get("tree", [])
        if item.get("type") == "blob"
        and INSTALL_RE.search(item["path"])
        and "uninstall" not in item["path"].lower()
    ]
    if not candidates:
        return entry["repo"], None
    candidates.sort(key=lambda p: (p.count("/"), len(p)))
    best = candidates[0]
    raw_url = f"https://raw.githubusercontent.com/{full}/{branch}/{best}"
    return entry["repo"], {
        "path": best,
        "raw_url": raw_url,
        "command": f"curl -fsSL {raw_url} | bash",
    }


def main():
    path = sys.argv[1]
    with open(path) as f:
        data = json.load(f)

    results = {}
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = [ex.submit(find_install, e) for e in data]
        done = 0
        for fut in as_completed(futs):
            repo, install = fut.result()
            results[repo] = install
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(data)}", file=sys.stderr)

    changed = 0
    for e in data:
        new_val = results.get(e["repo"])
        if new_val != e.get("install_script"):
            changed += 1
        e["install_script"] = new_val

    with open(path, "w") as f:
        json.dump(data, f, indent=None)

    print(f"Updated install_script for {changed} entries", file=sys.stderr)
    print(f"Total with install script: {sum(1 for e in data if e.get('install_script'))}", file=sys.stderr)


if __name__ == "__main__":
    main()
