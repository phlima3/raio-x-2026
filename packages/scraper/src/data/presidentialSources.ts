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
