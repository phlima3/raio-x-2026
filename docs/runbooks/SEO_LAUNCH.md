# Runbook de lançamento SEO

**Dono sugerido:** engenharia web
**Aprovação:** produto + editorial
**Regra:** uma etapa externa só muda para concluída depois de haver evidência registrada.

## 1. Ordem de implantação

1. Confirmar que o PostgreSQL possui snapshot/PITR restaurável imediatamente anterior ao
   deploy; se o provedor não oferecer isso, criar um backup verificável.
2. Implantar a API com a migration `20260807090000_add_seo_editorial_fields`. Ela apaga
   somente `ConsistencyScore`, um dado derivado, para impedir que scores calculados com a
   política pública anterior continuem expostos. O SQL usa `BEGIN`/`COMMIT`: qualquer erro
   antes do commit desfaz a migration inteira. Planeje a recomputação dos scores.
3. Confirmar `GET /health` e `GET /api/candidates/seo-report` com HTTP 200.
4. Implantar o scraper com `REVALIDATION_SECRET`, `WEB_REVALIDATION_URL` e acesso aos ZIPs oficiais do TSE.
5. Implantar o frontend com a mesma `REVALIDATION_SECRET` e as URLs corretas da API.
6. Executar `pnpm --filter @raiox/web seo:audit` contra produção.
7. Somente depois enviar o sitemap ao Search Console.

Não implantar o frontend antes da API: o build e a geração do sitemap dependem do quality
report e devem falhar quando ele estiver indisponível, evitando publicar um conjunto parcial.

## 2. Variáveis obrigatórias

| Serviço | Variável | Exemplo sem segredo |
| --- | --- | --- |
| Web | `API_URL_INTERNAL` | `https://api.raio-x-2026.com.br` |
| Web | `NEXT_PUBLIC_API_URL` | `https://api.raio-x-2026.com.br` |
| Web/scraper | `REVALIDATION_SECRET` | valor aleatório longo e idêntico |
| Scraper | `WEB_REVALIDATION_URL` | `https://raio-x-2026.com.br/api/revalidate` |
| API/scraper | `REDIS_URL` | instância compartilhada para invalidação imediata |
| Scraper | `TSE_CANDIDATES_ZIP_URL` | opcional; por padrão usa o ZIP 2026 do CDN do TSE |
| Scraper | `TSE_CANDIDATES_COMPLEMENT_ZIP_URL` | opcional; por padrão usa o ZIP complementar 2026 do CDN do TSE |
| API | `FRONTEND_URL` | `https://raio-x-2026.com.br` |

O segredo não deve aparecer em logs, commits ou screenshots.

## 3. Hostname e TLS

Validar com redirect manual ou `curl -I`:

| Entrada | Resultado obrigatório |
| --- | --- |
| `http://raio-x-2026.com.br/x` | 301/308 direto para `https://raio-x-2026.com.br/x` |
| `https://www.raio-x-2026.com.br/x` | 301/308 direto para `https://raio-x-2026.com.br/x` |
| `http://www.raio-x-2026.com.br/x` | no máximo um salto controlado pela borda ou aplicação |
| URL canônica HTTPS | HTTP 200, sem novo redirect |

Se o provedor interceptar HTTP antes do Next.js, configure o redirect equivalente na
borda e preserve caminho e query string. Anexe os cabeçalhos de cada teste ao changelog.

## 4. Smoke test pós-deploy

Depois de `pnpm --filter @raiox/web build`, validar o artefato local sem depender da
API externa:

```powershell
pnpm --filter @raiox/web seo:smoke
```

O comando sobe o build em uma porta local, usa uma API sintética e encerra os dois
processos ao concluir. Para validar um backend implantado, informar
`SEO_SMOKE_API_ORIGIN`; `SEO_SMOKE_PORT` e `SEO_SMOKE_API_PORT` permitem evitar
conflitos de porta.

No CI que também construir o sitemap com a fixture sintética, use
`SEO_SMOKE_REQUIRE_SYNTHETIC_GATE=true` para exigir a presença exata do perfil da
fixture no sitemap. Em produção, `seo:audit` sempre compara o sitemap ao quality report
real e falha quando os conjuntos divergem.

```powershell
$env:SEO_SMOKE_API_ORIGIN='https://api.raio-x-2026.com.br'
pnpm --filter @raiox/web seo:smoke
```

Depois do deploy público, executar a auditoria de URLs reais:

```powershell
$env:SEO_SITE_ORIGIN='https://raio-x-2026.com.br'
$env:SEO_API_ORIGIN='https://api.raio-x-2026.com.br'
pnpm --filter @raiox/web seo:audit
pnpm --filter @raiox/web seo:quality-report
```

Além do comando, conferir manualmente:

- `/robots.txt` retorna 200 e aponta para o sitemap canônico;
- `/sitemap.xml` não contém busca, query string, duplicata ou perfil reprovado;
- cinco perfis exibem canonical, status, fonte, autoria/revisão e JSON-LD coerentes;
- `/busca?q=teste` e `/comparar?a=x&b=y` exibem `noindex,follow`;
- imagem OG global e uma imagem OG de candidato retornam `image/png` 1200×630;
- `/graficos/perfis-por-partido` e seu PNG incorporável respondem 200, com fonte e ressalva;
- HTML sem JavaScript contém propostas, declarações, consistência e transparência já disponíveis;
- erro transitório da API preserva a última versão ISR servida.

Confirmar também nos logs que `tse-status` conclui ao iniciar e a cada duas horas. O job
deve unir candidatura e complemento por `SQ_CANDIDATO`, usar
`DS_SITUACAO_JULGAMENTO`/`DS_DETALHE_SITUACAO_CAND` para a decisão e manter rótulos
genéricos (`#NE`, `APTO`, `CADASTRADO`, `AGUARDANDO JULGAMENTO`) como
`registro_solicitado`; somente decisões textualmente explícitas podem virar
deferido/indeferido/desistiu/substituído. Cancelamento, pedido não conhecido, cassação,
falecimento e rótulos ainda desconhecidos precisam permanecer fora do índice. Em chapas
substituídas, confirme que `SQ_SUBSTITUIDO` levou à vice ativa — nunca à última linha física
do CSV. `NM_URNA_CANDIDATO` nunca deve ser gravado como nome social; esse campo vem apenas
de `NM_SOCIAL_CANDIDATO`.

`INAPTO` não é sinônimo de `APTO`: ele deve cair em estado não mapeado/não qualificante
até que o detalhe judicial explicite cancelamento, indeferimento, renúncia ou substituição.

## 5. Rollback

- A transação protege contra aplicação parcial. Depois do `COMMIT`, use uma migration
  corretiva para mudanças de schema; snapshot/PITR fica reservado para erro lógico ou
  perda de dados que não possa ser corrigida com segurança.
- O rollback do frontend não exige remover a migration; os novos campos são opcionais.
- Nunca reverta a migration apagando colunas com dados editoriais. Restaure a versão do
  app e mantenha o schema aditivo até uma janela de manutenção aprovada.
- Se o quality report falhar, o frontend deve permanecer fail-closed. Não substitua o
  relatório por `index: true` global para contornar a falha.

## 6. Evidência a registrar

- URL/ID dos deploys de API, web e scraper;
- hash do commit;
- resultado integral do `seo:audit`;
- contagem do quality report;
- cabeçalhos dos três testes de hostname;
- screenshot ou exportação do sitemap processado no Search Console;
- responsável e horário da aprovação.
