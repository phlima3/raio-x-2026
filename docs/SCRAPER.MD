# Scraper e sincronizadores

O runbook canônico é [OFFICIAL_DATA_PIPELINE.md](OFFICIAL_DATA_PIPELINE.md).

## Fontes

- `sources/tse.ts`: candidatura canônica TSE;
- `sources/tseSupplemental.ts`: complementares, bens, coligações, vagas,
  cassações e redes sociais;
- `sources/tseDocuments.ts`: programas/documentos oficiais;
- `sources/camara.ts` e `sources/senado.ts`: pessoas, mandatos, projetos e votos;
- `sources/candidateSites.ts` e jobs de notícias: enriquecimento não canônico.

Câmara/Senado nunca criam `Candidate`. Notícias/sites nunca criam candidatura e
propostas extraídas por IA ficam ocultas até revisão.

## Execução

~~~powershell
pnpm --filter @raiox/scraper run sync:tse -- --dry-run
pnpm --filter @raiox/scraper run sync:tse:supplemental -- --dry-run
pnpm --filter @raiox/scraper run sync:documents -- --dry-run
pnpm --filter @raiox/scraper run sync:camara
pnpm --filter @raiox/scraper run sync:senado
pnpm --filter @raiox/scraper run process:proposals
pnpm --filter @raiox/scraper run news:weekly
pnpm --filter @raiox/scraper run review:report
~~~

As agendas UTC, preparação PostgreSQL 16, monitoramento, rollout e rollback
estão descritos no runbook canônico.

## LLM

`LLM_PROVIDER` aceita `groq`, `gemini` ou `ollama`. Chaves e endpoints ficam em
variáveis de ambiente. Saídas de IA não são publicadas automaticamente.
