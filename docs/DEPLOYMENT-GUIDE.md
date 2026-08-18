# Metadata Editor Deployment Guide

This guide covers deployment of the sanitized Hiplingo public media package produced by `metadata-editor`.

It is intentionally focused on the `published-media/` deployment workflow. It does **not** deploy the Hiplingo frontend application itself.

## Deployment boundaries

The important paths are:

- Private source/library data: `~/Desktop/record-label/media-library/`
- Sanitized public package: `~/Desktop/record-label/published-media/`
- Metadata Editor: `~/Desktop/record-label/metadata-editor/`
- Production media target: `ssh:hiplingo-prod:/var/www/hiplingo.com/published-media`
- Public media URL: `https://hiplingo.com/media/`

`media-library/` is private and must never be deployed or exposed by the public web server.

Only the sanitized `published-media/` tree crosses the public deployment boundary.

## What a production deployment does

The current production workflow is intentionally guarded and incremental.

When a deployment begins:

1. Metadata Editor rebuilds the deployment plan and requires the exact reviewed plan fingerprint.
2. The currently live production media tree is copied **server-side** to a temporary incoming sibling directory.
3. `rsync` compares the local public package against that seeded incoming tree using checksums.
4. Only the actual delta needs to cross the network.
5. The incoming tree is normalized to public web permissions:
   - directories: `0755`
   - files: `0644`
6. The incoming tree is checksum-verified against the reviewed local package.
7. Only after verification is the incoming tree atomically promoted to the live destination.
8. The previous live tree is retained as the rollback snapshot.

This means an interrupted or timed-out transfer should fail before promotion rather than partially replacing the live site.

## 1. Prepare the Web Package

Use Metadata Editor to choose the releases and tracks that should be public.

Run the normal **Rebuild Local Public Package** / update workflow until the Web Package is current.

The resulting public package is:

```text
~/Desktop/record-label/published-media/
```

Before production deployment, verify the package.

```bash
# Work from the Metadata Editor repository.
cd ~/Desktop/record-label/metadata-editor || return

# Verify the sanitized public package and deployment manifest.
npm run verify:published-media
```

If the deployment manifest is stale, refresh it:

```bash
cd ~/Desktop/record-label/metadata-editor || return

# Rebuild deployment-manifest.json from the current sanitized package.
npm run manifest:published-media

# Verify again after refreshing the manifest.
npm run verify:published-media
```

Do not proceed while verification reports blockers.

## 2. Check public file permissions locally

Public web assets should already be emitted with safe public permissions, but this audit is useful before a large production deployment.

```bash
ROOT="$HOME/Desktop/record-label/published-media"

echo "===== LOCAL PUBLIC PERMISSION AUDIT ====="

echo -n "non-0644 files: "
find "$ROOT" -type f ! -perm 0644 | wc -l

echo -n "non-0755 directories: "
find "$ROOT" -type d ! -perm 0755 | wc -l
```

Expected:

```text
non-0644 files: 0
non-0755 directories: 0
```

If an older public package contains restrictive modes, normalize **only the sanitized public package**:

```bash
ROOT="$HOME/Desktop/record-label/published-media"

# published-media is already the explicit public boundary.
# Files are made web-readable; directories are made traversable.
find "$ROOT" -type f -exec chmod 0644 {} +
find "$ROOT" -type d -exec chmod 0755 {} +
```

This command must never be pointed at `media-library/`.

## 3. Build and review the production plan

Planning is read-only.

```bash
cd ~/Desktop/record-label/metadata-editor || return

tmp="$(mktemp)"

npm run plan:published-media-deploy -- --profile production >"$tmp" && \
echo "===== PRODUCTION DEPLOYMENT PLAN =====" && \
grep -E \
  '^(Source:|Profile:|Target:|Status:|Snapshot:|Changes:|Plan fingerprint:)' \
  "$tmp"

rm -f "$tmp"
```

Review:

- `Source` must be the expected local `published-media` root.
- `Profile` must be `Production (production)`.
- `Target` must be `ssh:hiplingo-prod:/var/www/hiplingo.com/published-media`.
- `Status` should be `changes` when a deployment is needed.
- The change count should make sense for the releases being added/updated.
- Save the exact `Plan fingerprint`.

Do not type shell placeholders such as `<fingerprint>`. Angle brackets are shell syntax.

### Review changes grouped by release

For a large plan, use JSON mode to make sure additions belong to the intended releases:

```bash
cd ~/Desktop/record-label/metadata-editor || return

tmp="$(mktemp)"

npm run --silent plan:published-media-deploy -- \
  --profile production \
  --json >"$tmp" && \
python3 - "$tmp" <<'PY'
import json
import sys
from collections import Counter

with open(sys.argv[1]) as f:
    plan = json.load(f)

print("Status:", plan["status"])
print("Snapshot:", plan["sourceContentFingerprint"])
print("Plan fingerprint:", plan["planFingerprint"])
print()

by_release = Counter()
outside = []

for change in plan.get("changes", []):
    p = change["path"]
    action = change["action"]

    if p.startswith("releases/"):
        parts = p.split("/")
        release_id = parts[1] if len(parts) > 1 else "<unknown>"
        by_release[(action, release_id)] += 1
    else:
        outside.append((action, p))

print("----- CHANGES BY RELEASE -----")
for (action, release_id), count in sorted(by_release.items()):
    print(f"{action.upper():8} {count:5}  {release_id}")

print()
print("----- CHANGES OUTSIDE RELEASES -----")
for action, path in outside:
    print(f"{action.upper():8} {path}")
PY

rm -f "$tmp"
```

Catalog, artist snapshot, and deployment-manifest updates are normal when publication membership changes.

## 4. Deploy the reviewed plan

Use the **real fingerprint returned by the plan you reviewed**.

A convenient shell-safe pattern is:

```bash
cd ~/Desktop/record-label/metadata-editor || return

# Paste the exact reviewed fingerprint between the single quotes.
PLAN_FINGERPRINT='paste-real-fingerprint-here'

npm run deploy:published-media -- \
  --profile production \
  --plan-fingerprint "$PLAN_FINGERPRINT" \
  --confirm DEPLOY_PUBLISHED_MEDIA
```

The confirmation token is deliberately explicit. The command will rebuild the plan before writing and refuse deployment if the fingerprint no longer matches.

If the package changed after planning, do not force the old fingerprint. Generate and review a fresh plan.

## Slow or unreliable connections

Production deployment now seeds the incoming tree from the currently live production tree **on the server** before rsync begins.

That means existing live media does not need to be uploaded again. The local connection primarily carries newly added or changed files.

The default rsync timeout is one hour. For a slow hotspot, a longer timeout can be supplied without changing the deployment contents:

```bash
cd ~/Desktop/record-label/metadata-editor || return

PLAN_FINGERPRINT='paste-real-fingerprint-here'

# Four-hour rsync timeout.
PUBLISHED_MEDIA_RSYNC_TIMEOUT_MS=14400000 \
npm run deploy:published-media -- \
  --profile production \
  --plan-fingerprint "$PLAN_FINGERPRINT" \
  --confirm DEPLOY_PUBLISHED_MEDIA
```

A timeout during the incoming sync happens before atomic promotion. The live production tree should remain unchanged.

## 5. Require zero-change convergence

After a successful deployment, immediately rebuild the production plan.

```bash
cd ~/Desktop/record-label/metadata-editor || return

tmp="$(mktemp)"

npm run plan:published-media-deploy -- --profile production >"$tmp" && \
echo "===== PRODUCTION CONVERGENCE =====" && \
grep -E \
  '^(Source:|Profile:|Target:|Status:|Snapshot:|Changes:|Plan fingerprint:)' \
  "$tmp"

rm -f "$tmp"
```

Expected:

```text
Status: current
Changes: 0 · add 0 · update 0 · remove 0 · metadata 0 · unknown 0
```

Do not consider a deployment complete until the production target converges to zero changes.

## 6. Verify production permissions

The deployment pipeline normalizes and verifies the incoming tree before promotion. This independent check confirms the live target also has the required modes.

```bash
ssh hiplingo-prod '
  ROOT=/var/www/hiplingo.com/published-media

  echo -n "non-0644 files: "
  find "$ROOT" -type f ! -perm 0644 | wc -l

  echo -n "non-0755 directories: "
  find "$ROOT" -type d ! -perm 0755 | wc -l
'
```

Expected:

```text
non-0644 files: 0
non-0755 directories: 0
```

Incorrect public file permissions can produce HTTP `403` responses even when the catalog path and file itself are correct.

## 7. Verify live HTTP media

For each newly deployed release, verify at least:

- `release.json`
- release artwork
- one HLS playlist

Example:

```bash
RID='YYYY-MM-DD_release-id'

printf "release.json: "
curl -sS -o /dev/null -w '%{http_code}\n' \
  "https://hiplingo.com/media/releases/$RID/release.json"
```

A successful public asset should normally return HTTP `200`.

For a batch of newly published releases, also verify they appear in the live `catalog.json`.

## 8. Browser validation

After the server checks pass, validate the actual public experience:

- release appears in Releases
- release appears under the correct Artist
- release artwork loads
- track-specific artwork loads where authored
- playback starts
- waveform loads and scrubs
- Next/Previous work
- Shuffle can traverse the expanded public library
- persistent playback survives navigation between public pages

Server checks prove deployment integrity; browser validation proves the public application is consuming the new package correctly.

## Rollback

A completed deployment records the previous production snapshot and keeps a backup for rollback.

The deployment command prints the rollback command when a previous snapshot exists.

Standard rollback:

```bash
cd ~/Desktop/record-label/metadata-editor || return

npm run rollback:published-media -- \
  --profile production \
  --confirm ROLLBACK_PUBLISHED_MEDIA
```

After rollback, verify:

1. the restored deployment manifest fingerprint,
2. production convergence against the intended local package,
3. public HTTP responses,
4. browser behavior.

Rollback is for the published-media deployment only. The Hiplingo frontend application has a separate deployment lifecycle.

## Common failure modes

### `Deployment plan fingerprint changed`

The local public package or target changed after the plan was reviewed.

Generate a fresh plan, review it, and use its new fingerprint.

### `Incoming deployment failed checksum verification`

The incoming tree does not exactly match the reviewed local package after synchronization.

Check:

- local `published-media` file and directory modes,
- whether the local package changed during deployment,
- rsync/network errors,
- whether the deployment manifest is current.

Do not promote a mismatched incoming tree.

### `rsync timed out`

The transfer exceeded `PUBLISHED_MEDIA_RSYNC_TIMEOUT_MS`.

Because production is seeded server-side and promoted only after verification, retry with a larger timeout after generating/reviewing a fresh plan if needed.

### Media URL returns HTTP `403`

First check file and directory permissions on production.

Expected:

- files `0644`
- directories `0755`

A `403` with the file present is commonly a permissions/traversal problem.

### Media URL returns HTTP `404`

Check:

- the path advertised by `catalog.json`, `release.json`, or `track.json`,
- whether the corresponding file exists under production `published-media`,
- whether the deployment converged to zero changes.

### Production plan says `current`

No write is required.

A deployment command intentionally refuses to deploy when the target is already current.

## Frontend deployment is separate

`deploy:published-media` only updates:

```text
/var/www/hiplingo.com/published-media
```

It does not deploy the Hiplingo React/Vite application.

The media deployment SSH identity is intentionally restricted to media deployment. Keep frontend application deployment and media deployment as separate operational boundaries.
