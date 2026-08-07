# Runbook de monitoramento SEO

## Diário

- executar health check do frontend, API, `robots.txt` e `sitemap.xml`;
- alertar em qualquer 5xx, sitemap vazio ou queda anormal de perfis qualificados;
- revisar `verificacao_de_status_desatualizada` no quality report;
- conferir decisões, substituições e desistências em fontes oficiais;
- validar fontes quebradas dos perfis modificados;
- acompanhar falhas da revalidação autenticada.

## Semanal

```powershell
pnpm --filter @raiox/web seo:audit
pnpm --filter @raiox/web seo:quality-report
```

- exportar Search Console: páginas, consultas, países, dispositivos e aparência;
- agrupar exclusões por causa/template, não corrigir URLs isoladas sem diagnóstico;
- revisar queries com muitas impressões e CTR abaixo do grupo comparável;
- conferir canonical escolhido pelo Google em amostra de cada template;
- auditar status 200, fontes, imagens, JSON-LD e links internos;
- publicar decisões e impacto no changelog.

## Alertas sugeridos

| Sinal | Condição | Ação inicial |
| --- | --- | --- |
| Frontend/API | 2 falhas em 5 min | verificar deploy e dependências |
| Robots/sitemap | qualquer status diferente de 200 | tratar como incidente SEO |
| Sitemap | duplicata, query ou URL noindex | bloquear lançamento |
| Quality report | queda maior que 10% em perfis indexáveis | revisar data material e fonte |
| Status eleitoral | verificação acima de 48 h | priorizar conferência editorial |
| Core Web Vitals | p75 fora do limite por 7 dias | abrir investigação por template |
| Search Console | queda de cliques acima de 30% semana/semana | separar sazonalidade, cobertura e ranking |

## Relatório semanal

Registrar período, responsável, deploys, URLs enviadas/indexadas, impressões, cliques,
CTR, posição, principais consultas, exclusões, CWV, decisões tomadas e próximo teste.
Não atribuir causalidade a uma mudança sem janela e comparação adequadas.
