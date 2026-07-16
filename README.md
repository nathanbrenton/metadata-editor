# Metadata Editor

Local administrative application for scanning and, in later milestones,
editing the configured record-label media library.

## Media root

The default development library is:

    ../demo-media

Override it when starting the filesystem API:

    MEDIA_LIBRARY_ROOT=../media-library npm run dev:server

The API binds only to `127.0.0.1`.

## Development

Use separate terminals for the filesystem API and Vite frontend:

    npm run dev:server
    npm run dev

## Validation

    npm test
    npm run build
    git diff --check
