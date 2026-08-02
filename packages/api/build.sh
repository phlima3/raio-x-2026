#!/bin/bash
set -e

pnpm install --frozen-lockfile
cd packages/api
npx prisma generate
