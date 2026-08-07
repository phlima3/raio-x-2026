# Changelog de execução do plano SEO

## 7 de agosto de 2026 — implementação no repositório

### Infraestrutura técnica

- origem canônica centralizada e redirect 308 por protocolo/hostname no middleware;
- metadata base, canonicals, robots, sitemap e regras de parâmetros;
- imagem OG global e imagem dinâmica por candidato;
- normalização HTTPS de fotos em todas as superfícies conhecidas;
- sitemap alimentado pelo quality report, sem busca, parâmetros ou perfis reprovados;
- scripts `seo:audit` e `seo:quality-report` adicionados.

### Dados e editorial

- campos auditáveis de fonte/status, foto, atualização material, autoria, revisão e aprovação;
- vocabulário eleitoral ampliado e exibido sem presumir registro oficial;
- ingestão real dos CSVs oficiais diários de candidaturas e dados complementares do TSE,
  unidos por `SQ_CANDIDATO`, com status judicial conservador e execução a cada duas horas;
- nome social lido exclusivamente de `NM_SOCIAL_CANDIDATO`, sem confundi-lo com nome de urna;
- identidade positiva por `personKey`/TSE, resolução canônica determinística, colisões fail-closed e tabela de aliases;
- associação TSE estrita por identificador, sem promover correspondência aproximada de nomes a identidade oficial;
- sync editorial restrito a `personKey` opaco da lista curada; homônimo, identidade ausente ou
  duplicada falha fechado sem atualizar status, partido ou propostas;
- resultados oficiais cancelado, pedido não conhecido, cassado, falecido e rótulo desconhecido
  recebem estados não qualificantes, nunca o fallback indexável de registro solicitado;
- substituições de chapa usam `SQ_SUBSTITUIDO`; a candidatura atual recebe somente o endpoint
  ativo e único da cadeia independente de vices;
- registro canônico prioriza identidade/fonte oficial e datas verificadas antes de qualquer
  preferência de status, impedindo um legado pré-candidato de ocultar decisão oficial;
- filtros, deduplicação e paginação de listagens executados no PostgreSQL antes de hidratar a resposta;
- política única para fatos públicos: propostas não rascunho e fontes HTTPS em propostas,
  votos, patrimônio, financiamento e notícias; perfil, APIs, comparações, score e quality
  report usam os mesmos filtros, limites e ordenação;
- mudanças reais no sync semanal de propostas — inclusive remoções confirmadas por um
  snapshot válido da fonte — atualizam `materialUpdatedAt`, despublicam o item ausente,
  removem scores de consistência obsoletos numa transação e invalidam caches/ISR;
- a importação de pesquisa por IA só altera campos visíveis quando detecta mudança material,
  reabre a revisão via timestamp e invalida API/ISR; propostas geradas permanecem em `DRAFT`
  e nunca sobrescrevem uma proposta já publicada;
- gate fail-closed com códigos, mensagens, módulos e alertas;
- páginas de sobre, metodologia, fontes, política editorial, correções, equipe e changelog;
- JSON-LD seguro para Organization, WebSite, BreadcrumbList e WebPage/Person.

### Conteúdo e arquitetura

- perfil em ISR com propostas e estado inicial de consistência, notícias e transparência no HTML;
- landings de eleições, Presidência, governo/UF, Senado/UF e cinco temas;
- landings vazias recebem noindex e ficam fora do sitemap;
- infraestrutura de comparações editoriais seletivas, sem gerar combinações automáticas;
- páginas de dados/API e press kit;
- gráfico por partido com metodologia, JSON-LD e PNG incorporável com crédito;
- mapa de intenção por candidato marcado como hipótese até validação no Search Console.

### Operação

- endpoint autenticado de revalidação e integração no sync presidencial;
- invalidação de caches de candidatos, propostas, comparações e consistência; qualquer
  mudança material no snapshot de propostas remove scores persistidos obsoletos;
- captura validada de Web Vitals, GA4 opcional e meta de verificação do Search Console;
- runbooks de deploy, gate editorial, Search Console/analytics, monitoramento e outreach.

### Itens externos não declarados como concluídos

- deploy do frontend e auditoria pública completa das páginas SEO;
- redirect/TLS na borda e DNS;
- propriedade e sitemap no Google Search Console;
- decisão de privacidade e credenciais de analytics;
- revisão/aprovação factual de cada candidato e crédito das fotografias;
- publicação de comparações editoriais;
- contatos, menções e backlinks;
- coleta de baseline e otimizações baseadas em dados reais.

### Evidências de QA do artefato

- Prisma Client regenerado após a migration;
- schema Prisma validado e migration aditiva encapsulada em `BEGIN`/`COMMIT`;
- migration `20260807090000_add_seo_editorial_fields` aplicada em produção em 7 de agosto
  de 2026, com `finished_at`, sem rollback e sem migration falha;
- API implantada no Veloz pelo deployment `dep_1Bbh_hQ7hntn` e validada em
  `https://api.raio-x-2026.com.br`;
- API: 19 testes de domínio aprovados e build TypeScript aprovado;
- Web: 16 testes aprovados, typecheck e lint sem avisos ou erros;
- Scraper: 18 testes aprovados e build TypeScript aprovado;
- Vitest unitário: 20 testes aprovados; integração: 43 testes aprovados;
- total: 116 testes automatizados aprovados nas suítes executadas;
- Next.js: build de produção aprovado, com 83 páginas geradas na fixture qualificada;
- smoke do build: home, robots, sitemap, hubs, parâmetros, landing programática,
  perfil SSR/ISR, JSON-LD, imagens OG, redirects 308, Web Vitals e revalidação aprovados;
- sitemap do artefato: 17 URLs únicas, incluindo exatamente o perfil aprovado pela
  fixture e sem busca ou variações utilitárias;
- `git diff --check`: sem erro de whitespace.
- duas revisões independentes concluídas sem achados altos ou médios remanescentes.

O smoke revelou e permitiu corrigir uma falha de renderização sob demanda no perfil:
o filtro `?tema=` lia parâmetros no Server Component e provocava HTTP 500. O filtro agora
sincroniza a URL no cliente, enquanto todas as propostas continuam presentes no HTML SSR.

A revisão final também encontrou e corrigiu: invalidação editorial ausente ao inserir
proposta, scores e caches derivados obsoletos, fonte de status divergente do status vencedor,
recurso eleitoral não monotônico, ausência de ingestão oficial corrente, lotes de revalidação
acima do limite, índice único legado de slug, inferência insegura de identidade por nome/UF,
colisão de homônimos, paginação em memória, placeholder invisível ao gate, fallback de slug
  custoso, contagem truncada de partidos, ranking canônico que ocultava decisão oficial,
  substituição unilateral de vice, conteúdo privado usado no score, remoções da fonte não
  reconciliadas, falha de LLM confundida com snapshot vazio, mudança de slug sem alias,
  mutações por IA sem reabrir revisão e ausência de links do Senado para todas as UFs.

Em 7 de agosto, a leitura real dos ZIPs oficiais `consulta_cand_2026.zip` e
`consulta_cand_complementar_2026.zip` foi validada sem persistir dados. A junção pelo
identificador oficial interpretou 183 linhas dos cargos suportados, das quais 130 eram
perfis de Presidente, Governador ou Senador e 2 eram pedidos presidenciais no snapshot;
entre os 130 perfis, 1 tinha decisão deferida explícita e 129 permaneciam como registro
solicitado segundo o snapshot consultado.

Como regressão de substituição, o snapshot presidencial de 2022 também foi lido sem
persistência: a chapa substituída de Roberto Jefferson ficou sem a vice atual, enquanto a
chapa sucessora de Kelmon recebeu Luiz Cláudio Gamonal; o registro cancelado permaneceu
não qualificante. Isso valida cadeias independentes de titular e vice com dados reais.

A API pública agora expõe `/api/candidates/seo-report`: o smoke de produção retornou HTTP
200 com 61 perfis avaliados. Nenhum está indexável ainda; os 61 permanecem bloqueados pelo
gate até receberem dados completos e aprovação editorial individual. O build também falha,
em vez de publicar um sitemap parcial, quando o quality report está indisponível.
