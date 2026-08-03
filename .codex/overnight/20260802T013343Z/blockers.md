# Blockers

## Hard blockers
- Enriquecimento de sites não pode ficar integralmente verde enquanto `https://www.aldorebelo.com.br` não responder ao runner ou houver uma URL oficial substituta. Duas execuções e quatro tentativas de navegação esgotaram; localmente o host entrega apenas uma página estacionada de venda, sem conteúdo político. O job mantém exit não zero, conforme o contrato de falha de fonte.

## Incidentes externos resolvidos
- A indisponibilidade HTTP 503 do Senado observada em 2026-08-02 cessou; lista atual e processos responderam HTTP 200, e dois reruns reais sincronizaram 81 parlamentares sem falha.

## Soft limitations
- Dados oficiais 2026 e documentos podem mudar/estar incompletos no TSE; o código será validado com fixtures e a disponibilidade oficial será revalidada sem mutação remota.
- O ambiente local usa Node 22.12.0 enquanto CI declara Node 20; resultados serão registrados e a CI continua validando Node 20.
- O painel de revisão, OCR e publicação de deputados estão deliberadamente fora do escopo.
- `pnpm lint` não tinha baseline funcional: API não declara/configura ESLint e Next abre setup interativo. A falha foi registrada; typecheck e builds estão verdes.
- Execuções canceladas pelo timeout/GitHub deixaram `DataSyncRun` antigos em `RUNNING`; o lease implementado fecha cada uma como `FAILED` no primeiro início da mesma fonte/tipo após seis horas, sem SQL manual em produção.
- `aldorebelo.com.br` está estacionado para venda, embora o Chromium receba HTTP 200; o job seguirá como no-op para esse conteúdo e qualquer proposta IA continua DRAFT/oculta. Corrigir a URL requer uma nova fonte oficial verificável.
