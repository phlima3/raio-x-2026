#!/bin/bash
set -e

pnpm install --frozen-lockfile
cd packages/web
npx next build
