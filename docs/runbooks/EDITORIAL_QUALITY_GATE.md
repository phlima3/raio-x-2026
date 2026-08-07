# Runbook do quality gate editorial

**Dono sugerido:** editor responsável
**Revisor:** pessoa diferente da autoria sempre que possível
**Princípio:** migração, scraper e IA nunca aprovam um perfil automaticamente.

## 1. Estados eleitorais permitidos

| Valor no banco | Exibição | Evidência mínima |
| --- | --- | --- |
| `cotado` | Nome cotado | cobertura identificada; não qualifica para indexação |
| `pre_candidato` | Pré-candidatura anunciada | anúncio atribuível |
| `escolhido_convencao` | Escolhido em convenção | ata/comunicado ou cobertura inequívoca |
| `registro_solicitado` | Registro solicitado à Justiça Eleitoral | registro consultável no TSE/TRE |
| `deferido` | Registro deferido | decisão/consulta oficial |
| `indeferido` | Registro indeferido | decisão e contexto recursal |
| `desistiu` | Desistiu da disputa | comunicado ou registro atualizado |
| `substituido` | Candidatura substituída | registro ou decisão que identifica a substituição |
| `cancelado` | Registro cancelado | resultado oficial; permanece fora do índice até decisão editorial |
| `pedido_nao_conhecido` | Pedido não conhecido | resultado oficial; permanece fora do índice |
| `cassado` | Registro cassado | resultado oficial e contexto recursal; permanece fora do índice |
| `falecido` | Falecimento registrado | dado oficial conferido; permanece fora do índice |
| `status_nao_mapeado` | Situação oficial em revisão | rótulo novo do TSE; revisão de engenharia/editorial obrigatória |

O valor legado `confirmado` exige revisão e não passa no gate.

## 2. Checklist por perfil

- [ ] Nome, partido, UF, cargo, ano e slug conferidos.
- [ ] Identidade positiva: `tseId` oficial ou `personKey` curado; nome/UF isolados não bastam.
- [ ] Situação descrita sem antecipar decisão do TSE.
- [ ] `candidacyStatusSourceUrl` em HTTPS e `candidacyStatusVerifiedAt` reais.
- [ ] Registro solicitado/deferido/indeferido/substituído usa fonte oficial TSE/TRE.
- [ ] Para chapa presidencial formalizada, vice, partido e fonte estão registrados.
- [ ] Introdução exclusiva com ao menos 100 caracteres e fonte de trajetória.
- [ ] Pelo menos três módulos substantivos apoiados por fontes.
- [ ] Propostas sem “proposta 1”, “em breve” ou título vazio.
- [ ] Toda proposta pública está fora de `DRAFT` e tem URL primária HTTPS; rascunhos de
  pesquisa e afirmações sem fonte não aparecem no perfil nem nas APIs públicas.
- [ ] Foto em HTTPS/local, `photoSourceUrl` e `photoLicense` documentados.
- [ ] Sínteses por IA comparadas com as fontes e disclosure visível.
- [ ] Linguagem e profundidade equivalentes às usadas nos demais candidatos.
- [ ] Links abertos e conteúdo crítico conferido no HTML inicial.
- [ ] Autoria e revisão registradas.

## 3. Ordem correta de datas

1. Edite dados e fontes.
2. Grave `materialUpdatedAt` no momento da última mudança material.
3. Faça a revisão humana completa.
4. Grave `reviewedAt`, `editorialAuthor` e `editorialReviewer`.
5. Somente após a aprovação, grave `editorialApprovedAt` com valor igual ou posterior
   a `materialUpdatedAt` e `reviewedAt`.

Qualquer alteração posterior em fatos, texto, módulos ou fontes exige nova
`materialUpdatedAt` e bloqueia o perfil até uma nova revisão. Não execute aprovação em
massa e não preencha datas retroativas para “passar” no relatório.

## 4. Relatório

```powershell
pnpm --filter @raiox/web seo:quality-report

# Gate de CI quando todos os perfis previstos precisarem estar aprovados
pnpm --filter @raiox/web seo:quality-report -- --strict
```

O endpoint de origem é `GET /api/candidates/seo-report`. Cada item informa:

- `indexable`;
- `blockers` e mensagens legíveis;
- `warnings`, como status não reconferido em 48 horas;
- módulos substantivos reconhecidos;
- aliases e registros duplicados;
- mapa inicial de intenção de busca.

## 5. Duplicatas e slugs antigos

O domínio escolhe um registro canônico por identidade positiva e ano priorizando
identificador/fonte oficial, datas de verificação e atualização e, só depois, cargo/status;
isso só consolida registros que compartilham `personKey` explícito. Um
registro TSE isolado usa seu próprio `tseId`; linhas sem identificador ficam separadas e
qualquer slug repetido recebe o blocker `colisao_slug`. Antes de mudar um slug persistente:

1. confirme a página canônica no quality report;
2. insira o slug anterior em `CandidateSlugAlias` apontando para o registro canônico;
3. teste o 308 da página antiga para a nova;
4. confirme que somente a nova URL aparece no sitemap.

Nunca exclua um registro duplicado antes de comparar suas relações: propostas, votos,
bens, financiamento e notícias. A consolidação estrutural `Person → Candidacy` continua
sendo uma evolução de modelo, não uma licença para perder histórico.

`personKey` deve ser uma chave opaca e não sensível, atribuída após conferência; nunca use
CPF, título eleitoral, hash reversível desses documentos ou mera normalização do nome. O
sync oficial não liga uma linha do TSE a um perfil legado por semelhança nominal: na
primeira ocorrência ele pode criar uma linha separada, que permanece bloqueada até a
reconciliação explícita de identidade e relações.

O sync de imprensa também não procura registros do banco por nome. Ele só persiste dados
quando o nome/alias está associado a um `personKey` opaco na lista curada do código e existe
exatamente um registro com essa chave. Para incluir uma pessoa nova, duas pessoas devem
conferir a identidade e adicionar uma nova chave aleatória; não derive a chave do nome.

## 6. Após aprovar ou corrigir

- confirme que o scraper invalidou `candidates:*`, `consistency:*`, `comparison:*` e
  `proposals:*` no Redis antes da rota autenticada `/api/revalidate`; em edição manual,
  invalide os caches e o ISR nessa ordem;
- rode o quality report novamente;
- confira status HTTP, canonical, robots, JSON-LD e data visível;
- registre a mudança material no changelog;
- solicite nova indexação apenas para páginas prioritárias, se necessário.
