#!/usr/bin/env python3
"""Fetch plugin.json, README, and install-script info for each repo in repos.txt.

Input:  scratch repos.txt  (owner/repo<TAB>https://github.com/owner/repo/blob/<sha>/<path-to-plugin.json>)
Output: data/plugins.json
"""
import base64
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


def raw_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "decky-registry-build"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None


def parse_blob_url(url):
    # https://github.com/{owner}/{repo}/blob/{sha}/{path}
    m = re.match(r"https://github\.com/([^/]+)/([^/]+)/blob/([0-9a-f]+)/(.+)$", url)
    if not m:
        return None
    return m.groups()  # owner, repo, sha, path


def process(owner, repo, sha, plugin_path):
    full = f"{owner}/{repo}"
    result = {"repo": full, "url": f"https://github.com/{full}"}

    # 1. plugin.json content via raw at the commit sha found by search (immutable, no API call)
    raw_plugin_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{plugin_path}"
    plugin_text = raw_get(raw_plugin_url)
    if plugin_text is None:
        return None
    try:
        plugin = json.loads(plugin_text)
    except json.JSONDecodeError:
        return None
    result["plugin"] = plugin
    result["plugin_path"] = plugin_path

    # 2. repo metadata (default branch, stars, description, archived/exists)
    status, meta = api_get(f"/repos/{full}")
    if status != 200 or meta is None:
        return None
    branch = meta.get("default_branch", "main")
    result["default_branch"] = branch
    result["stars"] = meta.get("stargazers_count", 0)
    result["archived"] = meta.get("archived", False)

    # 3. README
    status, readme = api_get(f"/repos/{full}/readme")
    if status == 200 and readme is not None:
        try:
            content = base64.b64decode(readme["content"]).decode("utf-8", errors="replace")
        except Exception:
            content = None
        result["readme"] = {
            "path": readme.get("path"),
            "html_url": readme.get("html_url"),
            "markdown": content,
        }
    else:
        result["readme"] = None

    # 4. search full tree for an install script
    status, tree = api_get(f"/repos/{full}/git/trees/{branch}?recursive=1")
    install = None
    if status == 200 and tree is not None and not tree.get("truncated"):
        candidates = [
            item["path"] for item in tree.get("tree", [])
            if item.get("type") == "blob"
            and INSTALL_RE.search(item["path"])
            and "uninstall" not in item["path"].lower()
        ]
        if candidates:
            candidates.sort(key=lambda p: (p.count("/"), len(p)))
            best = candidates[0]
            raw_url = f"https://raw.githubusercontent.com/{full}/{branch}/{best}"
            install = {
                "path": best,
                "raw_url": raw_url,
                "command": f"curl -fsSL {raw_url} | bash",
            }
    result["install_script"] = install

    return result


def main():
    repos_txt = sys.argv[1]
    out_path = sys.argv[2]
    entries = []
    with open(repos_txt) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            _, url = line.split("\t")
            parsed = parse_blob_url(url)
            if parsed:
                entries.append(parsed)

    print(f"Processing {len(entries)} repos...", file=sys.stderr)
    results = []
    errors = []
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(process, *e): e for e in entries}
        done = 0
        for fut in as_completed(futs):
            done += 1
            owner, repo, sha, path = futs[fut]
            try:
                r = fut.result()
                if r:
                    results.append(r)
                else:
                    errors.append(f"{owner}/{repo}")
            except Exception as e:
                errors.append(f"{owner}/{repo} ({e})")
            if done % 25 == 0:
                print(f"  {done}/{len(entries)}", file=sys.stderr)

    results.sort(key=lambda r: r["repo"].lower())
    with open(out_path, "w") as f:
        json.dump(results, f, indent=None)

    print(f"Wrote {len(results)} entries to {out_path}", file=sys.stderr)
    if errors:
        print(f"{len(errors)} failed: {errors}", file=sys.stderr)


if __name__ == "__main__":
    main()
