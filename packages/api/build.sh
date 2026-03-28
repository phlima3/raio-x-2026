#!/bin/bash
set -e

yarn install --frozen-lockfile
cd packages/api
npx prisma generate
