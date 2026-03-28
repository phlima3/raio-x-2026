#!/bin/bash
set -e

yarn install --frozen-lockfile
cd packages/web
npx next build
