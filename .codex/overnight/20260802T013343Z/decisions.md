# Decisions

## 2026-08-02 — Worktree e checkpoints
- Permanecer na branch dedicada `phlima3/official-data-pipeline-2026`; não criar outro worktree dentro deste worktree.
- Fazer commits locais pequenos após fases estáveis; nunca push/merge/deploy.

## 2026-08-02 — Test seams
- Tratar ingestão por fonte como módulo profundo: interface pequena de execução, adapters remotos injetáveis e persistência injetável.
- Mockar apenas HTTP/arquivos remotos; usar PostgreSQL 16 real para integração quando disponível.
- Escrever fatias verticais RED→GREEN por comportamento observável, não testes de funções privadas.

## 2026-08-02 — Compatibilidade e migração
- `Candidate` continua sendo a fachada de candidatura legada e mantém IDs/slugs; novos modelos são aditivos.
- O caminho `legacy` será o padrão inicial para rollback seguro; `normalized` é ativado explicitamente.
- Campos legados permanecem mesmo quando relações normalizadas passam a ser preenchidas.

## 2026-08-02 — Evidência CI/Prisma
- Os 12 runs agendados listados em 2026-07-22..2026-08-01 falharam.
- O run 30687041481 gerou Prisma em `node_modules/.pnpm/@prisma+client...` e imediatamente falhou porque o workflow buscou `packages/api/node_modules`.
- Correção escolhida: uma instalação de workspace e geração única consumida naturalmente por ambos os pacotes; eliminar cópia de artefato gerado.

## 2026-08-02 — Política official-first
- Parlamentares atuais serão `Person` + `Mandate`; nunca candidaturas implícitas de 2026.
- Campos determinísticos oficiais podem publicar apenas cargos habilitados; dados extraídos por IA começam `DRAFT` e ocultos.
- Ausência/incompletude de snapshot não autoriza delete ou unpublish editorial.

## 2026-08-02 — Ordem de implementação ajustada
- Após instalar Vitest/Supertest e concluir o parser TSE básico, antecipar a expansão aditiva do schema antes de finalizar jobs/workflows.
- Motivo: `DataSyncRun`, `Person` e `Mandate` são dependências reais dos comportamentos de falha, ingestão e integração; manter a ordem antiga exigiria adapters descartáveis.

## 2026-08-02 — Snapshot oficial TSE revalidado
- O catálogo CKAN oficial expõe sete recursos de 2026: candidaturas, complementares, bens, coligações, vagas, cassações e redes sociais; não há programa de governo disponível neste momento.
- O `consulta_cand_2026_BRASIL.csv` contém 3.465 linhas, zero presidente/vice-presidente e todos os cargos legislativos observados; `consulta_cand_2026_BR.csv` está vazio.
- A seleção de arquivo prioriza explicitamente `BRASIL.csv`; um teste foi adicionado após o snapshot real revelar a colisão com o arquivo vazio `BR.csv`.
- CPF e título eleitoral são descartados antes de formar dados brutos/revisões; não são persistidos.

## 2026-08-02 — Publicação e reconciliação
- Match automático exige igualdade normalizada de nome, cargo, partido e UF; zero ou múltiplos matches nunca alteram uma candidatura editorial por aproximação.
- Snapshot vazio/incompleto somente cria/atualiza o que está presente; não remove nem despublica registros editoriais.
- A API pública aplica simultaneamente `isPublished` e allowlist presidente/governador/senador, inclusive no modo `legacy`; o modo seleciona a origem da identidade, não relaxa visibilidade.

## 2026-08-02 — Banco local de integração
- O `docker-compose.yml` publica PostgreSQL 16 em `localhost:5433`; documentação e CI local devem usar essa porta, enquanto o serviço CI interno usa 5432.

## 2026-08-02 — Contratos legislativos do Senado
- Usar os endpoints atuais `/processo?codigoParlamentarAutor=...` e `/votacao?codigoParlamentar=...`; os endpoints antigos de autoria/votações estão marcados deprecated no OpenAPI oficial.
- Datas dos filtros modernos usam ISO `YYYY-MM-DD`; entradas legadas `YYYYMMDD` são normalizadas para preservar compatibilidade de chamadas existentes.
- A resposta oficial atual é um array completo; o collector também segue `links[rel=next]` e cabeçalho HTTP `Link` para não truncar instalações paginadas.
- Legislatura e datas vêm de `/senador/{codigo}/mandatos`; nenhum parlamentar atual é reconciliado a Candidate por nome.

## 2026-08-02 — Datasets suplementares do TSE
- Persistir linhas sanitizadas em `OfficialDatasetRecord` com hash determinístico, vínculo ao snapshot `SourceDocument` e candidato por `SQ_CANDIDATO` quando disponível.
- O modelo genérico preserva colunas novas sem exigir migration por layout, enquanto materializadores mantêm os contratos atuais para status, bens, coligação e site/rede oficial.
- CPF e título eleitoral são removidos antes tanto do payload quanto de qualquer texto persistido; os ZIPs binários não são armazenados no banco.
- Snapshots suplementares nunca removem registros ausentes; cassação presente pode ocultar deterministicamente, mas snapshot vazio não altera candidaturas.

## 2026-08-02 — Documentos e IA
- Recurso PDF direto e ZIP com PDFs usam SHA-256 por documento; hash já processado atualiza apenas proveniência da execução e não repete extração.
- PDF sem camada textual é `NEEDS_OCR`, não erro. Corrupção/erro de parser é `FAILED` e falha a execução da fonte.
- Ausência de recurso de programa no catálogo é `DataSyncRun=NOOP` bem-sucedido.
- Toda saída não revisada de IA (`candidate_site`, `news`, `gemini_research`) é `DRAFT`, `AI_EXTRACTION` e `isPublished=false`; editorial existente não é alterado.

## 2026-08-02 — Reconciliação independente da ordem das fontes
- Como Legislativo roda 03:00 UTC e TSE 07:00 UTC, o vínculo exato precisa funcionar nos dois sentidos.
- Um único Person/Candidate com nome normalizado, cargo, partido e UF é reutilizado; múltiplos IDs distintos criam Person separada + `IDENTITY_AMBIGUITY` e nunca auto-merge.
- Identificadores oficiais Câmara/Senado continuam tendo precedência sobre a combinação de campos.

## 2026-08-02 — Preservação na migration inicial
- A expansão marca como públicas todas as candidaturas legadas nos três cargos habilitados, inclusive senador editorial sem `tseId`.
- Somente uma sincronização oficial presente pode atualizar deterministicamente o status do próprio registro; aplicar a migration ou receber snapshot vazio não despublica pré-candidato.

## 2026-08-02 — Disposição dos achados de review
- Votos e projetos legislativos legados são migrados quando o mandato oficial é resolvido; candidateId/Proposal legados permanecem para rollback.
- Proposta de IA com `reviewedAt` nunca é rebaixada nem tem conteúdo aprovado sobrescrito por reprocessamento.
- A fachada de detalhe remove chaves normalizadas internas e mantém apenas campos legados mais os quatro opcionais públicos.
- O enum cobre também `VICE_PREFEITO`; ingestão armazena 13 cargos, enquanto a allowlist pública continua com três.
- Documentos seguem o catálogo CKAN oficial, cuja fonte declarada é CAND/Candex/DivulgaCand; não inventar endpoint/ID enquanto 2026 não publicar PDFs.

## 2026-08-02 — Detecção de envelopes documentais
- Assinaturas binárias têm precedência sobre o campo `format` do CKAN: `%PDF-` é PDF direto e `PK` é ZIP.
- Motivo: recurso oficial histórico pode declarar `Formato PDF` e entregar `application/zip`; usar somente o rótulo enviaria o arquivo compactado ao pdfjs.
- O rótulo continua sendo fallback para respostas sem assinatura reconhecível, preservando compatibilidade com fixtures e endpoints intermediários.

## 2026-08-03 — Sincronização legislativa diária incremental
- O caminho diário usa uma janela móvel inclusiva de sete dias; datas explícitas continuam disponíveis para backfill histórico.
- A Câmara carrega sessões/votos compartilhados uma única vez por execução e distribui os votos por parlamentar; projetos ficam limitados ao ano corrente.
- Um voto legado que colidiria com um registro oficial já normalizado não é apagado nem forçado ao mandato: ambos permanecem acessíveis pelos respectivos read models durante expand-and-migrate.
- No Senado, matérias e votos são persistidos sequencialmente por senador para respeitar o pool de três conexões, mantendo o lote externo de senadores limitado pela concorrência configurada.

## 2026-08-03 — Throughput e lease das sincronizações oficiais
- O TSE canônico e os seis datasets complementares mantêm ordem causal, mas usam jobs GitHub distintos e timeouts independentes; complemento só inicia após sucesso do canônico.
- Linhas imutáveis do arquivo oficial usam hash do payload e `createMany(skipDuplicates)`; reprocessamento atualiza proveniência por lote e repara vínculo ausente com Candidate sem duplicar registros.
- Materializações preservam a semântica anterior (último status/cassação, primeira URL válida) com grupos determinísticos e transações curtas, evitando milhares de round-trips unitários pelo túnel.
- `DataSyncRun=RUNNING` da mesma fonte/tipo há mais de seis horas é lease abandonado: o próximo run o fecha como `FAILED`; execução recente permanece intocada.

## 2026-08-03 — Navegação de enriquecimento em sites
- `page.goto` considera a resposta comprometida (`waitUntil=commit`) e dá ao DOM uma janela adicional limitada; páginas que mantêm recursos de terceiros pendentes não travam mais por 30 segundos apesar de já terem HTML útil.
- Falha de transporte/HTTP 5xx recebe uma repetição curta; HTTP 4xx e a segunda falha continuam propagando, preservando `DataSyncRun=FAILED` e exit não zero.
- Timeout apenas de `DOMContentLoaded` permite avaliar o HTML já comprometido; falha posterior de avaliação/LLM/persistência continua falhando o job.
