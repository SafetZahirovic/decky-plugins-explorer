#!/usr/bin/env python3
"""Drop entries whose plugin.json doesn't match the Decky Loader schema.

The code search for filename:plugin.json with "flags"/"publish" also picks up
unrelated ecosystems (AI "skill" manifests, WordPress/TFS/XL-Release plugins, etc.)
that happen to reuse those key names. A genuine Decky plugin.json always has
`flags` as a list and `publish` as an object; that combination reliably
distinguishes it from the false positives (verified by manual sampling).
"""
import json
import sys


def is_decky_plugin(plugin):
    if not isinstance(plugin, dict):
        return False
    flags = plugin.get("flags")
    publish = plugin.get("publish")
    return isinstance(flags, list) and isinstance(publish, dict)


def main():
    path = sys.argv[1]
    with open(path) as f:
        data = json.load(f)

    kept = [d for d in data if is_decky_plugin(d.get("plugin"))]
    dropped = [d["repo"] for d in data if not is_decky_plugin(d.get("plugin"))]

    with open(path, "w") as f:
        json.dump(kept, f, indent=None)

    print(f"Kept {len(kept)}, dropped {len(dropped)}", file=sys.stderr)
    for r in dropped:
        print(f"  dropped: {r}", file=sys.stderr)


if __name__ == "__main__":
    main()
