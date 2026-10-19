"""Cut a release: version bump, changelog, tag check, notes.

    python tools/ci/release.py prepare 0.2.0     bump the version and date the changelog
    python tools/ci/release.py check v0.2.0      is this tag ready to publish?
    python tools/ci/release.py notes v0.2.0      the release notes, from the changelog

docs/RELEASING.md is the whole process; this file does its mechanical parts. The release
workflow (.github/workflows/release.yml) runs check and notes when a tag is pushed, so a
tag that fails here never becomes a GitHub release. Standard library only.

Everything project-specific is the "release" block of tools/ci/config.json: the release
branch, the tag prefix, the changelog, every file that carries the version (each with a
regular expression whose first group is the version), and an optional install note for
the release page. The hygiene check "version" keeps those files agreeing between releases.
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys

SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def read(path):
    return open(path, encoding="utf-8").read()


def write(path, text):
    # Keep whatever line endings the checkout uses; git normalises them on commit.
    crlf = "\r\n" in open(path, encoding="utf-8", newline="").read()
    open(path, "w", encoding="utf-8", newline="\r\n" if crlf else "\n").write(text)


def config():
    rel = json.load(open(os.path.join("tools", "ci", "config.json"), encoding="utf-8")).get("release")
    if not rel or not rel.get("version_files"):
        sys.exit("error: tools/ci/config.json has no release block with version_files.")
    rel.setdefault("branch", "main")
    rel.setdefault("tag_prefix", "v")
    rel.setdefault("changelog", "CHANGELOG.md")
    return rel


def versions(rel):
    found = {}
    for vf in rel["version_files"]:
        m = re.search(vf["pattern"], read(vf["path"]), re.M)
        found[vf["path"]] = m.group(1) if m else None
    return found


def section(rel, version):
    """(date, body) of the changelog's '## [version] - date' section, or None."""
    m = re.search(rf"^## \[{re.escape(version)}\] - (\d{{4}}-\d{{2}}-\d{{2}})[ \t]*\n(.*?)(?=^## |\Z)",
                  read(rel["changelog"]), re.M | re.S)
    return (m.group(1), m.group(2).strip()) if m else None


def version_of(rel, tag):
    prefix = rel["tag_prefix"]
    if not tag.startswith(prefix) or not SEMVER.match(tag[len(prefix):]):
        sys.exit(f"error: {tag} is not a release tag. Tags are {prefix}<major>.<minor>.<patch>, "
                 f"such as {prefix}0.2.0.")
    return tag[len(prefix):]


def prepare(rel, version, date):
    if not SEMVER.match(version):
        sys.exit(f"error: {version} is not a version. Use <major>.<minor>.<patch>, such as 0.2.0.")
    if section(rel, version):
        sys.exit(f"error: {rel['changelog']} already has a section for {version}.")
    text = read(rel["changelog"])
    m = re.search(r"^## \[Unreleased\][ \t]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    if not m or not m.group(1).strip():
        sys.exit(f"error: {rel['changelog']} has nothing under [Unreleased], so there is nothing to release.")
    # The released entries move under their version; a fresh, empty [Unreleased] stays on top.
    text = text[:m.start()] + f"## [Unreleased]\n\n## [{version}] - {date}\n\n{m.group(1).strip()}\n\n" + text[m.end():]
    write(rel["changelog"], text)
    for vf in rel["version_files"]:
        src = read(vf["path"])
        m = re.search(vf["pattern"], src, re.M)
        if not m:
            sys.exit(f"error: the pattern for {vf['path']} in tools/ci/config.json matches nothing.")
        write(vf["path"], src[:m.start(1)] + version + src[m.end(1):])
    files = ", ".join(vf["path"] for vf in rel["version_files"])
    print(f"Prepared {version}: {files} and {rel['changelog']} ({date}).")
    print("Review the diff, then follow docs/RELEASING.md from its next step.")


def check(rel, tag):
    version = version_of(rel, tag)
    errors = []
    for path, v in versions(rel).items():
        if v != version:
            errors.append(f"{path} says {v}, not {version}.")
    if not section(rel, version):
        errors.append(f"{rel['changelog']} has no '## [{version}] - <date>' section.")
    # Releases are cut from the release branch. A tag on any other commit would publish work
    # that never went through the merge into it.
    branch = f"origin/{rel['branch']}"
    commit = subprocess.run(["git", "rev-parse", "--verify", "--quiet", f"{tag}^{{commit}}"],
                            capture_output=True, text=True).stdout.strip()
    if not commit:
        errors.append(f"There is no tag {tag} here. Create it on {rel['branch']} first (docs/RELEASING.md).")
    elif subprocess.run(["git", "merge-base", "--is-ancestor", commit, branch]).returncode != 0:
        errors.append(f"{tag} points at {commit[:12]}, which is not on {branch}. Tag the commit "
                      f"{rel['branch']} points at after the release is merged there.")
    for e in errors:
        print(f"error: {e}")
    if errors:
        return 1
    print(f"OK: {tag} is on {rel['branch']}, and every version file and {rel['changelog']} say {version}.")
    return 0


def notes(rel, tag):
    version = version_of(rel, tag)
    found = section(rel, version)
    if not found:
        sys.exit(f"error: {rel['changelog']} has no '## [{version}] - <date>' section.")
    print(found[1])
    if rel.get("install_note"):
        print("\n" + rel["install_note"].replace("{tag}", tag).replace("{version}", version))
    return 0


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="command", required=True)
    p = sub.add_parser("prepare", help="bump the version everywhere and date the changelog")
    p.add_argument("version")
    p.add_argument("--date", default=datetime.date.today().isoformat(), help="release date (default: today)")
    sub.add_parser("check", help="is this tag ready to publish?").add_argument("tag")
    sub.add_parser("notes", help="print the release notes for this tag").add_argument("tag")
    args = ap.parse_args()

    os.chdir(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                            check=True).stdout.strip())
    rel = config()
    if args.command == "prepare":
        prepare(rel, args.version, args.date)
        return 0
    return check(rel, args.tag) if args.command == "check" else notes(rel, args.tag)


if __name__ == "__main__":
    sys.exit(main())
