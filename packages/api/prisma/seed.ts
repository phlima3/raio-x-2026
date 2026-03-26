import 'dotenv/config'
import { PrismaClient, Position } from '@prisma/client'

const prisma = new PrismaClient()

// ── Slug helper ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function makeSlug(name: string, party: string, state: string): string {
  return `${slugify(name)}-${slugify(party)}-${slugify(state)}`
}

// ── Candidate seed data ────────────────────────────────────────────────────────

interface SeedCandidate {
  name: string
  party: string
  state: string
  position: Position
  photoUrl?: string
  siteUrl?: string
  bio?: string
  isIncumbent?: boolean
}

const PRESIDENTS: SeedCandidate[] = [
  {
    name: 'Luiz Inácio Lula da Silva',
    party: 'PT',
    state: 'SP',
    position: Position.PRESIDENTE,
    siteUrl: 'https://pt.org.br',
    bio: 'Presidente da República em exercício. Ex-presidente de 2003 a 2010. Metalúrgico e sindicalista, fundador do Partido dos Trabalhadores.',
    isIncumbent: true,
  },
  {
    name: 'Flávio Bolsonaro',
    party: 'PL',
    state: 'RJ',
    position: Position.PRESIDENTE,
    siteUrl: 'https://www.flaviobolsonaro.net',
    bio: 'Senador pelo Rio de Janeiro. Filho do ex-presidente Jair Bolsonaro. Advogado e político filiado ao Partido Liberal.',
    isIncumbent: false,
  },
  {
    name: 'Ronaldo Caiado',
    party: 'União Brasil',
    state: 'GO',
    position: Position.PRESIDENTE,
    siteUrl: 'http://ronaldocaiado.com.br',
    bio: 'Governador de Goiás. Médico e político, filiado ao União Brasil. Ex-senador e deputado federal.',
    isIncumbent: false,
  },
  {
    name: 'Romeu Zema',
    party: 'Novo',
    state: 'MG',
    position: Position.PRESIDENTE,
    bio: 'Governador de Minas Gerais. Empresário e político filiado ao Partido Novo, conhecido pela gestão liberal do estado.',
    isIncumbent: false,
  },
  {
    name: 'Eduardo Leite',
    party: 'PSD',
    state: 'RS',
    position: Position.PRESIDENTE,
    bio: 'Governador do Rio Grande do Sul. Advogado e político filiado ao PSD. Reeleito em 2022 com ampla margem de votos.',
    isIncumbent: false,
  },
  {
    name: 'Simone Tebet',
    party: 'MDB',
    state: 'MS',
    position: Position.PRESIDENTE,
    siteUrl: 'https://simonetebet.com.br',
    bio: 'Ministra do Planejamento e Orçamento. Senadora e ex-candidata à presidência em 2022. Filiada ao MDB.',
    isIncumbent: false,
  },
  {
    name: 'Renan Santos',
    party: 'MBL',
    state: 'SP',
    position: Position.PRESIDENTE,
    siteUrl: 'https://mbl.org.br',
    bio: 'Coordenador nacional do Movimento Brasil Livre (MBL). Ativista e político liberal.',
    isIncumbent: false,
  },
  {
    name: 'Aldo Rebelo',
    party: 'Solidariedade',
    state: 'SP',
    position: Position.PRESIDENTE,
    siteUrl: 'https://www.aldorebelo.com.br',
    bio: 'Ex-ministro, ex-deputado federal e ex-senador. Político veterano filiado ao Solidariedade.',
    isIncumbent: false,
  },
]

// Governors — 7 priority states: SP, MG, RJ, RS, BA, PR, GO
const GOVERNORS: SeedCandidate[] = [
  // São Paulo
  {
    name: 'Tarcísio de Freitas',
    party: 'Republicanos',
    state: 'SP',
    position: Position.GOVERNADOR,
    siteUrl: 'https://tarcisiofreitas.com.br',
    bio: 'Governador de São Paulo. Ex-ministro da Infraestrutura e ex-militar. Filiado ao Republicanos.',
    isIncumbent: true,
  },
  // Minas Gerais
  {
    name: 'Romeu Zema',
    party: 'Novo',
    state: 'MG',
    position: Position.GOVERNADOR,
    siteUrl: 'https://zema.com.br',
    bio: 'Governador de Minas Gerais reeleito. Empresário do setor de materiais de construção, filiado ao Partido Novo.',
    isIncumbent: true,
  },
  // Rio de Janeiro
  {
    name: 'Cláudio Castro',
    party: 'PL',
    state: 'RJ',
    position: Position.GOVERNADOR,
    siteUrl: 'https://claudiocastro.com.br',
    bio: 'Governador do Rio de Janeiro. Ex-vice-governador que assumiu após a prisão de Wilson Witzel. Filiado ao PL.',
    isIncumbent: true,
  },
  // Rio Grande do Sul
  {
    name: 'Eduardo Leite',
    party: 'PSD',
    state: 'RS',
    position: Position.GOVERNADOR,
    siteUrl: 'https://eduardoleite.com.br',
    bio: 'Governador do Rio Grande do Sul reeleito. Advogado e político filiado ao PSD.',
    isIncumbent: true,
  },
  // Bahia
  {
    name: 'Jerônimo Rodrigues',
    party: 'PT',
    state: 'BA',
    position: Position.GOVERNADOR,
    siteUrl: 'https://www.ba.gov.br',
    bio: 'Governador da Bahia. Ex-secretário de Educação do estado. Filiado ao Partido dos Trabalhadores.',
    isIncumbent: true,
  },
  // Paraná
  {
    name: 'Ratinho Junior',
    party: 'PSD',
    state: 'PR',
    position: Position.GOVERNADOR,
    siteUrl: 'https://ratinhojunior.com.br',
    bio: 'Governador do Paraná reeleito. Filho do apresentador Carlos Massa, o Ratinho. Filiado ao PSD.',
    isIncumbent: true,
  },
  // Goiás
  {
    name: 'Ronaldo Caiado',
    party: 'União Brasil',
    state: 'GO',
    position: Position.GOVERNADOR,
    siteUrl: 'http://ronaldocaiado.com.br',
    bio: 'Governador de Goiás reeleito em 2022. Médico e político experiente filiado ao União Brasil.',
    isIncumbent: true,
  },
]

// ── Seed function ─────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.info('[seed] Starting MVP seed…')

  const all = [...PRESIDENTS, ...GOVERNORS]
  let created = 0
  let updated = 0

  for (const c of all) {
    const slug = makeSlug(c.name, c.party, c.state)

    // Use slug as the stable upsert key (no tseId yet — available post-August 2026)
    const existing = await prisma.candidate.findFirst({ where: { name: c.name, party: c.party, state: c.state, position: c.position } })

    if (existing) {
      await prisma.candidate.update({
        where: { id: existing.id },
        data: {
          slug,
          photoUrl: c.photoUrl ?? existing.photoUrl,
          siteUrl: c.siteUrl ?? existing.siteUrl,
          bio: c.bio ?? existing.bio,
          isIncumbent: c.isIncumbent ?? existing.isIncumbent,
        },
      })
      updated++
      console.info(`[seed] Updated: ${c.name} (${c.party}-${c.state})`)
    } else {
      await prisma.candidate.create({
        data: {
          slug,
          name: c.name,
          party: c.party,
          state: c.state,
          position: c.position,
          photoUrl: c.photoUrl ?? null,
          siteUrl: c.siteUrl ?? null,
          bio: c.bio ?? null,
          isIncumbent: c.isIncumbent ?? false,
          electionYear: 2026,
        },
      })
      created++
      console.info(`[seed] Created: ${c.name} (${c.party}-${c.state}) — slug: ${slug}`)
    }
  }

  console.info(`[seed] Done — ${created} created, ${updated} updated`)
}

seed()
  .catch((err) => {
    console.error('[seed] Fatal error', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
