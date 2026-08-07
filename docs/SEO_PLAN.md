# Plano de SEO — RAIO-X 2026

**Status:** implementação concluída no repositório; deploy, revisão editorial e integrações externas pendentes de evidência
**Período:** 7 de agosto a 4 de outubro de 2026
**Objetivo:** fazer as páginas qualificadas de candidatos serem descobertas, indexadas e encontradas em buscas orgânicas relacionadas aos nomes, propostas e histórico dos candidatos.

## Status de execução em 7 de agosto de 2026

| Tarefa | Repositório | Dependência externa ou editorial |
| --- | --- | --- |
| SEO-001 | Middleware/config canônico implementado e testado | Validar DNS, TLS e redirect da borda após deploy |
| SEO-002–006 | Metadata, canonical, robots, sitemap, parâmetros e OG implementados | Documentar origem/licença das fotos e auditar produção |
| SEO-007 | Hooks de verificação, GA4 opcional e Web Vitals implementados | DNS, contas, consentimento, log drain e baseline |
| SEO-008 | Vocabulário, fonte/data, precedência e junção dos CSVs oficiais de candidatura/julgamento do TSE por `SQ_CANDIDATO` a cada duas horas implementados | Implantar o job e conferir exceções/status de cada pessoa |
| SEO-009 | Identidade positiva (`personKey`/TSE), resolução canônica, aliases, colisão fail-closed e paginação SQL implementados | Atribuir `personKey` e consolidar relações legadas caso a caso |
| SEO-010 | Gate e relatório automáticos implementados | Revisar e aprovar individualmente; nenhum bulk approve |
| SEO-011 | Placeholders bloqueiam indexação; home e perfis usam datas materiais; changelog implementado | Reescrever/remover dados antigos de cada perfil |
| SEO-012–015 | ISR/SSR inicial, preservação em erro transitório, template, confiança e JSON-LD implementados | Validar Rich Results/HTML após deploy e aprovação |
| SEO-016 | Landings condicionadas ao gate implementadas | Só aparecem no sitemap quando tiverem perfis qualificados |
| SEO-017 | Mapa e hipóteses por candidato implementados | Validar/priorizar com dados do Search Console |
| SEO-018 | Infraestrutura e gate de comparações seletivas implementados | Seleção e síntese editorial de pares pendentes |
| SEO-019 | API/dados, gráfico/PNG incorporável, metodologia, changelog, temas e press kit com responsabilidade institucional implementados | Distribuir somente após QA de produção |
| SEO-020 | Runbook e tracker definidos | Contatos, menções e backlinks não executados |
| SEO-021 | Auditoria e rotina semanal definidas | Depende de dados reais do Search Console |

Evidências técnicas e pendências ficam em `docs/SEO_EXECUTION_CHANGELOG.md` e
`docs/runbooks/`. “Implementado” nesta tabela não significa “implantado” nem “indexado pelo
Google”.

## 1. Resultado esperado

Até o primeiro turno, o RAIO-X deve ter:

- uma única URL canônica para cada pessoa/candidatura;
- todas as páginas qualificadas rastreáveis, renderizadas no servidor e enviadas ao Google;
- páginas incompletas, buscas internas e combinações de filtros fora do índice;
- perfis com situação eleitoral, conteúdo exclusivo, fontes e atualização verificável;
- acompanhamento de cobertura, consultas, posições e cliques no Google Search Console;
- crescimento contínuo em buscas como `nome + propostas`, `nome + partido`, `nome + patrimônio`, `nome + como votou` e `nome A x nome B`.

Indexação não significa ranqueamento. As fases 0 e 1 tornam o site tecnicamente indexável e selecionam páginas com qualidade suficiente; as fases seguintes desenvolvem relevância e autoridade.

## 2. Baseline de 7 de agosto de 2026

| Indicador | Situação encontrada |
| --- | --- |
| Homepage | Encontrada em uma verificação pública do Google |
| Sitemap | 64 entradas, 61 URLs únicas e 3 duplicatas |
| Perfis testados | 58 URLs únicas, todas respondendo HTTP 200 |
| Canonical em perfis | 0 de 58 |
| JSON-LD em perfis | 0 de 58 |
| Descriptions | 46 genéricas com menos de 70 caracteres; 12 com mais de 160 |
| `robots.txt` | HTTP 404 |
| Host alternativo | `www` e domínio raiz respondem HTTP 200 |
| Renderização | Home e perfis com `force-dynamic` e resposta `no-store` |
| Conteúdo crítico | Consistência, notícias e transparência carregados no cliente |
| Imagens | Open Graph local aponta para `localhost`; parte das fotos usa HTTP |
| Mensuração | Sem integração identificada de Search Console, GA4 ou Web Vitals |

O Search Console será a fonte oficial da baseline de indexação. Operadores como `site:` são úteis para diagnóstico rápido, mas não mostram cobertura completa.

## 3. Metas e indicadores

### Metas obrigatórias

- 100% das URLs enviadas no sitemap respondendo HTTP 200.
- 100% das URLs enviadas com canonical autorreferente e absoluto.
- Zero duplicatas, páginas `noindex`, buscas internas ou parâmetros no sitemap.
- Zero referências de produção a `localhost` e zero imagens HTTP em páginas HTTPS.
- 100% dos perfis indexáveis aprovados pelo critério editorial da seção 6.
- 100% dos fatos eleitorais sensíveis com fonte e data de verificação.
- Situação de candidatura atualizada em até 4 horas após alteração oficial.

### Metas de resultado

- Pelo menos 90% das páginas qualificadas indexadas até o primeiro turno.
- Crescimento semanal de impressões não relacionadas apenas à marca RAIO-X.
- Cobertura de impressões para cada candidato prioritário.
- Crescimento da quantidade de consultas long tail com impressões e cliques.
- Core Web Vitals no percentil 75: LCP até 2,5 s, INP abaixo de 200 ms e CLS abaixo de 0,1.

### Métricas semanais

- URLs enviadas, descobertas, rastreadas e indexadas.
- Motivos de exclusão no relatório de indexação.
- Canonical declarado versus canonical escolhido pelo Google.
- Impressões, cliques, CTR e posição média por página e consulta.
- Consultas por cluster: nome, propostas, partido, patrimônio, votos, tema e comparação.
- Páginas com dados vencidos, fontes quebradas, 404 ou 5xx.
- Core Web Vitals por template.

## 4. Papéis sugeridos

| Papel | Responsabilidade |
| --- | --- |
| Engenharia web | Metadata, canonical, robots, sitemap, SSR/ISR, redirects e dados estruturados |
| Backend/dados | Identidade das pessoas, candidaturas, status oficial, timestamps e gatilhos de revalidação |
| Editorial | Conteúdo, fontes, neutralidade, revisão humana, correções e atualização |
| SEO/analytics | Search Console, mapa de consultas, monitoramento, snippets e priorização |
| Produto | Priorização, critérios de indexação e aprovação de escopo |

Uma pessoa pode acumular mais de um papel, mas cada tarefa precisa ter um responsável explícito.

## 5. Sequência de execução

### Fase 0 — Higiene técnica e controle de URLs

**Prazo:** 7 a 10 de agosto
**Resultado:** uma única versão rastreável de cada URL importante.

#### SEO-001 — Consolidar o hostname

- Definir `https://raio-x-2026.com.br` como origem canônica.
- Redirecionar HTTP e todo tráfego de `www` para essa origem com 301/308.
- Verificar que nenhum asset, sitemap ou link interno aponta para o host alternativo.

**Aceite:** todas as variantes terminam na URL canônica em um único redirecionamento.

#### SEO-002 — Configurar metadata global

Arquivos principais:

- `packages/web/app/layout.tsx`
- `packages/web/app/candidatos/[slug]/page.tsx`
- `packages/web/app/busca/page.tsx`
- `packages/web/app/comparar/page.tsx`

Tarefas:

- adicionar `metadataBase` de produção;
- gerar canonical absoluto para home, páginas editoriais e candidatos;
- garantir títulos e descriptions exclusivos;
- corrigir Open Graph e Twitter images absolutas;
- não usar a biografia completa como meta description.

**Aceite:** o HTML de produção não contém `localhost`; todas as páginas indexáveis têm canonical correto.

#### SEO-003 — Criar `robots.txt`

- Criar `packages/web/app/robots.ts`.
- Permitir o rastreamento do conteúdo público.
- Informar `https://raio-x-2026.com.br/sitemap.xml`.
- Não bloquear via robots páginas que precisam expor `noindex` ao Google.

**Aceite:** `/robots.txt` responde HTTP 200 e referencia o sitemap.

#### SEO-004 — Corrigir o sitemap

Arquivo principal: `packages/web/app/sitemap.ts`.

- deduplicar por URL canônica;
- incluir somente URLs indexáveis;
- excluir `/busca`, parâmetros, comparações vazias e perfis incompletos;
- usar `updatedAt` real como `lastModified`;
- não usar `new Date()` como atualização fictícia;
- remover `priority` e `changeFrequency`, pois não influenciam o Google;
- não ocultar falha da API retornando silenciosamente um sitemap incompleto;
- adicionar teste automatizado de unicidade, status e canonical.

**Aceite:** zero duplicatas e correspondência exata entre sitemap e conjunto de páginas qualificadas.

#### SEO-005 — Controlar parâmetros e páginas de ferramenta

| URL | Regra inicial |
| --- | --- |
| `/busca` e `?q=` | `noindex,follow`; fora do sitemap |
| Filtros arbitrários | `noindex,follow`; fora do sitemap |
| `/candidatos/{slug}?tema=` | canonical para `/candidatos/{slug}` |
| `/comparar` | pode permanecer indexável como página da ferramenta |
| `/comparar?a=&b=` | `noindex,follow` e canonical para `/comparar` até existir versão editorial |

**Aceite:** variações de parâmetros não competem com a URL principal nem entram no sitemap.

#### SEO-006 — Corrigir imagens

- converter ou espelhar fotos HTTP em origem HTTPS confiável;
- tornar as imagens de candidato absolutas em metadata;
- manter alt text com o nome da pessoa;
- registrar origem e licença/crédito da foto;
- produzir imagem Open Graph padrão e, depois, uma variação por candidato.

**Aceite:** nenhum mixed content e todas as imagens principais acessíveis ao Googlebot.

#### SEO-007 — Instalar a mensuração mínima

- verificar a propriedade de domínio no Google Search Console via DNS;
- enviar o sitemap;
- inspecionar home e cinco perfis prioritários;
- registrar a baseline dos relatórios de indexação e desempenho;
- configurar GA4 ou a solução analítica adotada pelo produto;
- coletar Web Vitals reais;
- monitorar frontend, API, robots e sitemap.

**Aceite:** propriedade verificada, sitemap processado e dashboard inicial registrado.

### Fase 1 — Qualidade e identidade dos candidatos

**Prazo:** 10 a 15 de agosto
**Resultado:** somente perfis substanciais e eleitoralmente corretos entram no índice.

#### SEO-008 — Atualizar a situação eleitoral

- sincronizar escolhas feitas nas convenções encerradas em 5 de agosto;
- distinguir `cotado`, `pré-candidato`, `escolhido em convenção`, `registro solicitado`, `deferido`, `indeferido`, `desistiu` e `substituído`;
- usar TSE/TRE como fonte prioritária após o protocolo do registro;
- exibir status, fonte e horário da verificação na página;
- atualizar o sitemap somente quando a alteração for material.

**Aceite:** nenhuma pessoa é apresentada como candidata oficial sem base documental.

#### SEO-009 — Eliminar conflito entre pessoa e candidatura

Problema atual: a mesma pessoa pode existir em registros de cargos diferentes e gerar o mesmo slug.

Solução imediata:

- escolher um registro canônico por pessoa;
- deduplicar listagens e sitemap;
- mapear slugs antigos para a página canônica;
- criar redirects permanentes quando a URL mudar.

Solução estrutural, sem bloquear o lançamento:

```text
Person
└── Candidacy
    ├── electionYear
    ├── office
    ├── jurisdiction
    ├── party
    ├── status
    └── tseId
```

**Aceite:** uma URL por pessoa e uma candidatura eleitoral ativa claramente identificada.

#### SEO-010 — Implementar quality gate de indexação

Um perfil só poderá ter `index,follow` e entrar no sitemap quando possuir:

- identidade e situação eleitoral verificadas;
- introdução exclusiva e revisada;
- pelo menos três módulos substantivos e apoiados por fontes;
- fontes primárias ou jornalísticas identificadas por afirmação;
- `updatedAt` e `reviewedAt` reais;
- ausência de placeholders e conteúdo quebrado;
- disclosure de IA quando aplicável;
- aprovação editorial.

Perfis que não cumprem o gate continuam públicos e navegáveis, mas ficam `noindex,follow`.

**Aceite:** relatório automático indicando por que cada perfil está indexável ou não.

#### SEO-011 — Remover conteúdo genérico ou desatualizado

- substituir títulos como “proposta 1” por conteúdo real;
- revisar bios e pesquisas antigas, incluindo instituto, período, amostra e link;
- remover do snippet números eleitorais vencidos ou sem contexto;
- trocar “Compilado agora” pela última atualização material;
- exibir um changelog para alterações importantes.

**Aceite:** zero placeholder nos perfis indexáveis e data de atualização auditável.

### Fase 2 — Template de perfil orientado à busca

**Prazo:** 16 a 23 de agosto
**Resultado:** cada perfil responde às principais intenções sobre o candidato.

#### SEO-012 — Renderizar conteúdo crítico no servidor

- remover `force-dynamic` das páginas elegíveis;
- usar ISR com revalidação por tempo como fallback;
- acionar `revalidatePath` ou `revalidateTag` após sincronizações relevantes;
- renderizar no servidor o estado inicial de propostas, votos, patrimônio, financiamento, notícias e consistência;
- manter JavaScript somente para interação e atualização progressiva;
- preservar a última versão válida quando a API estiver indisponível.

**Aceite:** o HTML inicial contém o conteúdo principal e continua disponível durante falha transitória da API.

#### SEO-013 — Aplicar o template editorial de candidato

Ordem recomendada:

1. nome, cargo, partido, número, vice e situação oficial;
2. resumo objetivo e atualizado;
3. propostas por tema;
4. trajetória e mandatos;
5. votações e projetos relevantes;
6. patrimônio e financiamento;
7. declarações recentes;
8. fontes, metodologia, autoria, revisão e histórico de mudanças.

Exemplo de título:

```text
{Nome}: propostas, partido e histórico | Eleições 2026
```

Exemplo de description:

```text
Veja quem é {nome}, sua situação nas Eleições 2026, partido, propostas,
histórico de votações, patrimônio e fontes oficiais.
```

**Aceite:** título, description, H1 e introdução coerentes e exclusivos em todos os perfis indexáveis.

#### SEO-014 — Adicionar confiança editorial

Criar:

- `/sobre`;
- `/metodologia`;
- `/fontes`;
- `/politica-editorial`;
- `/correcoes`;
- página ou identificação dos autores/revisores;
- canal público para contestação e correção.

Explicar:

- quais dados são oficiais;
- como os dados são coletados e atualizados;
- onde IA é usada;
- quais verificações humanas ocorrem;
- como scores e contradições são calculados;
- como o projeto garante neutralidade entre candidatos.

**Aceite:** toda página de candidato aponta para metodologia, fontes e correções.

#### SEO-015 — Adicionar dados estruturados seguros

- `Organization` na homepage ou página sobre;
- `BreadcrumbList` nas páginas internas;
- `WebPage` com `about`/`mainEntity` do tipo `Person` para descrever a pessoa;
- `dateModified` somente com atualização editorial real;
- validar JSON-LD e manter os valores iguais ao conteúdo visível.

Não usar `ProfilePage` como promessa de rich result: esse recurso do Google é direcionado a perfis afiliados à própria plataforma, como autores ou usuários.

**Aceite:** zero erro de dados estruturados e nenhuma informação invisível ou divergente.

### Fase 3 — Arquitetura de conteúdo e links internos

**Prazo:** 24 de agosto a 6 de setembro
**Resultado:** cobertura das intenções de busca sem gerar páginas programáticas frágeis.

#### SEO-016 — Criar landing pages editoriais

Prioridade:

- `/eleicoes-2026`;
- `/candidatos-presidente`;
- `/governador/{uf}`;
- `/senador/{uf}` quando houver candidaturas qualificadas;
- `/temas/economia`, `/temas/saude`, `/temas/educacao`, `/temas/seguranca` e `/temas/meio-ambiente`.

Cada landing page deve ter explicação editorial, candidatos qualificados, data de atualização e links contextuais. Não indexar páginas vazias ou listas sem valor adicional.

**Aceite:** todas as páginas de candidato estão a até três cliques da homepage por links HTML rastreáveis.

#### SEO-017 — Mapear intenções por candidato

Clusters prioritários:

- `{nome}`;
- `{nome} candidato 2026`;
- `{nome} propostas 2026`;
- `{nome} plano de governo`;
- `{nome} partido`;
- `{nome} vice`;
- `{nome} patrimônio declarado`;
- `{nome} como votou`;
- `{nome} posição sobre {tema}`;
- `{nome A} x {nome B}`.

Usar Search Console e Google Trends para priorizar, sem repetir mecanicamente palavras-chave no conteúdo.

**Aceite:** cada página prioritária possui consulta principal, consultas secundárias e intenção claramente definidas.

#### SEO-018 — Publicar comparações seletivas

- manter o comparador interativo como ferramenta;
- criar URL estável e indexável somente para pares com demanda e dados completos;
- oferecer síntese editorial, diferenças por tema, fontes e atualização;
- evitar indexar todas as combinações possíveis.

**Aceite:** nenhuma comparação indexável é apenas uma troca de nomes em template vazio.

### Fase 4 — Autoridade, atualização e otimização

**Prazo:** 7 de setembro a 4 de outubro
**Resultado:** aumentar relevância e conquistar links e citações legítimas.

#### SEO-019 — Criar ativos citáveis

- base aberta/documentada de propostas e votações;
- gráficos incorporáveis com crédito;
- metodologia versionada;
- changelog eleitoral;
- páginas de dados por tema e UF;
- press kit com descrição, responsáveis e contato.

**Aceite:** cada ativo oferece uma razão clara para jornalistas e organizações citarem a fonte original.

#### SEO-020 — Distribuição e relações institucionais

- apresentar o projeto a jornalistas de dados e política;
- contatar universidades, observatórios, civic techs e organizações de transparência;
- divulgar atualizações relevantes, sem comprar links;
- manter repositório e documentação apontando para o domínio correto.

**Aceite:** lista de contatos, ações, menções e backlinks acompanhada semanalmente.

#### SEO-021 — Otimização contínua via Search Console

- priorizar consultas com muitas impressões e CTR abaixo do esperado;
- reescrever títulos e introduções com base em intenção real;
- fortalecer links internos para páginas descobertas, mas não indexadas;
- corrigir grupos de erro, não URLs isoladas;
- inspecionar manualmente apenas amostras representativas após mudanças de template.

**Aceite:** relatório semanal com decisões e impacto observado.

## 6. Quality gate detalhado

| Verificação | Obrigatória para indexar? |
| --- | --- |
| HTTP 200 | Sim |
| Canonical autorreferente | Sim |
| Situação eleitoral com fonte | Sim |
| H1 e título exclusivos | Sim |
| Introdução exclusiva | Sim |
| Três módulos substantivos com fontes | Sim |
| Data real de revisão | Sim |
| Placeholder ou dado quebrado | Não pode existir |
| Imagem HTTPS | Sim, quando houver imagem |
| Conteúdo crítico no HTML inicial | Sim |
| Aprovação editorial | Sim |
| Dados estruturados | Recomendado, não deve bloquear lançamento |

Esse gate é um critério interno de qualidade, não uma alegação de que o Google exige quantidade específica de texto ou módulos.

## 7. Dependências e ordem crítica

```text
Hostname + canonical
        ↓
Identidade e status eleitoral
        ↓
Quality gate
        ↓
Sitemap limpo + Search Console
        ↓
SSR/ISR + template editorial
        ↓
Landing pages e comparações
        ↓
Autoridade e otimização contínua
```

Não escalar páginas temáticas ou comparações antes de resolver identidade, canonical e qualidade. Mais URLs incompletas tendem a aumentar exclusões, não tráfego.

## 8. Cadência operacional até a eleição

### Diária

- verificar status de candidaturas e substituições;
- monitorar disponibilidade do frontend, API, robots e sitemap;
- revisar páginas alteradas pelo pipeline;
- revalidar somente URLs com mudança material.

### Semanal

- exportar os relatórios de indexação e desempenho;
- revisar exclusões, queries, CTR e canonical escolhido;
- auditar links e fontes quebradas;
- revisar imparcialidade e consistência editorial entre candidatos;
- publicar changelog do produto/dados.

### Após mudança relevante

- atualizar a fonte e o timestamp;
- revalidar a página e o sitemap;
- testar HTML, canonical e status;
- solicitar nova indexação somente para URLs prioritárias quando necessário.

## 9. Definition of Done global

Uma entrega de SEO só está concluída quando:

- funciona em produção, não apenas localmente;
- foi testada com e sem parâmetros;
- não cria uma segunda URL para o mesmo conteúdo;
- preserva HTTP status, canonical e robots corretos;
- tem teste automatizado proporcional ao risco;
- foi validada em HTML renderizado;
- possui responsável e métrica de acompanhamento;
- está documentada no changelog do projeto.

## 10. Referências oficiais

- [Calendário Eleitoral 2026 — TSE](https://www.tse.jus.br/comunicacao/noticias/2026/Marco/eleicoes-2026-confira-as-principais-datas-do-calendario-eleitoral)
- [Criar e enviar sitemap — Google Search Central](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=pt-br)
- [Canonicalização — Google Search Central](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=pt-br)
- [Conteúdo útil e confiável — Google Search Central](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=pt-br)
- [Core Web Vitals — Google Search Central](https://developers.google.com/search/docs/appearance/core-web-vitals?hl=pt-br)
- [URL Inspection — Google Search Console](https://support.google.com/webmasters/answer/9012289?hl=pt-BR)
- [Metadata no Next.js 14](https://nextjs.org/docs/14/app/api-reference/functions/generate-metadata)
- [Cache e revalidação no Next.js 14](https://nextjs.org/docs/14/app/building-your-application/data-fetching/fetching-caching-and-revalidating)
