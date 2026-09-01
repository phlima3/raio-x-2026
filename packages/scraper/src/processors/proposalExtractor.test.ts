import assert from 'node:assert/strict'
import test from 'node:test'
import { ProposalStatus } from '@prisma/client'
import {
  hasProposalMaterialChange,
  isProposalMissingFromSource,
  proposalTitleFromDescription,
  type ProcessedProposal,
} from './proposalExtractor'

const proposal: ProcessedProposal = {
  externalId: 'site-candidate-economia-0',
  source: 'candidate_site',
  title: 'Economia — emprego e renda',
  description: 'Descrição verificável da proposta publicada no site.',
  category: 'Economia',
  tags: ['economia'],
  status: ProposalStatus.SUBMITTED,
  sourceUrl: 'https://example.org/programa',
  candidateId: 'candidate-1',
}

test('detects only material proposal changes before revoking editorial approval', () => {
  assert.equal(hasProposalMaterialChange(undefined, proposal), true)
  assert.equal(
    hasProposalMaterialChange({
      externalId: proposal.externalId,
      source: proposal.source,
      title: proposal.title,
      description: proposal.description,
      category: proposal.category,
      tags: [...proposal.tags],
      status: proposal.status,
      url: proposal.sourceUrl,
      candidateId: proposal.candidateId,
    }, proposal),
    false,
  )
  assert.equal(
    hasProposalMaterialChange({
      externalId: proposal.externalId,
      source: proposal.source,
      title: proposal.title,
      description: 'Texto anterior',
      category: proposal.category,
      tags: [...proposal.tags],
      status: proposal.status,
      url: proposal.sourceUrl,
      candidateId: proposal.candidateId,
    }, proposal),
    true,
  )
})

test('derives a substantive title instead of generating a numbered placeholder', () => {
  assert.equal(
    proposalTitleFromDescription(
      'Economia',
      'Criar metas públicas de emprego e renda. O plano detalha indicadores anuais.',
    ),
    'Criar metas públicas de emprego e renda',
  )
  assert.doesNotMatch(
    proposalTitleFromDescription('Saúde', 'Ampliar equipes de atenção básica'),
    /proposta\s*\d+/i,
  )
})

test('trunca no espaço anterior, sem partir a última palavra', () => {
  const longa =
    'Apoiar os setores que pagam bons salários e preparar os trabalhadores para as ' +
    'transformações trazidas pela inteligência artificial e pela transição energética'
  const title = proposalTitleFromDescription('Economia', longa)

  assert.ok(title.length <= 141, `título com ${title.length} caracteres`)
  assert.ok(title.endsWith('…'), title)
  // A palavra que sobra é inteira: o texto sem a reticência é prefixo da frase
  // e termina exatamente onde havia um espaço.
  const semReticencia = title.slice(0, -1)
  assert.ok(longa.startsWith(semReticencia), title)
  assert.equal(longa[semReticencia.length], ' ')
})

test('depublishes only proposals removed from the same successful source snapshot', () => {
  const snapshot = {
    candidateId: proposal.candidateId,
    sourceUrl: proposal.sourceUrl,
  }
  const currentExternalIds = new Set<string>()
  const existing = {
    externalId: proposal.externalId,
    source: proposal.source,
    status: proposal.status,
    url: proposal.sourceUrl,
    candidateId: proposal.candidateId,
  }

  assert.equal(
    isProposalMissingFromSource(existing, currentExternalIds, snapshot),
    true,
  )
  assert.equal(
    isProposalMissingFromSource(
      existing,
      new Set([proposal.externalId]),
      snapshot,
    ),
    false,
  )
  assert.equal(
    isProposalMissingFromSource(
      { ...existing, status: ProposalStatus.DRAFT },
      currentExternalIds,
      snapshot,
    ),
    false,
  )
  assert.equal(
    isProposalMissingFromSource(
      { ...existing, url: 'https://example.org/outro-programa' },
      currentExternalIds,
      snapshot,
    ),
    false,
  )
})
