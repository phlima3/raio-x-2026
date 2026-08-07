import assert from 'node:assert/strict'
import test from 'node:test'
import { CANDIDATE_CONTENT_CACHE_PATTERNS } from './invalidateApiCache'

test('invalidates candidate pages and every cache derived from proposals', () => {
  assert.deepEqual(CANDIDATE_CONTENT_CACHE_PATTERNS, [
    'candidates:*',
    'consistency:*',
    'comparison:*',
    'proposals:*',
  ])
})
