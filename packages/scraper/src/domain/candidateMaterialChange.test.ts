import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasCandidateMaterialChange,
  type CandidateMaterialSnapshot,
} from './candidateMaterialChange'

const current: CandidateMaterialSnapshot = {
  bio: 'Biografia publicada',
  bioSummary: null,
  photoUrl: null,
  photoSourceUrl: null,
  siteUrl: 'https://example.org',
  bioSourceUrl: null,
  approvalRate: null,
}

test('marks only changed public candidate fields as material', () => {
  assert.equal(hasCandidateMaterialChange(current, {}), false)
  assert.equal(
    hasCandidateMaterialChange(current, {
      bio: current.bio,
      siteUrl: current.siteUrl,
    }),
    false,
  )
  assert.equal(
    hasCandidateMaterialChange(current, { bio: 'Biografia corrigida' }),
    true,
  )
})
