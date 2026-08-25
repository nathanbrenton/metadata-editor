# metadata-editor documentation

This directory owns Hiplingo publication and sanitized public-media deployment.

## Authoritative documents

### `DEPLOYMENT-GUIDE.md`

Application/operator guide for:

- public package generation;
- publication audit;
- permission verification;
- production deployment planning;
- plan fingerprints;
- guarded deployment;
- convergence checks;
- frontend/media separation.

### `web-prod-01-hiplingo-media-deployment-runbook-20260818.txt`

Detailed production runbook for the persistent Hiplingo media tree, including
server filesystem permissions, atomic sibling staging, historical deployment
checkpoints, transfer behavior, troubleshooting, and public HTTP validation.

## Boundaries

Private:

```text
~/Desktop/record-label/media-library/
```

Never deploy this tree.

Sanitized public package:

```text
~/Desktop/record-label/published-media/
```

Production:

```text
/var/www/hiplingo.com/published-media/
```

Public URL:

```text
https://hiplingo.com/media/
```

## Related documentation

Hiplingo frontend:

```text
~/Desktop/record-label/hiplingo.com/docs/
hiplingo.com-production-deployment-workflow.txt
```

Shared server:

```text
~/Desktop/websites/nathanbrenton.com/docs/
web-prod-01-production-rebuild-runbook-20260824-alerting-v1.txt
```
