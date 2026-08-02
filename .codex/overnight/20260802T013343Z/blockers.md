# Blockers

## Hard blockers
- Nenhum no momento.

## Soft limitations
- Dados oficiais 2026 e documentos podem mudar/estar incompletos no TSE; o código será validado com fixtures e a disponibilidade oficial será revalidada sem mutação remota.
- O ambiente local usa Node 22.12.0 enquanto CI declara Node 20; resultados serão registrados e a CI continua validando Node 20.
- O painel de revisão, OCR e publicação de deputados estão deliberadamente fora do escopo.
- `pnpm lint` não tinha baseline funcional: API não declara/configura ESLint e Next abre setup interativo. A falha foi registrada; typecheck e builds estão verdes.
