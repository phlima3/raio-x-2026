import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateCandidateIndexability,
  findCollidingCanonicalSlugs,
  type CandidateQualityInput,
} from './seoQuality'

const completeCandidate: CandidateQualityInput = {
  slug: 'ana-silva-partido-sp',
  personKey: 'ana-silva',
  tseId: null,
  name: 'Ana Silva',
  party: 'PARTIDO',
  state: 'SP',
  position: 'PRESIDENTE',
  electionYear: 2026,
  runningMateName: 'Bruno Costa',
  runningMateParty: 'PARTIDO',
  runningMateSourceUrl: 'https://divulgacandcontas.tse.jus.br/chapa-exemplo',
  candidacyStatus: 'registro_solicitado',
  candidacyStatusSourceUrl: 'https://divulgacandcontas.tse.jus.br/exemplo',
  candidacyStatusVerifiedAt: '2026-08-07T12:00:00.000Z',
  bioSummary:
    'Ana Silva disputa a Presidência em 2026 pelo Partido e teve o pedido de registro apresentado à Justiça Eleitoral.',
  bio:
    'Ana Silva exerceu mandato legislativo e ocupou funções executivas antes de apresentar sua candidatura à Presidência em 2026.',
  bioSourceUrl: 'https://www.camara.leg.br/deputados/exemplo/biografia',
  materialUpdatedAt: '2026-08-07T12:00:00.000Z',
  reviewedAt: '2026-08-07T13:00:00.000Z',
  editorialApprovedAt: '2026-08-07T14:00:00.000Z',
  editorialAuthor: 'Equipe Raio-X 2026',
  editorialReviewer: 'Revisão editorial',
  photoUrl: '/images/candidates/ana-silva.jpg',
  photoSourceUrl: 'https://divulgacandcontas.tse.jus.br/exemplo',
  photoLicense: 'Uso editorial — fonte TSE',
  proposals: [
    {
      title: 'Plano para ampliar a atenção básica',
      description: 'A proposta prevê expansão de equipes e metas públicas de atendimento.',
      summary: null,
      url: 'https://example.org/plano-de-governo.pdf',
    },
    {
      title: 'Programa de formação técnica',
      description: 'O programa integra ensino médio e qualificação profissional.',
      summary: null,
      url: 'https://example.org/programa.pdf',
    },
  ],
  votingRecords: [
    { proposalName: 'Projeto 1', proposalUrl: 'https://www.camara.leg.br/projeto-1' },
    { proposalName: 'Projeto 2', proposalUrl: 'https://www.camara.leg.br/projeto-2' },
    { proposalName: 'Projeto 3', proposalUrl: 'https://www.camara.leg.br/projeto-3' },
  ],
  assetDeclarations: [
    { sourceUrl: 'https://divulgacandcontas.tse.jus.br/bens' },
  ],
  campaignFinancings: [],
  newsItems: [],
}

test('qualifies a reviewed profile with verified status and three sourced modules', () => {
  const result = evaluateCandidateIndexability(completeCandidate)

  assert.equal(result.indexable, true)
  assert.deepEqual(result.blockers, [])
  assert.deepEqual(result.substantiveModules, ['trajetoria', 'propostas', 'votacoes', 'patrimonio'])
})

test('keeps an incomplete or merely speculative profile out of the index with actionable reasons', () => {
  const result = evaluateCandidateIndexability({
    ...completeCandidate,
    candidacyStatus: 'cotado',
    candidacyStatusSourceUrl: null,
    candidacyStatusVerifiedAt: null,
    bioSummary: 'Perfil em atualização.',
    reviewedAt: null,
    editorialApprovedAt: null,
    proposals: [
      {
        title: 'Proposta 1',
        description: 'Em breve.',
        summary: null,
        url: null,
      },
    ],
    votingRecords: [],
    assetDeclarations: [],
    photoUrl: 'http://images.example.org/ana.jpg',
    photoSourceUrl: null,
    photoLicense: null,
  })

  assert.equal(result.indexable, false)
  assert.ok(result.blockers.includes('status_nao_qualificado'))
  assert.ok(result.blockers.includes('status_sem_fonte'))
  assert.ok(result.blockers.includes('introducao_insuficiente'))
  assert.ok(result.blockers.includes('menos_de_tres_modulos'))
  assert.ok(result.blockers.includes('revisao_editorial_ausente'))
  assert.ok(result.blockers.includes('aprovacao_editorial_ausente'))
  assert.ok(result.blockers.includes('placeholder_detectado'))
  assert.ok(result.blockers.includes('imagem_insegura'))
  assert.ok(result.blockers.includes('credito_de_imagem_ausente'))
})

test('reports stale verification as a warning without changing a valid editorial decision', () => {
  const result = evaluateCandidateIndexability(completeCandidate, {
    now: new Date('2026-08-10T15:00:00.000Z'),
  })

  assert.equal(result.indexable, true)
  assert.deepEqual(result.warnings, ['verificacao_de_status_desatualizada'])
})

test('requires an Electoral Justice source for formal registration statuses', () => {
  const result = evaluateCandidateIndexability({
    ...completeCandidate,
    candidacyStatusSourceUrl: 'https://example.org/noticia-sobre-registro',
  })

  assert.equal(result.indexable, false)
  assert.ok(result.blockers.includes('status_formal_sem_fonte_oficial'))
})

test('finds canonical URL collisions between distinct quality-report entries', () => {
  const collisions = findCollidingCanonicalSlugs([
    { slug: 'maria-souza-abc-sp' },
    { slug: 'maria-souza-abc-sp' },
    { slug: 'ana-lima-xyz-rj' },
  ])

  assert.deepEqual([...collisions], ['maria-souza-abc-sp'])
})

test('keeps unrecognized and closed TSE outcomes out of the index', () => {
  for (const candidacyStatus of [
    'cancelado',
    'pedido_nao_conhecido',
    'cassado',
    'falecido',
    'status_nao_mapeado',
  ]) {
    const result = evaluateCandidateIndexability({
      ...completeCandidate,
      candidacyStatus,
    })
    assert.equal(result.indexable, false)
    assert.ok(result.blockers.includes('status_nao_qualificado'))
  }
})

test('detects a visible placeholder even when that proposal has no valid source URL', () => {
  const result = evaluateCandidateIndexability({
    ...completeCandidate,
    proposals: [
      ...completeCandidate.proposals,
      {
        title: 'Proposta 1',
        description: 'Conteúdo em atualização.',
        summary: null,
        url: null,
      },
    ],
  })

  assert.equal(result.indexable, false)
  assert.ok(result.blockers.includes('placeholder_detectado'))
})

test('"teste" dentro de uma frase é conteúdo, não placeholder', () => {
  // O caso real: o plano de governo do Haddad em SP fala em ambientes de teste
  // regulatório, e o token solto na lista de placeholders reprovava a ficha.
  const result = evaluateCandidateIndexability({
    ...completeCandidate,
    proposals: [
      ...completeCandidate.proposals,
      {
        title: 'Oferecer regras estáveis e ambientes de teste para atrair investimento',
        description:
          'Oferecer regras estáveis, ambientes de teste e talento formado em escala ' +
          'para disputar investimentos da era da inteligência artificial.',
        summary: null,
        url: 'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/SP/SP/1/2/2026/SP',
      },
    ],
  })

  assert.ok(!result.blockers.includes('placeholder_detectado'))
})

test('"teste" sozinho no campo continua sendo placeholder', () => {
  for (const title of ['teste', '  Teste  ', 'teste 2', 'TESTE.']) {
    const result = evaluateCandidateIndexability({
      ...completeCandidate,
      proposals: [
        ...completeCandidate.proposals,
        { title, description: 'Descrição qualquer com tamanho suficiente.', summary: null, url: null },
      ],
    })
    assert.ok(
      result.blockers.includes('placeholder_detectado'),
      `esperava placeholder para ${JSON.stringify(title)}`,
    )
  }
})


/**
 * Trilha "fonte oficial": ficha montada so de dado do TSE, sem texto escrito
 * por pessoa. Ver `isOfficialSourceProfile`.
 */
const fichaOficial: CandidateQualityInput = {
  ...completeCandidate,
  tseId: '250002553928',
  position: 'GOVERNADOR',
  runningMateName: null,
  runningMateParty: null,
  runningMateSourceUrl: null,
  // Ninguem redigiu nem revisou: e o que a trilha oficial assume.
  reviewedAt: null,
  editorialApprovedAt: null,
  editorialAuthor: null,
  editorialReviewer: null,
  photoUrl: '/images/candidates/tse/250002553928.jpg',
  photoSourceUrl: 'https://cdn.tse.jus.br/estatistica/sead/eleicoes/foto_cand2026_SP_div.zip',
  photoLicense: 'Foto de urna - Tribunal Superior Eleitoral, dados abertos',
  // So `trajetoria`: sem proposta, sem votacao, sem bens, sem noticia.
  proposals: [],
  votingRecords: [],
  assetDeclarations: [],
  campaignFinancings: [],
  newsItems: [],
}

test('ficha so de fonte oficial indexa sem assinatura humana', () => {
  const result = evaluateCandidateIndexability(fichaOficial, {
    now: new Date('2026-08-07T18:00:00.000Z'),
  })
  assert.deepEqual(result.blockers, [])
  assert.equal(result.indexable, true)
  // Um modulo basta na trilha oficial; exigir tres excluiria toda candidatura
  // sem mandato anterior, que e a maioria.
  assert.deepEqual(result.substantiveModules, ['trajetoria'])
})

test('sem procedencia da foto a ficha volta a trilha editorial e e cobrada de assinatura', () => {
  const result = evaluateCandidateIndexability(
    { ...fichaOficial, photoSourceUrl: null, photoLicense: null },
    { now: new Date('2026-08-07T18:00:00.000Z') },
  )
  assert.equal(result.indexable, false)
  assert.ok(result.blockers.includes('credito_de_imagem_ausente'))
  assert.ok(result.blockers.includes('autoria_ausente'))
  assert.ok(result.blockers.includes('revisor_ausente'))
})

test('ficha oficial sem nenhum modulo com fonte nao indexa', () => {
  // Fonte continua registrada (segue na trilha oficial), mas a ficha ficou
  // curta demais para valer como trajetoria: sem nenhum modulo, nao ha pagina.
  const result = evaluateCandidateIndexability(
    { ...fichaOficial, bio: 'Disputa o governo.' },
    { now: new Date('2026-08-07T18:00:00.000Z') },
  )
  assert.equal(result.indexable, false)
  assert.deepEqual(result.substantiveModules, [])
  assert.ok(result.blockers.includes('sem_modulo_substantivo'))
  // A trilha oficial dispensa assinatura, nao a checagem de conteudo.
  assert.ok(!result.blockers.includes('revisor_ausente'))
})

test('perfil editorial continua exigindo autoria e revisor', () => {
  const result = evaluateCandidateIndexability(
    {
      ...completeCandidate,
      editorialAuthor: null,
      editorialReviewer: null,
    },
    { now: new Date('2026-08-07T18:00:00.000Z') },
  )
  assert.equal(result.indexable, false)
  assert.ok(result.blockers.includes('autoria_ausente'))
  assert.ok(result.blockers.includes('revisor_ausente'))
})
