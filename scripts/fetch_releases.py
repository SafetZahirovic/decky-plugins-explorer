#!/usr/bin/env python3
"""Add release-download totals and latest-release date to data/plugins.json."""
import json
import subprocess
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

TOKEN = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, check=True).stdout.strip()
API = "https://api.github.com"


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


def fetch_all_releases(full):
    releases = []
    page = 1
    while True:
        status, batch = api_get(f"/repos/{full}/releases?per_page=100&page={page}")
        if status != 200 or not batch:
            break
        releases.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return releases


def process(entry):
    full = entry["repo"]
    releases = fetch_all_releases(full)
    total_downloads = 0
    latest_at = None
    latest_tag = None
    for r in releases:
        if r.get("draft"):
            continue
        for a in r.get("assets", []):
            total_downloads += a.get("download_count", 0)
        published = r.get("published_at")
        if published and (latest_at is None or published > latest_at):
            latest_at = published
            latest_tag = r.get("tag_name")
    entry["downloads"] = total_downloads
    entry["latest_release"] = {"tag": latest_tag, "published_at": latest_at} if latest_at else None
    return entry


def main():
    path = sys.argv[1]
    with open(path) as f:
        data = json.load(f)

    print(f"Fetching releases for {len(data)} repos...", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(process, e): e for e in data}
        done = 0
        for fut in as_completed(futs):
            fut.result()
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(data)}", file=sys.stderr)

    with open(path, "w") as f:
        json.dump(data, f, indent=None)

    with_downloads = sum(1 for e in data if e.get("downloads"))
    with_releases = sum(1 for e in data if e.get("latest_release"))
    print(f"{with_downloads} repos have asset downloads; {with_releases} have at least one release", file=sys.stderr)


if __name__ == "__main__":
    main()
