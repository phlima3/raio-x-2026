/**
 * Fontes curadas para descoberta de presidenciáveis 2026 e extração de propostas.
 *
 * `kind` orienta o que extrair de cada página:
 *   - candidate_list: artigos "quem são os pré-candidatos" — fonte de verdade
 *     para a LISTA de presidenciáveis (nome, partido, status)
 *   - poll: pesquisas eleitorais — confirmam quem está no páreo
 *   - news_hub: hubs de notícias — propostas e declarações recentes
 *
 * Atualizar as URLs quando os veículos publicarem versões mais recentes
 * (o JOTA, por exemplo, publica uma edição por mês).
 */

export interface PresidentialNewsSource {
  id: string
  name: string
  url: string
  kind: 'candidate_list' | 'poll' | 'news_hub'
  /** Fontes que bloqueiam bots exigem Playwright com user agent de navegador real. */
  requiresBrowser?: boolean
}

export const PRESIDENTIAL_SOURCES: PresidentialNewsSource[] = [
  {
    id: 'jota-pre-candidatos',
    name: 'JOTA — Quem são os pré-candidatos a presidente',
    url: 'https://www.jota.info/eleicoes/eleicoes-2026/quem-sao-pre-candidatos-a-presidente-da-republica-do-brasil-eleicoes-de-2026-junho',
    kind: 'candidate_list',
    requiresBrowser: true,
  },
  {
    id: 'wikipedia-eleicao-2026',
    name: 'Wikipédia — Eleição presidencial no Brasil em 2026',
    url: 'https://pt.wikipedia.org/wiki/Elei%C3%A7%C3%A3o_presidencial_no_Brasil_em_2026',
    kind: 'candidate_list',
  },
  {
    id: 'datafolha-junho-2026',
    name: 'Datafolha — Intenção de voto (junho/2026)',
    url: 'https://datafolha.folha.uol.com.br/eleicoes/2026/06/lula-pt-mantem-vantagem-no-1o-turno-e-2o-turno.shtml',
    kind: 'poll',
    requiresBrowser: true,
  },
  {
    id: 'g1-eleicoes-2026',
    name: 'G1 — Eleições 2026',
    url: 'https://g1.globo.com/politica/eleicoes/2026/',
    kind: 'news_hub',
    requiresBrowser: true,
  },
]

/**
 * Apelidos → nome canônico no banco. Notícias raramente usam o nome completo
 * ("Lula" em vez de "Luiz Inácio Lula da Silva"), então o matching por
 * normalização precisa dessa ajuda.
 */
export const CANDIDATE_ALIASES: Record<string, string> = {
  lula: 'Luiz Inácio Lula da Silva',
  'luis inacio lula da silva': 'Luiz Inácio Lula da Silva',
  'flavio bolsonaro': 'Flávio Bolsonaro',
  'ronaldo caiado': 'Ronaldo Caiado',
  caiado: 'Ronaldo Caiado',
  'romeu zema': 'Romeu Zema',
  zema: 'Romeu Zema',
  'renan santos': 'Renan Santos',
  'ciro gomes': 'Ciro Gomes',
  'ciro ferreira gomes': 'Ciro Gomes',
  'joaquim barbosa': 'Joaquim Barbosa',
  'aldo rebelo': 'Aldo Rebelo',
  'cabo daciolo': 'Cabo Daciolo',
  'benevenuto daciolo': 'Cabo Daciolo',
  'simone tebet': 'Simone Tebet',
  'eduardo leite': 'Eduardo Leite',
  'rui costa pimenta': 'Rui Costa Pimenta',
}

/**
 * Identidades editoriais curadas. A chave persistida é opaca e só entra nesta
 * lista após conferência humana; normalizar um nome não cria identidade.
 */
export const PRESIDENTIAL_PERSON_KEYS: Record<string, string> = {
  'luiz inacio lula da silva': 'd7a40159-32f7-4d18-a01d-2eb96ef8eae9',
  'flavio bolsonaro': 'c8b680bb-f3a3-4705-b12e-b6b2ddde2a95',
  'ronaldo caiado': '36bc025c-7d2f-4b04-96f8-c43e371a50f0',
  'romeu zema': 'ba1d6927-7bcb-45a1-9555-d0ca1f75d897',
  'renan santos': '9a23e126-fc84-414a-ad5f-0f98ee402108',
  'ciro gomes': 'f9bca31d-4b56-49ea-97a9-c43c2a304975',
  'joaquim barbosa': 'cf225b01-f496-4b61-9ef0-3ff4a2bdde94',
  'aldo rebelo': '81404d1b-0c15-47b8-9594-52dc82620203',
  'cabo daciolo': '1e73bcd6-e587-4c46-9805-a52084a89048',
  'simone tebet': '839fa647-8fea-43cb-aeb9-03cb4cd109c3',
  'eduardo leite': 'ad5b1a75-e8aa-4a2a-a50e-69c96700806d',
  'rui costa pimenta': '7973b99f-a992-487d-8cc6-bfe6bd7c70e7',
}
