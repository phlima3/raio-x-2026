#!/bin/bash
set -e

pnpm install --frozen-lockfile

# The private service hostname is available only after the container starts.
# Static generation runs inside the image build, so use the public API there.
# This export is scoped to the build process; Veloz restores API_URL_INTERNAL
# from the service environment when `next start` runs.
if [ -n "${NEXT_PUBLIC_API_URL:-}" ]; then
  export API_URL_INTERNAL="$NEXT_PUBLIC_API_URL"
fi

cd packages/web
npx next build
