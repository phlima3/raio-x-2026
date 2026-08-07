import assert from 'node:assert/strict'
import test from 'node:test'
import { ProposalStatus } from '@prisma/client'
import { isPublicProposal } from './publicationPolicy'

test('publishes only non-draft proposals with an HTTPS primary source', () => {
  assert.equal(
    isPublicProposal({
      status: ProposalStatus.SUBMITTED,
      url: 'https://example.org/programa.pdf',
    }),
    true,
  )
  assert.equal(
    isPublicProposal({ status: ProposalStatus.DRAFT, url: 'https://example.org/rascunho' }),
    false,
  )
  assert.equal(
    isPublicProposal({ status: ProposalStatus.SUBMITTED, url: null }),
    false,
  )
  assert.equal(
    isPublicProposal({ status: ProposalStatus.SUBMITTED, url: 'http://example.org/programa' }),
    false,
  )
})
