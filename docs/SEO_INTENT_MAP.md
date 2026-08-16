# Mapa de intenção de busca — RAIO-X 2026

**Status:** hipóteses para validação no Search Console
**Regra:** o mapa orienta cobertura; não autoriza repetição mecânica de termos.

| Template | Intenção principal | Intenções secundárias | Página |
| --- | --- | --- | --- |
| Guia | entender datas, cargos e situação eleitoral | calendário, registro, primeiro e segundo turno | `/eleicoes-2026` |
| Presidência | conhecer candidatos a presidente | nomes, partidos, situação e propostas | `/candidatos-presidente` |
| Governo/UF | conhecer candidatos ao governo estadual | propostas e comparação no estado | `/governador/{uf}` |
| Senado/UF | conhecer candidatos ao Senado | propostas, trajetória e situação | `/senador/{uf}` |
| Tema | comparar posições documentadas | economia, saúde, educação, segurança e ambiente | `/temas/{tema}` |
| Perfil | pesquisar uma pessoa nas Eleições 2026 | partido, vice, propostas, plano, patrimônio, votos e tema | `/candidatos/{slug}` |
| Comparação | entender diferenças entre dois nomes | tema, propostas e fontes | `/comparacoes/{par}` |

O endpoint `/api/candidates/seo-report` gera, para cada pessoa, uma consulta principal
`{nome} eleições 2026` e hipóteses secundárias. Todas chegam com o marcador
`hipotese_aguardando_search_console`.

## Validação semanal

1. Exportar consultas e páginas do Search Console para 7 e 28 dias.
2. Relacionar variações de nome à URL canônica; não criar página por grafia.
3. Identificar intenção dominante por impressões, não apenas volume externo.
4. Marcar consultas com posição 4–15 e conteúdo compatível como oportunidades.
5. Atualizar título ou introdução somente se a página responder à consulta.
6. Criar comparação editorial apenas quando o par tiver demanda repetida e dados completos.
7. Registrar mudança, hipótese e resultado no relatório semanal.

## Critério de comparação indexável

- par determinístico e único;
- ambos os perfis aprovados pelo gate;
- introdução editorial própria;
- ao menos três diferenças substantivas;
- duas ou mais fontes HTTPS por diferença;
- autoria, revisão e data material;
- entrada explícita em `EDITORIAL_COMPARISONS`.

Sem esses critérios, a combinação continua apenas em `/comparar` com `noindex,follow`.
