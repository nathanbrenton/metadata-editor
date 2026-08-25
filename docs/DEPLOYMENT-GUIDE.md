# Metadata Editor — Publication and Deployment Guide

Updated: 2026-08-24

This document is the application-level guide for publishing Hiplingo media
from `metadata-editor`.

For server filesystem commissioning, historical production checkpoints,
permission incidents, and full operational troubleshooting, also read:

`web-prod-01-hiplingo-media-deployment-runbook-20260818.txt`

## Ownership boundary

Private canonical library:

```text
~/Desktop/record-label/media-library/
```

This tree is **PRIVATE — NEVER DEPLOY**.

Metadata editor:

```text
~/Desktop/record-label/metadata-editor/
```

Sanitized public package:

```text
~/Desktop/record-label/published-media/
```

Production public-media tree:

```text
/var/www/hiplingo.com/published-media/
```

Public URL:

```text
https://hiplingo.com/media/
```

Hiplingo frontend:

```text
~/Desktop/record-label/hiplingo.com/
```

The frontend is a read-only consumer of the publication package. Frontend
deployment and public-media deployment are independent lifecycles.

## Publication responsibilities

`metadata-editor` owns:

- public release/track selection;
- per-release video inclusion policy;
- public artist/release/track metadata;
- browser-compatible artwork derivatives;
- HLS/audio derivatives;
- compact `waveform-peaks.wfp`;
- sanitized JSON;
- publication manifests;
- `published-media/catalog.json`;
- package auditing;
- deployment planning;
- guarded production synchronization.

Hiplingo frontend owns consumption/presentation and must not become a second
writer of `published-media`.

## Public-package security contract

Private material must never cross into `published-media`.

Public permission contract:

```text
directories    0755
files          0644
```

Private waveform files may legitimately be `0600`; public waveform copies must
be `0644`.

`www-data` remains read-only and is not made a member of deployment groups.

## Normal publication workflow

From:

```sh
cd "$HOME/Desktop/record-label/metadata-editor"
```

1. Make metadata/public-selection changes.
2. Regenerate/update the Web Package using the editor's normal controls.
3. Confirm intended release/track/video inclusion.
4. Run:

```sh
npm run audit:public-v1
```

Require:

```text
Status: ready
```

5. Verify the sanitized public package:

```sh
npm run verify:published-media
```

6. Optional direct local mode audit:

```sh
ROOT="$HOME/Desktop/record-label/published-media"

echo -n "non-0644 files: "
find "$ROOT" -type f ! -perm 0644 | wc -l

echo -n "non-0755 directories: "
find "$ROOT" -type d ! -perm 0755 | wc -l
```

Expected:

```text
non-0644 files:       0
non-0755 directories: 0
```

## Production plan

Always specify the production profile:

```sh
npm run plan:published-media-deploy -- --profile production
```

Expected target:

```text
ssh:hiplingo-prod:/var/www/hiplingo.com/published-media
```

Review:

- status;
- source snapshot;
- add/update/remove/metadata/unknown counts;
- paths;
- plan fingerprint.

Do not deploy an unexplained plan.

## Fingerprint rule

The production deployment must use the fingerprint from the exact plan that
was reviewed.

Never:

- reuse an old fingerprint after package changes;
- reuse a local-sandbox fingerprint;
- guess a fingerprint;
- deploy after server state changes without regenerating/reviewing the plan.

## Production write

Only after the plan is approved:

```sh
npm run deploy:published-media -- \
  --profile production \
  --plan-fingerprint <CURRENT_PRODUCTION_PLAN_FINGERPRINT> \
  --confirm DEPLOY_PUBLISHED_MEDIA
```

## Transfer timeout

Normal long-transfer timeout:

```text
60 minutes
```

Optional override:

```sh
PUBLISHED_MEDIA_RSYNC_TIMEOUT_MS=7200000 \
npm run deploy:published-media -- \
  --profile production \
  --plan-fingerprint <CURRENT_PRODUCTION_PLAN_FINGERPRINT> \
  --confirm DEPLOY_PUBLISHED_MEDIA
```

The override is milliseconds and must be at least 60000.

## Atomic production behavior

Operational intent:

1. create a sibling incoming tree;
2. seed it from current live content where supported;
3. rsync the package delta;
4. normalize public modes;
5. verify checksum/difference state;
6. recheck the reviewed source snapshot;
7. atomically promote incoming to live;
8. verify resulting state;
9. retain the prior tree as rollback state where implemented.

Do not manually rsync ordinary updates directly into the live
`published-media` directory.

## Required server boundary

Production parent:

```text
/var/www/hiplingo.com
owner: root
group: hiplingo-media-deploy
mode: 3775
```

Frontend:

```text
/var/www/hiplingo.com/app
owner: root
group: hiplingo-app-deploy
mode: 2775
```

Live media after normal atomic publication:

```text
/var/www/hiplingo.com/published-media
owner: deploy-hiplingo-media
group: hiplingo-media-deploy
normal live mode: 0755
```

The `3775` parent is deliberate:

- SGID preserves deployment group inheritance;
- group-write permits sibling staging;
- sticky bit protects root-owned siblings such as `app`.

Do not use `chmod 777`.

## Atomic staging permission probe

```sh
ssh hiplingo-prod '
probe="/var/www/hiplingo.com/published-media.metadata-editor-permission-probe.$$"
mkdir "$probe" &&
rmdir "$probe" &&
echo "PASS: atomic deployment staging permission"
'
```

## Post-deploy convergence

```sh
tmp="$(mktemp)"
npm run plan:published-media-deploy -- --profile production >"$tmp" &&
grep -E \
  '^(Source:|Profile:|Target:|Status:|Snapshot:|Changes:|Plan fingerprint:)' \
  "$tmp"
rm -f "$tmp"
```

Healthy:

```text
Status: current
Changes: 0 · add 0 · update 0 · remove 0 · metadata 0 · unknown 0
```

## Production permission audit

On `web-prod-01`:

```sh
stat -c '%A %a %U:%G %n' \
  /var/www/hiplingo.com \
  /var/www/hiplingo.com/app \
  /var/www/hiplingo.com/published-media

ROOT=/var/www/hiplingo.com/published-media

echo -n "non-0644 files: "
find "$ROOT" -type f ! -perm 0644 | wc -l

echo -n "non-0755 directories: "
find "$ROOT" -type d ! -perm 0755 | wc -l
```

Healthy counts are zero.

## Public HTTP smoke test

Use `/media/`, not `/published-media/`.

Representative checks:

```sh
curl -fsSI https://hiplingo.com/media/catalog.json |
  grep -Ei '^(HTTP/|content-type:|content-length:)'
```

Expected catalog:

```text
HTTP 200
application/json
```

Representative derivative content types:

```text
HLS     application/vnd.apple.mpegurl
WFP     application/octet-stream
```

## Failure modes

### Sibling staging permission denied

If the incoming sibling cannot be created, inspect the parent.

Correct:

```text
/var/www/hiplingo.com
root:hiplingo-media-deploy
3775
```

### Public asset returns 403

Check the public mode contract.

Emergency production repair, followed by source/package repair:

```sh
sudo find /var/www/hiplingo.com/published-media \
  -type f -exec chmod 0644 {} +

sudo find /var/www/hiplingo.com/published-media \
  -type d -exec chmod 0755 {} +
```

Do not treat server-side chmod as the permanent fix if the local public
package is wrong.

### Media URL returns small HTML

The request probably used the internal filesystem name:

```text
/published-media/...
```

Correct public contract:

```text
/media/...
```

The wrong path can fall through to the SPA and return `index.html`.

### Transfer timeout

Before retrying a write:

```sh
ps -ef | grep "[r]sync" || true
```

Inspect/understand any incoming staging tree before starting a second write.

## Frontend/media decoupling

Frontend:

```text
/var/www/hiplingo.com/app/releases/<timestamp>/
/var/www/hiplingo.com/app/current
```

Media:

```text
/var/www/hiplingo.com/published-media/
```

Frontend rollback changes only `app/current`.

Media publication changes only `published-media`.

Never let one lifecycle implicitly alter the other.
