export interface EditorialLink {
  label: string
  href?: string
  detail?: string
}

export interface EditorialSectionDefinition {
  title: string
  paragraphs?: string[]
  items?: EditorialLink[]
}

export interface EditorialPageDefinition {
  slug: string
  eyebrow: string
  title: string
  description: string
  intro: string
  updatedAt: string
  sections: EditorialSectionDefinition[]
}

export const EDITORIAL_PAGES: EditorialPageDefinition[] = [
  {
    slug: 'sobre',
    eyebrow: 'Institucional',
    title: 'Sobre o Raio-X 2026',
    description: 'Conheça o propósito, o escopo e as responsabilidades do projeto Raio-X 2026.',
    intro:
      'O Raio-X 2026 organiza informações públicas sobre pessoas acompanhadas no processo eleitoral brasileiro. O objetivo é facilitar a conferência de situação eleitoral, propostas, trajetória, votações e dados de transparência sem pedir confiança cega no projeto.',
    updatedAt: '2026-08-07T15:00:00-03:00',
    sections: [
      {
        title: 'Propósito e escopo',
        paragraphs: [
          'O projeto cobre inicialmente a disputa presidencial e candidaturas aos governos estaduais. Outras disputas só recebem páginas editoriais quando os dados e a capacidade de revisão forem suficientes.',
          'Uma página pública não é, por si só, uma afirmação de candidatura oficial. Cada perfil exibe a situação encontrada, a fonte e o momento da verificação.',
        ],
      },
      {
        title: 'Independência',
        paragraphs: [
          'O Raio-X 2026 é um projeto independente, sem vínculo declarado com partidos ou campanhas. O mesmo critério de fonte, revisão e indexação deve ser aplicado a todas as pessoas acompanhadas.',
          'A presença, ausência ou posição de um perfil nas buscas não representa apoio, rejeição ou recomendação de voto.',
        ],
      },
      {
        title: 'Responsabilidade editorial',
        paragraphs: [
          'Perfis aptos à indexação precisam identificar autoria, revisão e data de atualização material. Enquanto esses campos não estiverem completos, o perfil permanece em revisão e fora do índice de busca.',
        ],
        items: [
          { label: 'Equipe e responsabilidades', href: '/equipe' },
          { label: 'Política editorial', href: '/politica-editorial' },
          { label: 'Solicitar uma correção', href: '/correcoes' },
        ],
      },
      {
        title: 'Código e prestação de contas',
        paragraphs: [
          'A implementação e seu histórico técnico podem ser auditados no repositório público. Questões editoriais devem ser abertas com a URL afetada e uma fonte verificável.',
        ],
        items: [
          {
            label: 'Repositório do Raio-X 2026',
            href: 'https://github.com/phlima3/raio-x-2026',
          },
          { label: 'Changelog público', href: '/changelog' },
        ],
      },
    ],
  },
  {
    slug: 'metodologia',
    eyebrow: 'Transparência',
    title: 'Metodologia',
    description: 'Como o Raio-X 2026 coleta, cruza, revisa e publica dados eleitorais.',
    intro:
      'Esta metodologia separa coleta automatizada, transformação de dados, síntese assistida por IA e decisão editorial. Fatos sensíveis só podem ser tratados como verificados quando há fonte identificada e revisão auditável.',
    updatedAt: '2026-08-07T15:00:00-03:00',
    sections: [
      {
        title: '1. Coleta e proveniência',
        paragraphs: [
          'Dados eleitorais, legislativos e patrimoniais são coletados de fontes públicas. Cada proposta, votação, declaração de bens ou dado de financiamento precisa preservar um endereço de origem sempre que a fonte o oferece.',
          'Fontes jornalísticas podem registrar anúncios, desistências e declarações. Depois do protocolo de candidatura, dados da Justiça Eleitoral têm prioridade para o status formal.',
        ],
      },
      {
        title: '2. Vocabulário de situação eleitoral',
        items: [
          { label: 'Nome cotado', detail: 'menção especulativa, sem anúncio formal identificado.' },
          { label: 'Pré-candidatura anunciada', detail: 'intenção pública antes da convenção.' },
          { label: 'Escolhido em convenção', detail: 'decisão formal da convenção partidária.' },
          { label: 'Registro solicitado', detail: 'pedido protocolado e ainda sujeito a julgamento.' },
          { label: 'Deferido ou indeferido', detail: 'situação decidida pela Justiça Eleitoral, sujeita a recursos quando indicados na fonte.' },
          { label: 'Desistiu ou substituído', detail: 'mudança posterior documentada por fonte.' },
        ],
      },
      {
        title: '3. Gate de qualidade para indexação',
        paragraphs: [
          'O gate é automático e conservador. Exige identidade e status com fonte, introdução exclusiva, ao menos três módulos substantivos com fontes, atualização material, autoria, revisão e aprovação editorial. Placeholder, foto insegura ou alteração posterior à revisão bloqueiam a indexação.',
          'O relatório do gate expõe códigos e mensagens acionáveis. Perfis reprovados continuam navegáveis com noindex,follow, para permitir revisão sem apresentá-los ao Google como resultado pronto.',
        ],
      },
      {
        title: '4. Uso de inteligência artificial',
        paragraphs: [
          'IA pode auxiliar extração, classificação, resumo e análise de consistência. Ela não é fonte factual. O texto assistido por IA é sinalizado, mantém links para evidências e só pode passar pelo gate após revisão humana registrada.',
          'O score de consistência é uma síntese entre propostas catalogadas e votações disponíveis. Ausência de dados, mudança de contexto ou interpretação legislativa limita o resultado; por isso o score não deve ser lido como nota de caráter ou recomendação eleitoral.',
        ],
      },
      {
        title: '5. Atualização e versionamento',
        paragraphs: [
          'Atualizações técnicas de banco não alteram a data editorial. O campo de atualização material muda apenas quando um fato ou conteúdo visível muda. Nova edição invalida aprovação anterior até que a revisão seja refeita.',
        ],
        items: [
          { label: 'Histórico de mudanças', href: '/changelog' },
          { label: 'Política de correções', href: '/correcoes' },
        ],
      },
    ],
  },
  {
    slug: 'fontes',
    eyebrow: 'Proveniência',
    title: 'Fontes utilizadas',
    description: 'Fontes oficiais e critérios de atribuição usados pelo Raio-X 2026.',
    intro:
      'O Raio-X 2026 diferencia fonte primária, documento de campanha e cobertura jornalística. Um link de origem permite que a pessoa leitora confira contexto, data e eventuais atualizações.',
    updatedAt: '2026-08-07T15:00:00-03:00',
    sections: [
      {
        title: 'Fontes primárias prioritárias',
        items: [
          { label: 'Tribunal Superior Eleitoral — dados abertos', href: 'https://dadosabertos.tse.jus.br', detail: 'registros, resultados, bens e prestação de contas.' },
          { label: 'Câmara dos Deputados — dados abertos', href: 'https://dadosabertos.camara.leg.br', detail: 'proposições, autoria e votações nominais.' },
          { label: 'Senado Federal — dados abertos', href: 'https://legis.senado.leg.br/dadosabertos', detail: 'senadores, matérias e votações.' },
          { label: 'Portal da Transparência', href: 'https://portaldatransparencia.gov.br', detail: 'dados de despesas e transferências públicas.' },
        ],
      },
      {
        title: 'Documentos de candidatura e partido',
        paragraphs: [
          'Planos de governo, sites oficiais e documentos partidários podem comprovar propostas ou anúncios, mas são declarações da própria candidatura. O texto deve deixar clara essa natureza e não tratá-los como validação independente.',
        ],
      },
      {
        title: 'Cobertura jornalística',
        paragraphs: [
          'Veículos jornalísticos podem ser usados para declarações, contexto e acontecimentos ainda não refletidos em bases oficiais. Título, URL e data precisam ser preservados; textos sem origem identificável não qualificam módulos para indexação.',
        ],
      },
      {
        title: 'Critérios de preferência',
        items: [
          { label: 'Proximidade', detail: 'preferir a fonte responsável pelo ato ou registro.' },
          { label: 'Atualidade', detail: 'conferir data, versão e situação recursal.' },
          { label: 'Especificidade', detail: 'vincular a fonte à afirmação que ela realmente sustenta.' },
          { label: 'Reprodutibilidade', detail: 'manter URL ou identificador que permita nova consulta.' },
        ],
      },
    ],
  },
  {
    slug: 'politica-editorial',
    eyebrow: 'Governança',
    title: 'Política editorial',
    description: 'Regras de neutralidade, revisão humana, IA e conflitos do Raio-X 2026.',
    intro:
      'A política editorial existe para reduzir assimetrias entre candidatos, explicitar incerteza e impedir que automação transforme hipótese em fato. O mesmo padrão documental deve valer para todos os perfis.',
    updatedAt: '2026-08-07T15:00:00-03:00',
    sections: [
      {
        title: 'Neutralidade e linguagem',
        paragraphs: [
          'O projeto descreve atos, propostas e registros sem pedir voto. Termos valorativos devem estar atribuídos a uma fonte ou claramente identificados como análise metodológica. Títulos não podem sugerir candidatura oficial quando o status é apenas cotado ou pré-candidato.',
        ],
      },
      {
        title: 'Equidade de tratamento',
        paragraphs: [
          'Critérios de inclusão, módulos, fontes e gate de indexação são aplicados por regra, não por preferência editorial. A falta de informação deve ser apresentada como falta de informação, não como evidência negativa sobre uma pessoa.',
        ],
      },
      {
        title: 'Automação e IA',
        paragraphs: [
          'Conteúdo gerado ou resumido com auxílio de IA recebe disclosure. Modelos podem classificar temas e sugerir sínteses, mas não aprovam perfis, não resolvem conflitos entre fontes e não substituem revisão humana.',
        ],
      },
      {
        title: 'Autoria, revisão e aprovação',
        paragraphs: [
          'Cada perfil indexável registra autoria, pessoa ou equipe revisora, atualização material e aprovação. Uma mudança posterior torna a aprovação antiga insuficiente até nova revisão.',
        ],
        items: [
          { label: 'Equipe e responsabilidades', href: '/equipe' },
          { label: 'Metodologia completa', href: '/metodologia' },
        ],
      },
      {
        title: 'Conflitos e correções',
        paragraphs: [
          'Pessoas responsáveis devem declarar conflito relevante e se afastar da decisão editorial afetada. Contestações documentadas entram na fila de correção, com prioridade para status eleitoral, identidade e alegações potencialmente danosas.',
        ],
        items: [{ label: 'Abrir pedido de correção', href: '/correcoes' }],
      },
    ],
  },
  {
    slug: 'correcoes',
    eyebrow: 'Prestação de contas',
    title: 'Correções e contestações',
    description: 'Como comunicar erro, contestar informação e acompanhar correções no Raio-X 2026.',
    intro:
      'Erros factuais, fontes quebradas, identidade incorreta ou contexto ausente devem ser corrigidos com rastreabilidade. Envie a URL afetada, descreva o ponto e inclua uma fonte verificável sempre que possível.',
    updatedAt: '2026-08-07T15:00:00-03:00',
    sections: [
      {
        title: 'Como enviar',
        items: [
          { label: 'Abrir uma issue de correção no GitHub', href: 'https://github.com/phlima3/raio-x-2026/issues/new', detail: 'inclua URL, trecho, correção proposta e fonte.' },
          { label: 'Consultar pedidos existentes', href: 'https://github.com/phlima3/raio-x-2026/issues', detail: 'evite duplicar uma contestação já registrada.' },
        ],
      },
      {
        title: 'Triagem',
        paragraphs: [
          'Identidade, status de candidatura, resultado judicial e alegações sensíveis têm prioridade. A equipe confere a fonte, registra a decisão e, quando houver mudança material, invalida a aprovação editorial anterior até nova revisão.',
        ],
      },
      {
        title: 'O que será registrado',
        paragraphs: [
          'Mudanças materiais devem aparecer no changelog com data, página afetada e natureza da correção. Ajustes puramente técnicos ou tipográficos podem ser agrupados sem expor dados pessoais de quem reportou.',
        ],
      },
      {
        title: 'Privacidade e segurança',
        paragraphs: [
          'Não publique documentos pessoais, telefone, endereço ou informação sensível em issues públicas. Para um relato que exija sigilo, não envie o material até que um canal privado institucional seja formalmente publicado nesta página.',
        ],
      },
    ],
  },
  {
    slug: 'equipe',
    eyebrow: 'Responsabilidade',
    title: 'Equipe, autoria e revisão',
    description: 'Como autoria, revisão e aprovação são atribuídas no Raio-X 2026.',
    intro:
      'O produto usa “Equipe Raio-X 2026” apenas como identificação institucional do projeto. Perfis indexáveis precisam registrar, no próprio banco, a autoria e a pessoa ou equipe responsável pela revisão daquela edição.',
    updatedAt: '2026-08-07T15:00:00-03:00',
    sections: [
      {
        title: 'Papéis editoriais',
        items: [
          { label: 'Autoria', detail: 'organiza a narrativa e garante que cada afirmação tenha suporte.' },
          { label: 'Revisão', detail: 'confere identidade, status, fontes, linguagem e equilíbrio.' },
          { label: 'Aprovação', detail: 'libera uma edição para o gate de indexação após as verificações.' },
          { label: 'Dados e engenharia', detail: 'mantêm coleta, proveniência, disponibilidade e testes.' },
        ],
      },
      {
        title: 'Identificação por perfil',
        paragraphs: [
          'O expediente ao fim de cada perfil exibe autoria, revisão e atualização material. Campos ausentes bloqueiam automaticamente a indexação; não são preenchidos por suposição ou por uma migração de banco.',
        ],
      },
      {
        title: 'Responsáveis públicos',
        paragraphs: [
          'A responsabilidade institucional e editorial publicada é da Equipe Raio-X 2026. Nomes individuais e canais privados adicionais só serão publicados quando houver designação explícita; contribuições e correções permanecem rastreadas pelo repositório público, sem inventar atribuições pessoais.',
        ],
        items: [
          { label: 'Repositório público', href: 'https://github.com/phlima3/raio-x-2026' },
          { label: 'Política editorial', href: '/politica-editorial' },
        ],
      },
    ],
  },
  {
    slug: 'changelog',
    eyebrow: 'Versionamento',
    title: 'Histórico de mudanças',
    description: 'Mudanças materiais, editoriais e metodológicas do Raio-X 2026.',
    intro:
      'Este histórico distingue alterações de produto das mudanças factuais em perfis. A data exibida em uma página de candidato só deve mudar quando o conteúdo material daquela página mudar.',
    updatedAt: '2026-08-07T15:00:00-03:00',
    sections: [
      {
        title: '7 de agosto de 2026 — infraestrutura editorial e SEO',
        items: [
          { label: 'Origem canônica, robots e sitemap controlado por quality gate.' },
          { label: 'Status eleitoral com fonte e data de verificação.' },
          { label: 'Campos auditáveis de autoria, revisão, aprovação e atualização material.' },
          { label: 'Conteúdo crítico preparado para renderização inicial no servidor.' },
          { label: 'Páginas públicas de metodologia, fontes, política editorial e correções.' },
        ],
      },
      {
        title: 'Mudanças de dados eleitorais',
        paragraphs: [
          'Correções e atualizações por candidato serão adicionadas quando uma edição editorial for efetivamente aprovada. Esta página não declara como concluída nenhuma atualização externa ou revisão ainda não registrada.',
        ],
      },
      {
        title: 'Evidência técnica',
        items: [
          { label: 'Histórico completo no GitHub', href: 'https://github.com/phlima3/raio-x-2026/commits/main' },
          { label: 'Plano e critérios de SEO', href: 'https://github.com/phlima3/raio-x-2026/blob/main/docs/SEO_PLAN.md' },
        ],
      },
    ],
  },
  {
    slug: 'dados',
    eyebrow: 'Dados abertos',
    title: 'Dados e API pública',
    description: 'Como consultar os dados públicos usados pelo Raio-X 2026 e entender suas limitações.',
    intro:
      'A API pública permite consultar candidatos, propostas e estatísticas. Os dados derivados mantêm links para suas origens quando disponíveis; restrições e licenças das fontes originais continuam aplicáveis.',
    updatedAt: '2026-08-07T15:00:00-03:00',
    sections: [
      {
        title: 'Endpoints de leitura',
        items: [
          { label: 'Lista de candidatos', href: 'https://api.raio-x-2026.com.br/api/candidates', detail: 'filtros por cargo, UF, partido, ano e busca.' },
          { label: 'Estatísticas do catálogo', href: 'https://api.raio-x-2026.com.br/api/candidates/stats' },
          { label: 'Gráfico citável — perfis por partido', href: '/graficos/perfis-por-partido', detail: 'visualização e PNG incorporável com ressalva metodológica.' },
          { label: 'Relatório de qualidade SEO', href: 'https://api.raio-x-2026.com.br/api/candidates/seo-report', detail: 'disponível após a implantação da versão correspondente da API.' },
          { label: 'Categorias de propostas', href: 'https://api.raio-x-2026.com.br/api/proposals/categories' },
        ],
      },
      {
        title: 'Proveniência e atribuição',
        paragraphs: [
          'Ao reutilizar um registro, cite o Raio-X 2026 e preserve a referência da fonte primária. Antes de redistribuir fotografias, documentos ou bases oficiais, confira os termos da origem indicada no registro.',
        ],
      },
      {
        title: 'Limitações',
        paragraphs: [
          'O catálogo pode conter perfis ainda em revisão, lacunas históricas e atrasos entre uma decisão oficial e sua sincronização. O campo de situação e sua data de verificação devem ser lidos em conjunto; para decisões jurídicas ou eleitorais, consulte diretamente a Justiça Eleitoral.',
        ],
      },
      {
        title: 'Contribuição e auditoria',
        items: [
          { label: 'Código e esquema de dados', href: 'https://github.com/phlima3/raio-x-2026' },
          { label: 'Metodologia', href: '/metodologia' },
          { label: 'Reportar um problema', href: '/correcoes' },
        ],
      },
    ],
  },
  {
    slug: 'imprensa',
    eyebrow: 'Press kit',
    title: 'Informações para imprensa',
    description: 'Descrição, critérios de citação e recursos do projeto Raio-X 2026 para jornalistas.',
    intro:
      'O Raio-X 2026 é um arquivo independente de dados públicos eleitorais. Jornalistas podem citar páginas e dados desde que preservem o contexto, a data de verificação e a fonte primária indicada.',
    updatedAt: '2026-08-07T15:00:00-03:00',
    sections: [
      {
        title: 'Descrição curta',
        paragraphs: [
          'Raio-X 2026 — plataforma independente que organiza situação eleitoral, propostas, votações, patrimônio e fontes públicas sobre pessoas acompanhadas nas Eleições 2026.',
        ],
      },
      {
        title: 'Como citar',
        paragraphs: [
          'Use “Raio-X 2026”, inclua a URL da página consultada, a data de acesso e, para um dado factual, também a fonte original mostrada no perfil. Não descreva um nome cotado ou pré-candidato como candidatura registrada.',
        ],
      },
      {
        title: 'Recursos',
        items: [
          { label: 'Metodologia', href: '/metodologia' },
          { label: 'Fontes', href: '/fontes' },
          { label: 'API e dados', href: '/dados' },
          { label: 'Gráfico citável — perfis por partido', href: '/graficos/perfis-por-partido' },
          { label: 'Imagem institucional Open Graph', href: '/opengraph-image' },
        ],
      },
      {
        title: 'Responsabilidade e contato',
        paragraphs: [
          'Responsável institucional e editorial: Equipe Raio-X 2026. A manutenção técnica é exercida pelos mantenedores identificáveis no histórico do repositório. O canal público oficial, enquanto não houver endereço privado publicado, é o tracker de issues abaixo.',
        ],
        items: [
          { label: 'Contato público do projeto', href: 'https://github.com/phlima3/raio-x-2026/issues/new' },
          { label: 'Equipe e divisão de responsabilidades', href: '/equipe' },
        ],
      },
      {
        title: 'Contato e correções',
        paragraphs: [
          'Até a publicação de um canal institucional privado, pedidos públicos devem usar o repositório. Não envie dados pessoais ou material sigiloso em uma issue.',
        ],
        items: [
          { label: 'Abrir contato público', href: 'https://github.com/phlima3/raio-x-2026/issues/new' },
          { label: 'Política de correções', href: '/correcoes' },
        ],
      },
    ],
  },
]

export function findEditorialPage(slug: string): EditorialPageDefinition | undefined {
  return EDITORIAL_PAGES.find((page) => page.slug === slug)
}
