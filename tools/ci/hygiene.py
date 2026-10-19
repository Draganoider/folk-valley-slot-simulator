"""Repo hygiene checks: the same ones CI runs, runnable on your own machine.

    python tools/ci/hygiene.py              run every check
    python tools/ci/hygiene.py meta guids   run only these
    python tools/ci/hygiene.py --list       name every check
    python tools/ci/hygiene.py --install-hook

The workflow in .github/workflows/repo-hygiene.yml calls this file once per check, so a
check behaves the same on a runner and on a laptop. Standard library only. What differs
between projects lives in tools/ci/config.json (see tools/ci/README.md), so this file needs
no editing to adopt; project-specific checks go in the PROJECT CHECKS section below.

None of this compiles code or runs tests. It runs in seconds and catches the mistakes that
happen in any repo - committed generated files and secrets, broken JSON, a .gitignore rule
that hides tracked files, broken doc links, an API key in a URL, attribution lines - plus
this project's own: a binary that is not a compressed web format or is over the size
budget, and an asset whose source and license are not recorded. In a Unity repo it also
catches the ones that silently break a project:
missing .meta files, a .meta regenerated with a new GUID, projects on different Unity
versions, and test assemblies that leak into player builds. The Unity checks find every
Unity project themselves and pass trivially when there is none.

What a run compares against. Two checks ask what changed (guids, attribution) and one
words its advice by it (meta):
- On GitHub, a pull request counts from where it left its target branch, and a push from
  the commit the branch pointed at before. A new branch has nothing to count from.
- On your machine, it counts from where HEAD left origin/<integration branch> (pass --base
  to choose), up to what is staged. So the pre-commit hook checks the commit you are about
  to make. Every other check reads what git tracks, which locally means the index.
"""

import argparse
import ast
import collections
import html
import json
import os
import posixpath
import re
import shlex
import subprocess
import sys
from urllib.parse import unquote

ON_GITHUB = os.environ.get("GITHUB_ACTIONS") == "true"
HOOK_MARK = "# repo hygiene hook"

DEFAULTS = {
    "integration_branch": "test",
    "forbidden": [],
    "python": {"paths": ["tools/"], "stdlib_only": True, "extra_imports": {}},
    "key_in_url_globs": ["*.py", "*.cs", "*.js", "*.ts", "*.mjs"],
    "html_link_dirs": ["docs/"],
    "attribution_tools": ["claude", "codex", "copilot", "cursor", "chatgpt", "gpt", "gemini", "aider",
                          "windsurf", "devin", "zed", "openai", "anthropic"],
    "release": None,
    "assets": None,
}


# ---------------------------------------------------------------------------- plumbing

def git(*args, stdin=None, check=True):
    return subprocess.run(["git", *args], input=stdin, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", check=check).stdout


def tracked(*patterns):
    return [f for f in git("ls-files", "-z", "--", *patterns).split("\0") if f]


def folders_of(files):
    folders = set()
    for f in files:
        d = posixpath.dirname(f)
        while d and d not in folders:
            folders.add(d)
            d = posixpath.dirname(d)
    return folders


def read(path, encoding="utf-8"):
    return open(path, encoding=encoding).read()


def load_config():
    cfg = dict(DEFAULTS)
    path = os.path.join("tools", "ci", "config.json")
    if os.path.exists(path):
        cfg.update(json.load(open(path, encoding="utf-8")))
    return cfg


CONFIG = DEFAULTS


def error(msg, file=None, line=None):
    """A GitHub annotation on a runner; file:line: error: on a terminal."""
    if ON_GITHUB:
        where = ",".join(p for p in (f"file={file}" if file else "", f"line={line}" if line else "") if p)
        print(f"::error{' ' + where if where else ''}::{msg}")
    else:
        loc = f"{file}:{line}: " if file and line else f"{file}: " if file else ""
        print(f"{loc}error: {msg}")


def warning(msg):
    print(f"::warning::{msg}" if ON_GITHUB else f"warning: {msg}")


def unity_projects():
    """A Unity project is any folder with a committed ProjectSettings/ProjectVersion.txt."""
    found = [f[:-len("ProjectSettings/ProjectVersion.txt")].rstrip("/")
             for f in tracked("ProjectSettings/ProjectVersion.txt", "*/ProjectSettings/ProjectVersion.txt")]
    return [p or "." for p in found]


def unity_packages():
    """A Unity package is a package.json outside any Assets/ folder that sits inside a Unity
    project or declares the "unity" field. A Node package.json is neither."""
    projects = [p for p in unity_projects() if p != "."]
    root_project = "." in unity_projects()
    found = []
    for f in tracked("package.json", "*/package.json"):
        if "/Assets/" in f or f.startswith("Assets/"):
            continue
        folder = posixpath.dirname(f)
        inside = root_project or any(folder.startswith(p + "/") for p in projects)
        if not inside:
            try:
                inside = "unity" in json.load(open(f, encoding="utf-8"))
            except (OSError, ValueError):
                inside = False
        if inside:
            found.append(folder or ".")
    return found


def under(root, path):
    return root == "." or path.startswith(root + "/")


def rel_to(root, path):
    return path if root == "." else path[len(root) + 1:]


class Range:
    """What this run compares against; see the module docstring. head None is the index."""
    base = None
    head = None
    restore = None
    pr_body = None
    pr_base = None
    pr_head = None


RANGE = Range()


def find_range(base_arg):
    r = RANGE
    integration = CONFIG["integration_branch"]
    r.restore = f"origin/{integration}"
    if base_arg:
        r.base = git("rev-parse", "--verify", base_arg).strip()
        r.restore = base_arg
        return
    if ON_GITHUB:
        event = os.environ.get("GITHUB_EVENT_NAME")
        payload = json.load(open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8"))
        if event == "pull_request":
            pr = payload["pull_request"]
            r.pr_base, r.pr_head, r.pr_body = pr["base"]["sha"], pr["head"]["sha"], pr.get("body") or ""
            r.base = git("merge-base", r.pr_base, r.pr_head, check=False).strip() or None
            r.head = r.pr_head
            r.restore = "origin/" + os.environ["GITHUB_BASE_REF"]
        elif event == "push":
            before = payload.get("before") or ""
            if before.strip("0"):  # all zeros: the push created the branch
                # After a force-push the old commit is on no branch, so the checkout did not fetch it.
                exists = lambda: subprocess.run(["git", "cat-file", "-e", before + "^{commit}"],
                                                capture_output=True).returncode == 0
                if not exists():
                    subprocess.run(["git", "fetch", "--quiet", "--no-tags", "origin", before], capture_output=True)
                if exists():
                    r.base, r.head, r.restore = before, os.environ["GITHUB_SHA"], before[:12]
    elif subprocess.run(["git", "rev-parse", "--verify", "--quiet", r.restore],
                        capture_output=True).returncode == 0:
        r.base = git("merge-base", "HEAD", r.restore, check=False).strip() or None


def describe_range():
    if not RANGE.base:
        return "nothing (no earlier commit to compare with)"
    return f"{RANGE.base[:12]}..{RANGE.head[:12] if RANGE.head else 'the index'}"


def show(rev, path):
    """A file's content at a commit, or in the index when rev is None."""
    return git("show", f"{rev}:{path}" if rev else f":{path}")


# ---------------------------------------------------------------------------- core checks

def check_generated():
    """No generated or secret files committed."""
    fail = False

    def check(pattern, msg):
        nonlocal fail
        found = tracked(pattern)[:5]
        if found:
            error(msg)
            for f in found:
                print(f"    {f}")
            fail = True

    check(".env", "A .env file is committed. Rotate the keys in it immediately, then remove it from history.")
    check("**/.env", "A .env file is committed. Rotate the keys in it immediately, then remove it from history.")
    for p in unity_projects():
        prefix = "" if p == "." else p + "/"
        for d in ("Library", "Logs", "UserSettings", "Temp", "obj"):
            check(f"{prefix}{d}/**", f"{prefix}{d}/ is committed. Unity generates it; it must never be tracked.")
    if unity_projects():
        check("**/*.csproj", "A .csproj is committed. Unity generates these per machine.")
        check("**/*.sln", "A .sln is committed. Unity generates these per machine.")
        check("**/*.slnx", "A .slnx is committed. Unity generates these per machine.")
    for rule in CONFIG["forbidden"]:
        check(rule["pattern"], rule["message"])
    if not fail:
        print("OK: no generated or secret files tracked")
    return not fail


def check_json():
    """JSON files parse. A malformed settings or manifest file often fails silently."""
    fail = False
    for f in tracked("*.json", "*.asmdef", "*.asmref"):
        try:
            json.load(open(f, encoding="utf-8-sig"))
        except (OSError, ValueError):
            error("Invalid JSON. A malformed settings or manifest file often fails silently.", file=f)
            fail = True
    if not fail:
        print("OK: every JSON file parses")
    return not fail


def check_gitignore():
    """.gitignore ignores no tracked file.

    Git keeps tracking a file after a .gitignore rule starts to match it, so a bad rule
    changes nothing you can see. The damage is to NEW files: every one the rule matches is
    silently left out of commits.
    """
    hidden = [f for f in git("ls-files", "-ci", "--exclude-standard", "-z").split("\0") if f]
    if not hidden:
        print("OK: .gitignore ignores no tracked file")
        return True
    # --no-index, or check-ignore skips files that are tracked.
    out = git("check-ignore", "-v", "--no-index", "-z", "--stdin", stdin="\0".join(hidden) + "\0",
              check=False).split("\0")
    rules = collections.defaultdict(list)
    for source, line, pattern, path in zip(*[iter(out)] * 4):
        rules[(source, line, pattern)].append(path)
    unexplained = sorted(set(hidden) - {p for paths in rules.values() for p in paths})
    if unexplained:
        rules[("", "", "")] = unexplained
    for (source, line, pattern), paths in rules.items():
        rule = f'The rule "{pattern}"' if pattern else "A .gitignore rule"
        error(f"{rule} ignores {len(paths)} tracked file(s), such as {paths[0]}. Git keeps tracking those, "
              f"so nothing looks wrong, but every new file the rule matches is silently left out of commits. "
              f"Remove the rule; or, if the files really should not be tracked, untrack them with "
              f"git rm --cached <path>.", file=source or None, line=line or None)
        for p in paths[:20]:
            print(f"    {p}")
        if len(paths) > 20:
            print(f"    ... and {len(paths) - 20} more")
    return False


def check_links():
    """Links between docs resolve.

    Every relative link in a tracked .md file, and every relative href/src in the HTML under
    the folders config.json names, resolved against what git tracks - a link to an ignored
    or untracked file is broken on GitHub even if it opens on your machine. External URLs and
    #anchors are not followed.
    """
    all_tracked = tracked()
    files = set(all_tracked)
    folders = folders_of(all_tracked)
    html_dirs = tuple(CONFIG["html_link_dirs"])

    def targets_md(text):
        # Links inside fenced blocks and inline code are examples, not links.
        text = re.sub(r"^(```|~~~).*?^\1", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S | re.M)
        text = re.sub(r"`[^`\n]*`", "", text)
        for m in re.finditer(r"\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)", text):
            yield text.count("\n", 0, m.start()) + 1, m.group(1)
        for m in re.finditer(r"^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)", text, re.M):
            yield text.count("\n", 0, m.start()) + 1, m.group(1)

    def targets_html(text):
        text = re.sub(r"<(script|style|pre|code)\b.*?</\1>", lambda m: "\n" * m.group(0).count("\n"),
                      text, flags=re.S | re.I)
        for m in re.finditer(r"\b(?:href|src)\s*=\s*([\"'])(.*?)\1", text, re.I):
            yield text.count("\n", 0, m.start()) + 1, html.unescape(m.group(2))

    fail, checked = False, 0
    for f in all_tracked:
        if f.endswith(".md"):
            parse = targets_md
        elif f.endswith(".html") and html_dirs and f.startswith(html_dirs):
            parse = targets_html
        else:
            continue
        try:
            found = list(parse(read(f)))
        except (OSError, UnicodeDecodeError):
            continue
        for line, raw in found:
            t = raw.strip()
            if not t or t.startswith(("#", "mailto:", "data:", "javascript:")) or re.match(r"^[a-z][a-z0-9+.-]*://", t, re.I):
                continue
            path = unquote(t.split("#", 1)[0].split("?", 1)[0])
            if not path:
                continue
            resolved = posixpath.normpath(path.lstrip("/") if path.startswith("/")
                                          else posixpath.join(posixpath.dirname(f), path))
            checked += 1
            if resolved.rstrip("/") not in files and resolved.rstrip("/") not in folders:
                error(f"Broken link: {raw} (resolves to {resolved}, which is not a tracked file or folder).",
                      file=f, line=line)
                fail = True
    if not fail:
        print(f"OK: {checked} relative links resolve")
    return not fail


def check_python():
    """Python scripts compile, and import only what they promise.

    Every .py file under the folders config.json lists must compile. With stdlib_only, they
    may import only the standard library and their sibling modules, so they run with no pip
    install; a folder in extra_imports may also import the modules named for it. A file that
    imports bpy is a Blender script, and may import what Blender itself provides.
    """
    py = CONFIG["python"] or {}
    paths = py.get("paths") or []
    if not paths:
        print("OK: no Python folders configured")
        return True
    extra_imports = {k: set(v) for k, v in (py.get("extra_imports") or {}).items()}
    scripts = tracked(*[p.rstrip("/") + "/*.py" for p in paths])
    stdlib = set(sys.stdlib_module_names)
    fail = False
    for f in scripts:
        src = read(f, "utf-8-sig")
        try:
            tree = compile(src, f, "exec", ast.PyCF_ONLY_AST)
            compile(tree, f, "exec")
        except SyntaxError as e:
            error(f"Does not compile: {e.msg}", file=f, line=e.lineno)
            fail = True
            continue
        if not py.get("stdlib_only", True):
            continue
        siblings = {posixpath.splitext(posixpath.basename(p))[0] for p in scripts
                    if posixpath.dirname(p) == posixpath.dirname(f)}
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports += [(node.lineno, a.name) for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                imports.append((node.lineno, node.module))
        tops = {mod.split(".")[0] for _, mod in imports}
        blender = {"bpy", "bmesh", "bpy_extras", "mathutils"} if "bpy" in tops else set()
        extra = set().union(*(mods for folder, mods in extra_imports.items() if f.startswith(folder)))
        for lineno, mod in imports:
            if mod.split(".")[0] not in stdlib | siblings | blender | extra:
                error(f"Imports {mod}, which is not in the standard library. These scripts promise to run with "
                      f"no pip install; if this folder really needs it, add it to python.extra_imports in "
                      f"tools/ci/config.json and say so in the folder's README.", file=f, line=lineno)
                fail = True
    if not fail:
        print(f"OK: {len(scripts)} Python scripts compile and import only what they promise")
    return not fail


def check_keys():
    """No API key sits in a URL.

    Keys travel in headers. A key query parameter is how several APIs' own examples do it,
    which is exactly why it is worth a check - the key then lands in logs, proxies and
    history. The pattern is split in two so this file does not match itself.
    """
    key_in_url = re.compile(r"[?&](?:api_?)?" + r"key=", re.I)
    fail = False
    for f in tracked(*CONFIG["key_in_url_globs"]):
        try:
            lines = open(f, encoding="utf-8-sig", errors="replace").readlines()
        except OSError:
            continue
        for no, line in enumerate(lines, 1):
            if key_in_url.search(line):
                error("An API key in a URL. Send it in a header and redact it from errors; a key in a URL "
                      "ends up in logs, proxies and history.", file=f, line=no)
                fail = True
    if not fail:
        print("OK: no API key in any URL")
    return not fail


def check_attribution():
    """No attribution lines in commits or the pull request description.

    No Co-Authored-By, no "Generated with <tool>": the history reads as the team's work, and
    authorship is already in the committer field. On GitHub this reads every commit in the
    pull request and its description, which arrives through the event file, never pasted
    into a script. On your machine it reads the commits on your branch since it left the
    integration branch.
    """
    tools = "|".join(re.escape(t) for t in CONFIG["attribution_tools"])
    trailer = re.compile(r"^\s*(?:co-authored-by\s*:|\W{0,3}\s*generated\s+(?:with|by)\s+\[?(?:" + tools + r")\b)",
                         re.I | re.M)
    if RANGE.pr_base:
        log_range = f"{RANGE.pr_base}..{RANGE.pr_head}"
    elif RANGE.base:
        log_range = f"{RANGE.base}..HEAD"
    else:
        print("OK: no earlier commit to compare with, so no commits to read")
        return True
    errors = []
    commits = [c.strip("\n") for c in git("log", "--format=%h%x00%B%x01", log_range).split("\x01") if c.strip()]
    for c in commits:
        sha, _, body = c.partition("\x00")
        for m in trailer.finditer(body):
            errors.append(f'Commit {sha} carries an attribution line: "{m.group(0).strip()}". The history reads '
                          f"as the team's work. Reword the commit and force-push the branch.")
    for m in trailer.finditer(RANGE.pr_body or ""):
        errors.append(f'The pull request description carries an attribution line: "{m.group(0).strip()}". '
                      f"Edit it out of the description, then re-run this check.")
    for msg in errors:
        error(msg)
    if not errors:
        print(f"OK: {len(commits)} commit(s){' and the description' if RANGE.pr_base else ''} carry no attribution lines")
    return not errors


def check_version():
    """The version agrees with itself.

    A release changes every file that carries the version, and the changelog, at once
    (tools/ci/release.py prepare). One changed by hand drifts from the others with no error
    anywhere. Between releases the version stays at the last release, so it always has a
    dated changelog section. Passes trivially when config.json sets up no releases.
    """
    rel = CONFIG.get("release")
    if not rel or not rel.get("version_files"):
        print("OK: no release configuration")
        return True
    fail = False
    versions = {}
    for vf in rel["version_files"]:
        try:
            m = re.search(vf["pattern"], read(vf["path"]), re.M)
        except OSError:
            m = None
        if not m:
            error(f"Cannot find the version with the pattern in tools/ci/config.json.", file=vf["path"])
            fail = True
        else:
            versions[vf["path"]] = m.group(1)
    if len(set(versions.values())) > 1:
        error("The version files disagree: " + ", ".join(f"{p} says {v}" for p, v in versions.items()) +
              ". Change the version with python tools/ci/release.py prepare <version>, which moves them together.")
        fail = True
    if versions and not fail:
        version = next(iter(versions.values()))
        changelog = rel.get("changelog", "CHANGELOG.md")
        try:
            text = read(changelog)
        except OSError:
            text = ""
        if not re.search(rf"^## \[{re.escape(version)}\] - \d{{4}}-\d{{2}}-\d{{2}}", text, re.M):
            error(f"The version is {version}, but {changelog} has no '## [{version}] - <date>' section. Between "
                  f"releases the version stays at the last release; docs/RELEASING.md says how to cut one.",
                  file=changelog)
            fail = True
        else:
            print(f"OK: {len(versions)} version file(s) and {changelog} agree on {version}")
    return not fail


# ---------------------------------------------------------------------------- unity checks

def check_unity_packages():
    """Unity package manifests are well formed."""
    fail = False
    pkgs = unity_packages()
    for pkg in pkgs:
        p = "package.json" if pkg == "." else f"{pkg}/package.json"
        try:
            d = json.load(open(p, encoding="utf-8"))
        except ValueError:
            fail = True
            continue  # the json check reports it
        missing = [k for k in ("name", "version", "displayName", "description", "unity") if not d.get(k)]
        if missing:
            error(f"Missing required field(s): {', '.join(missing)}", file=p)
            fail = True
        elif d["name"] != d["name"].lower():
            error("Package name must be lowercase (Unity requirement).", file=p)
            fail = True
        elif "unity" in d["name"]:
            error("Package name must not contain 'unity' - Unity reserves it.", file=p)
            fail = True
        else:
            print(f"OK: {d['name']} {d['version']}")
    if not pkgs:
        print("OK: no Unity packages")
    return not fail


def check_test_asmdefs():
    """Unity test assemblies are excluded from player builds."""
    fail = False
    for f in tracked("*.asmdef"):
        if "Tests" not in f:
            continue
        d = json.load(open(f, encoding="utf-8-sig"))
        if "UNITY_INCLUDE_TESTS" not in (d.get("defineConstraints") or []):
            error('Test assembly is missing defineConstraints ["UNITY_INCLUDE_TESTS"]. '
                  'Without it the assembly compiles into player builds and fails there.', file=f)
            fail = True
        elif "nunit.framework.dll" not in (d.get("precompiledReferences") or []):
            error('Test assembly is missing precompiledReferences ["nunit.framework.dll"].', file=f)
            fail = True
    if not fail:
        print("OK: test assemblies correctly constrained")
    return not fail


def check_meta():
    """Unity .meta files are in sync.

    A missing .meta means Unity regenerates it with a NEW guid on someone else's machine,
    silently breaking every reference to that asset. An orphaned .meta means a file was
    deleted without its metadata. Checked under every project's Assets/ and every Unity
    package; hidden names and folders ending in ~ are ignored, as Unity ignores them.

    An existing asset must get its committed .meta back: the copy Unity regenerates carries
    a new guid, which passes this check and breaks the same references (guids catches it).
    """
    projects = unity_projects()
    if not projects:
        print("OK: no Unity projects")
        return True
    all_tracked = tracked()
    files = set(all_tracked)
    folders = folders_of(all_tracked)
    roots = [("Assets" if p == "." else p + "/Assets") for p in projects] + \
            [p for p in unity_packages() if p != "."]

    def ignored(rel):
        return any(part.startswith(".") or part.endswith("~") for part in rel.split("/"))

    base, restore = RANGE.base, RANGE.restore
    before = set(git("ls-tree", "-r", "--name-only", "-z", base).split("\0")) if base else set()
    restorable = []

    def remedy(meta):
        cmd = f"git checkout {restore} -- {shlex.quote(meta)}"
        if meta in before:
            restorable.append(meta)
            return (f"Do not commit the copy Unity regenerates: its guid is new, so the references break all "
                    f"the same. Restore the committed one: {cmd}")
        if base:
            return "This is a new asset: open its project in Unity, then commit the .meta Unity creates for it."
        return (f"If this is a new asset, open its project in Unity and commit the .meta it creates. If it "
                f"already existed, restore the committed .meta rather than a regenerated one: {cmd}")

    errors = []
    need = set()
    for root in roots:
        for f in all_tracked:
            if not f.startswith(root + "/") or f.endswith(".meta"):
                continue
            rel = f[len(root) + 1:]
            if ignored(rel):
                continue
            if f + ".meta" not in files:
                errors.append((f"Missing {f}.meta - Unity will regenerate it with a new guid and break references. "
                               f"{remedy(f + '.meta')}", f))
            d = posixpath.dirname(rel)
            while d:
                need.add(f"{root}/{d}")
                d = posixpath.dirname(d)
    for d in sorted(need):
        if d + ".meta" not in files:
            errors.append((f"Missing {d}.meta - Unity will regenerate the folder's guid on every machine. "
                           f"{remedy(d + '.meta')}", None))
    for m in all_tracked:
        if not m.endswith(".meta"):
            continue
        asset = m[:-len(".meta")]
        if asset not in files and asset not in folders:
            errors.append(("Orphaned .meta - the asset it describes is not tracked.", m))
        elif not any(m.startswith(r + "/") for r in roots):
            errors.append(("This .meta is outside every Unity project and package. If it belongs to a new "
                           "project, commit that project's ProjectSettings/ too, or none of its files are checked.", m))
    # GitHub shows a step's first ten annotations only, so the fix for them all goes first.
    if len(restorable) > 1:
        errors.insert(0, (f"{len(restorable)} committed .meta files are missing. Restore them all at once: "
                          f"git checkout {restore} -- {' '.join(shlex.quote(m) for m in restorable)}", None))
    for msg, f in errors:
        error(msg, file=f)
    if not errors:
        print("OK: .meta files in sync")
    return not errors


def check_guids():
    """Existing Unity .meta files keep their GUIDs.

    The meta check asks whether every asset HAS a .meta, not whether it is the SAME one.
    Delete the metas, let Unity regenerate them and commit the copies, and that check
    passes while every reference to the old GUIDs points at nothing, with no error until
    someone opens the thing that broke. So a tracked .meta whose guid changed fails, and so
    does an asset moved to another folder whose .meta Unity regenerated there.
    """
    if not unity_projects():
        print("OK: no Unity projects")
        return True
    base, head, restore = RANGE.base, RANGE.head, RANGE.restore
    if not base:
        print("OK: no earlier commit to compare with, so no guid can have changed")
        return True
    print(f"Comparing {describe_range()}")
    to = [head] if head else []
    cached = [] if head else ["--cached"]

    def guid(rev, path):
        m = re.search(r"^guid:\s*(\w+)", show(rev, path), re.M)
        return m.group(1) if m else None

    # 1. A .meta rewritten in place.
    candidates = [f for f in git("diff", *cached, "--diff-filter=M", "-G^guid:", "--name-only", "-z",
                                 base, *to, "--", "*.meta").split("\0") if f]
    changed = [(f, guid(base, f), guid(head, f)) for f in candidates]
    changed = [c for c in changed if c[1] != c[2]]

    # 2. An asset moved with a regenerated .meta. Git records a delete and an add, and its
    # rename detection pairs .meta files by text, which is no help. So moves are paired from
    # the assets: same file name AND same content. A file moved and edited at once is missed.
    deleted, added = {}, {}
    raw = git("diff", *cached, "--raw", "--no-renames", "--no-abbrev", "-z", base, *to).split("\0")
    for info, path in zip(raw[0::2], raw[1::2]):
        _, _, old_blob, new_blob, status = info.split()
        if status == "D":
            deleted[path] = old_blob
        elif status == "A":
            added[path] = new_blob
    same_asset = collections.defaultdict(lambda: ([], []))
    for side, files in ((0, deleted), (1, added)):
        for path, blob in files.items():
            if not path.endswith(".meta"):
                same_asset[(posixpath.basename(path), blob)][side].append(path)
    pairs = [(o, n) for olds, news in same_asset.values() for o in olds for n in news]
    for o, n in list(pairs):
        while True:  # a moved folder: its .meta stays behind and Unity makes a new one
            o, n = posixpath.dirname(o), posixpath.dirname(n)
            if not o or not n or posixpath.basename(o) != posixpath.basename(n):
                break
            pairs.append((o, n))
    moves = collections.defaultdict(set)
    for o, n in pairs:
        if o + ".meta" in deleted and n + ".meta" in added:
            moves[n + ".meta"].add(o + ".meta")
    moved = []
    for new_meta, old_metas in sorted(moves.items()):
        olds = {m: guid(base, m) for m in sorted(old_metas)}
        new = guid(head, new_meta)
        if new not in olds.values():
            old_meta, old = next(iter(olds.items()))
            moved.append((old_meta, new_meta, old, new))

    if not changed and not moved:
        print(f"OK: every existing .meta keeps its guid ({len(candidates)} touched a guid line, "
              f"{len(moves)} moved with their asset)")
        return True
    if changed:
        everything = " ".join(shlex.quote(f) for f, _, _ in changed)
        error(f"{len(changed)} existing .meta file(s) changed their guid, which usually means they were deleted "
              f"and Unity regenerated them. Restore the committed ones: git checkout {restore} -- {everything}")
    for f, old, new in changed:
        error(f"guid changed from {old} to {new}; everything that referred to this asset now points at nothing. "
              f"Restore the committed .meta: git checkout {restore} -- {shlex.quote(f)}", file=f)
    # Two commands in prose: PowerShell 5.1 has no &&, and its > writes UTF-16.
    for old_meta, new_meta, old, new in moved:
        error(f"Moved from {old_meta}, but with a new .meta: guid changed from {old} to {new}. Put the old .meta "
              f"at the new path: git checkout {restore} -- {shlex.quote(old_meta)}, then git mv -f "
              f"{shlex.quote(old_meta)} {shlex.quote(new_meta)}", file=new_meta)
    return False


def check_unity_version():
    """Every Unity project uses the same Unity version.

    Opening a project in a newer patch rewrites ProjectVersion.txt and can silently upgrade
    serialized assets for everyone, so the version is pinned and every project shares it.
    The pin is config.json's unity_version; without one, the version most projects use, so
    the project that drifted is the one blamed.
    """
    projects = unity_projects()
    if not projects:
        print("OK: no Unity projects")
        return True

    def version(p):
        path = "ProjectSettings/ProjectVersion.txt" if p == "." else f"{p}/ProjectSettings/ProjectVersion.txt"
        m = re.search(r"^m_EditorVersion:\s*(\S+)", read(path), re.M)
        return path, (m.group(1) if m else None)

    pinned = CONFIG.get("unity_version") or \
        collections.Counter(version(p)[1] for p in projects).most_common(1)[0][0]
    fail = False
    for p in projects:
        path, v = version(p)
        if v != pinned:
            error(f"{p} is on Unity {v}, but the repo pins {pinned}. Every project must use the same version.",
                  file=path)
            fail = True
    if not fail:
        print(f"OK: every Unity project is on {pinned}")
    return not fail


# ---------------------------------------------------------------------------- PROJECT CHECKS
#
# Checks only this project needs - a rule from AGENTS.md that a script can check - go here,
# each a function returning True when it passes, with a one-line docstring summary, added to
# CHECKS below and given a step in .github/workflows/repo-hygiene.yml.


def check_assets():
    """Binary files are compressed web formats within the size budget.

    This repository does not use Git LFS (DR-001 in docs/PLAN.md), so every binary blob
    committed stays in every clone forever. Only the web formats config.json lists may be
    committed, each no larger than its max_bytes; full-size originals stay in the ignored
    art-source/ folder. Sizes are read from the index, which is what a commit records.
    """
    cfg = CONFIG.get("assets") or {}
    allowed = sorted({t.lower() for t in cfg.get("binary_types") or []})
    budget = int(cfg.get("max_bytes") or 0)
    binary = [e.split("\t", 1)[1] for e in git("ls-files", "--eol", "-z").split("\0")
              if e.startswith("i/-text")]
    if not binary:
        print("OK: no binary files tracked")
        return True
    blobs = {}
    for e in git("ls-files", "-s", "-z").split("\0"):
        if e:
            info, path = e.split("\t", 1)
            blobs[path] = info.split()[1]
    wanted = sorted({blobs[f] for f in binary if f in blobs})
    sizes = {}
    batch = git("cat-file", "--batch-check=%(objectname) %(objectsize)", stdin="\n".join(wanted) + "\n")
    for line in batch.splitlines():
        sha, _, size = line.partition(" ")
        if size.isdigit():
            sizes[sha] = int(size)
    fail = False
    for f in binary:
        ext = posixpath.splitext(f)[1].lower()
        if ext not in allowed:
            error(f"A {ext or 'binary'} file. Only compressed web formats are committed ({', '.join(allowed)}): "
                  f"convert it, and keep the original in art-source/, which git ignores.", file=f)
            fail = True
            continue
        size = sizes.get(blobs.get(f), 0)
        if budget and size > budget:
            error(f"{size // 1024} KB, over the {budget // 1024} KB budget for one file. Compress or scale it "
                  f"down, and keep the full-size original in art-source/, which git ignores.", file=f)
            fail = True
    if not fail:
        print(f"OK: {len(binary)} binary file(s), all web formats" +
              (f" within {budget // 1024} KB" if budget else ""))
    return not fail


def check_provenance():
    """Every shipped asset has its source and license recorded.

    Hard rule 7 in AGENTS.md: an asset is not original, or MIT-licensed, just because it is
    in the repository. The manifest config.json names maps every other file under the assets
    folder, by its path relative to the manifest, to an object with at least a "source"
    (how it was made, or where it came from) and a "license". It is created with the first
    asset, and an entry for a file that is not tracked fails too, so the record stays true.
    """
    cfg = CONFIG.get("assets") or {}
    root, manifest = (cfg.get("dir") or "").rstrip("/"), cfg.get("manifest")
    if not root or not manifest:
        print("OK: no assets folder configured")
        return True
    files = [f for f in tracked(root) if f != manifest and not f.endswith(".md")]
    if not files:
        print(f"OK: no assets under {root}/ yet")
        return True
    if not tracked(manifest):
        error(f"{len(files)} file(s) are tracked under {root}/, but {manifest} is not. Create it and record "
              f"each file's source and license (tools/ci/README.md shows the format).", file=manifest)
        return False
    try:
        entries = json.load(open(manifest, encoding="utf-8-sig"))["assets"]
        if not isinstance(entries, dict):
            raise TypeError
    except (OSError, ValueError, KeyError, TypeError):
        error('Cannot read the manifest. It is a JSON object whose "assets" object maps each file to its '
              'source and license (tools/ci/README.md shows the format).', file=manifest)
        return False
    base = posixpath.dirname(manifest)
    fail = False
    seen = set()
    for f in files:
        rel = posixpath.relpath(f, base)
        seen.add(rel)
        entry = entries.get(rel)
        if not isinstance(entry, dict):
            error(f'No provenance entry. Add "{rel}": {{"source": "...", "license": "..."}} to {manifest}, '
                  f"saying how the file was made or where it came from, and the terms it is under.", file=f)
            fail = True
            continue
        missing = [k for k in ("source", "license") if not str(entry.get(k) or "").strip()]
        if missing:
            error(f"The entry for {rel} has no {' and no '.join(missing)}.", file=manifest)
            fail = True
    for rel in sorted(set(entries) - seen):
        error(f"An entry for {rel}, which is not a tracked file under {root}/. Remove the entry, or commit "
              f"the file.", file=manifest)
        fail = True
    if not fail:
        print(f"OK: {len(files)} asset(s) have their source and license recorded")
    return not fail


CHECKS = {
    "generated": check_generated,
    "json": check_json,
    "assets": check_assets,
    "provenance": check_provenance,
    "gitignore": check_gitignore,
    "links": check_links,
    "python": check_python,
    "keys": check_keys,
    "version": check_version,
    "unity-packages": check_unity_packages,
    "test-asmdefs": check_test_asmdefs,
    "meta": check_meta,
    "guids": check_guids,
    "unity-version": check_unity_version,
    "attribution": check_attribution,
}


# ---------------------------------------------------------------------------- hook

HOOK = f"""#!/bin/sh
{HOOK_MARK}
# Runs the repo hygiene checks on what is about to be committed. Installed by
# python tools/ci/hygiene.py --install-hook; delete this file to remove it.
# Skip it once with git commit --no-verify.
if command -v python3 >/dev/null 2>&1; then py=python3; else py=python; fi
exec "$py" tools/ci/hygiene.py --hook
"""


def install_hook():
    # Not core.hooksPath: Git LFS keeps its own hooks in .git/hooks (pre-push, post-checkout,
    # post-commit, post-merge), and pointing hooksPath anywhere else silently switches those
    # off, so pushes would stop uploading LFS files. pre-commit is one LFS never uses.
    hooks = git("rev-parse", "--git-path", "hooks").strip()
    path = os.path.join(hooks, "pre-commit")
    if os.path.exists(path) and HOOK_MARK not in read(path):
        print(f"error: {path} already exists and is not this one. Merge them by hand, or move it aside first.")
        return False
    os.makedirs(hooks, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(HOOK)
    os.chmod(path, 0o755)
    print(f"Installed {path}. Every commit now runs the hygiene checks first; git commit --no-verify skips them.")
    return True


# ---------------------------------------------------------------------------- main

def main():
    global CONFIG
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("checks", nargs="*", metavar="check", help="checks to run (default: all); see --list")
    ap.add_argument("--list", action="store_true", help="name every check and stop")
    ap.add_argument("--base", help="compare against this commit instead of where HEAD left the integration branch")
    ap.add_argument("--install-hook", action="store_true", help="run these checks before every commit")
    ap.add_argument("--hook", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args()

    os.chdir(git("rev-parse", "--show-toplevel").strip())
    CONFIG = load_config()

    if args.list:
        for name, fn in CHECKS.items():
            print(f"{name:15} {fn.__doc__.strip().splitlines()[0]}")
        return 0
    if args.install_hook:
        return 0 if install_hook() else 1

    unknown = [c for c in args.checks if c not in CHECKS]
    if unknown:
        ap.error(f"unknown check(s): {', '.join(unknown)}. --list names them.")
    names = args.checks or list(CHECKS)
    if args.hook:
        names = [n for n in names if n != "attribution"]  # the commit message does not exist yet

    find_range(args.base)
    if not RANGE.base and "guids" in names and unity_projects():
        warning("No earlier commit to compare with, so the guids check has nothing to check.")

    if len(names) == 1:
        return 0 if CHECKS[names[0]]() else 1
    failed = []
    for name in names:
        print(f"\n== {name}: {CHECKS[name].__doc__.strip().splitlines()[0]}")
        if not CHECKS[name]():
            failed.append(name)
    print()
    if failed:
        print(f"FAILED: {', '.join(failed)}")
        if args.hook:
            print("The commit was stopped. Fix the above, or skip once with git commit --no-verify.")
        return 1
    print(f"All {len(names)} checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
