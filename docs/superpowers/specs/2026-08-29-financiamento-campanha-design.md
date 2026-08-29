# Financiamento de campanha na ficha do candidato

Data: 2026-08-29
Estado: proposta, aguardando revisão

## O problema

A seção de transparência promete, no próprio subtítulo, "votações, patrimônio
declarado e **financiamento de campanha**". O endpoint devolve `financing:
null` para todo candidato, e nada é exibido. Não é defeito de tela: o dado
nunca foi coletado para 2026.

Existe um `importTseFinanciamento.ts` no repositório, mas ele cobre **2018 e
2022**, casa candidatura por nome (`fuzzy-match`, abordagem que o pipeline
oficial abandonou) e lê os pacotes históricos do catálogo. Não serve para a
eleição corrente.

O `CampaignFinancing` já existe no schema, com `totalReceived`, `totalSpent`,
`donors` e `sourceUrl`. A tabela está vazia.

## Decisões já tomadas

Fechadas em conversa antes deste documento:

1. **A seção responde a quatro perguntas**: de onde veio o dinheiro; se gasta
   dentro do limite; quem são doadores e fornecedores; se a prestação está em
   dia. As quatro saem da mesma consulta, então cobrir uma ou as quatro custa
   praticamente o mesmo na coleta — o trabalho está em exibir.
2. **CNPJ sim, CPF não.** Empresa aparece com nome e CNPJ. Pessoa física
   aparece com nome e valor, e **o CPF não é gravado** — é descartado na
   leitura, antes de qualquer persistência. Doação eleitoral é pública por lei
   e o TSE publica o CPF inteiro; republicar documento de identificação em
   página indexada é exposição adicional que não acrescenta informação
   jornalística.
3. **Cobertura: chapa presidencial primeiro.** Expandir depois é mudar um
   parâmetro, não reescrever.

## A fonte

`GET /divulga/rest/v1/prestador/consulta/{idEleicao}/{ano}/{sgUe}/{turno}/{nrPartido}/{nrCandidato}/{idCandidato}`

Todos os parâmetros foram confirmados contra a API real em 2026-08-29,
comparando duas candidaturas e variando os valores:

| Parâmetro | Origem | Confirmação |
| --- | --- | --- |
| `idEleicao` | `configuredElectionId()` | `20322002026` |
| `ano` | `Candidate.electionYear` | `2026` |
| `sgUe` | `electoralUnitFor(position, state)` | `BR` na presidencial |
| `turno` | fixo `1` por ora | `1` devolve 5.092 bytes; `2` devolve 862 (casca vazia — o 2º turno não ocorreu) |
| `nrPartido` | número do partido | Renan 14, Cury 70 |
| `nrCandidato` | `Candidate.ballotNumber` | idem; na majoritária é igual ao do partido |
| `idCandidato` | `Candidate.tseId` | `280002540694` |

`tpPrestador` vem `"CA"` no corpo e **não** é o quarto segmento — foi a
primeira hipótese, e está errada. O quarto segmento é o turno.

### O que o corpo traz

`dadosConsolidados` — composição da receita:

| Campo | Significado |
| --- | --- |
| `totalRecebido` | total |
| `graphVrReceitaFinFefc` | **FEFC, o fundão eleitoral** |
| `graphVrReceitaFinFundo` | fundo partidário |
| `totalDoacaoFcc` | financiamento coletivo |
| `totalReceitaPF` / `totalReceitaPJ` | pessoa física / jurídica |
| `totalProprios` | recursos próprios |

`despesas` — `valorLimiteDeGastos`, `totalDespesasContratadas`,
`totalDespesasPagas`, `fundoEspecial`, `fundosPartidarios`.

`rankingDoadores` e `rankingFornecedores` — top 5 cada, com
`{ cpfCnpj, nome, qntd, valor, stFinanciamentoColetivo }`.

`dataUltimaAtualizacaoContas`, `numeroDeControleEntrega`, `historicoEntregas` —
se a prestação está em dia.

Medições reais, que mostram que o dado diferencia candidatos:

- **Renan Santos**: R$ 1.293.445,81 recebidos, **zero de fundão**, R$ 1.220.288
  de financiamento coletivo (94%).
- **Augusto Cury**: R$ 202.062 recebidos, **R$ 50.000 de fundão**.

Esse contraste é exatamente o que a ficha esconde hoje.

### O vice não tem prestação

Verificado: a consulta para o vice responde 200, mas com `totalRecebido: null` e
870 bytes de casca. A prestação é da chapa, e fica no titular.

**Consequência de escopo**: financiamento alcança **12 candidaturas**, não as 24
da chapa. O job precisa filtrar por `PRESIDENTE` e ignorar `VICE_PRESIDENTE` —
sem isso, metade das consultas grava zeros que a tela leria como "não arrecadou".

## Modelo de dados

`CampaignFinancing` ganha colunas para os escalares e mantém JSON para as
listas. A escolha não é estética: a plataforma tem comparação lado a lado, e
comparar exige coluna — número dentro de JSON não ordena nem filtra.

```prisma
model CampaignFinancing {
  // já existem
  year, totalReceived, totalSpent, currency, sourceUrl, donors

  // novos — composição da receita
  fefcReceived          Decimal? @db.Decimal(18, 2)  // fundão
  partyFundReceived     Decimal? @db.Decimal(18, 2)
  crowdfundingReceived  Decimal? @db.Decimal(18, 2)
  individualsReceived   Decimal? @db.Decimal(18, 2)
  companiesReceived     Decimal? @db.Decimal(18, 2)
  ownResourcesReceived  Decimal? @db.Decimal(18, 2)
  otherReceived         Decimal? @db.Decimal(18, 2)  // ver "a composição fecha"

  // novos — despesa e limite
  spendingLimit         Decimal? @db.Decimal(18, 2)
  totalContracted       Decimal? @db.Decimal(18, 2)

  // novos — prestação
  accountsUpdatedAt     DateTime?
  deliveryControlNumber String?
  suppliers             Json?
}
```

Todas nulas: ausência de dado tem de continuar distinguível de zero. Um
candidato que não recebeu fundão e um cuja prestação não foi consultada não
podem ficar iguais no banco.

### A composição fecha — e por isso precisa de "outros"

Medido nas duas candidaturas, as parcelas somam o total **exatamente**:

- Renan: 1.220.288 (coletivo) + 73.157,81 (PF) = 1.293.445,81 ✓
- Cury: 50.000 (fundão) + 150.000 (próprios) + 2.062 (PF) = 202.062 ✓

Mas isso só vale somando as **onze** categorias que o TSE expõe, e as seis
colunas acima cobrem apenas as que têm nome próprio na tela. Comercialização,
rendimento de aplicação, bens móveis, doação de outro candidato e internet
ficariam de fora, e a soma passaria a não fechar para quem as usou — nestas
duas elas são zero, o que é justamente o tipo de coincidência que esconde o
defeito até aparecer um candidato diferente.

Por isso `otherReceived`, gravado como `totalRecebido` menos a soma das seis
nomeadas. A composição fecha sempre, a tela pode mostrar proporção sem mentir,
e nenhuma categoria nova do TSE some silenciosamente da conta.

`donors` e `suppliers` guardam `{ nome, valor, quantidade, cnpj?, coletivo }`.
**`cnpj` só é preenchido quando o documento tem 14 dígitos.** Com 11, é CPF: o
campo não é escrito.

## Coleta

Módulo novo `sources/tseFinanciamento.ts`, com job próprio. Não entra no
`sync:divulgacand` porque a cadência é outra — documento de registro não muda
depois do protocolo, prestação de contas muda a semana toda.

Reaproveita o que já existe:

- `DivulgaCandClient` ganha `fetchAccounts(target, ballotNumber)`; o transporte,
  o tratamento de erro e a porta injetável são os mesmos.
- `resolveTargets` de `tseDivulgaCand.ts` passa a ser exportado, em vez de
  duplicar a resolução de candidatura.
- `runDataSourceSync` para métricas e `DataSyncRun`, como os demais.

Métricas: `candidates`, `consulted`, `updated`, `withoutAccounts`, `missing`,
`failed`.

### Onde isto pode errar

- **`ballotNumber` nulo** impede montar a URL. A candidatura é contada em
  `missing` e registrada; não se adivinha número.
- **`nrPartido` fora da presidencial.** Na majoritária é igual ao número do
  candidato, e é por isso que a cobertura presidencial funciona sem coluna
  nova. Estender para deputado exige guardar o número do partido —
  fica registrado aqui como pré-requisito, não como suposição.
- **Segundo turno.** O `turno` é parâmetro; depois de 25/10 a coleta passa a
  precisar das duas rodadas, e o modelo (uma linha por `candidateId`+`year`)
  não comporta as duas. Fora de escopo agora, mas o `@@unique` vai precisar de
  turno quando chegar lá.

## Privacidade

Regra única, no parser: **o CPF é descartado antes de sair da função de
leitura.** Não é filtrado na API nem escondido na tela — não chega ao banco.

O teste que sustenta isso não verifica a tela: serializa o resultado do parser
a partir de um payload com CPF real e afirma que a string não aparece em lugar
nenhum. É o tipo de regra que se perde numa refatoração se o teste olhar só
para o campo certo.

## Interface

`TransparencyPanel` ganha um bloco de financiamento com quatro leituras, na
ordem das perguntas que decidimos responder:

1. **De onde veio** — composição com proporção. É onde "94% de financiamento
   coletivo" e "R$ 50.000 de fundão" ficam visíveis.
2. **Quanto pode gastar e quanto gastou** — limite legal, contratado, pago.
3. **Quem financia** — top doadores e fornecedores, nome e valor; CNPJ quando
   houver.
4. **Prestação em dia** — data da última atualização e número de controle.

Estados vazios continuam contextuais, no padrão que o painel já usa: candidato
sem prestação entregue é diferente de candidato ainda não consultado, e a tela
tem de dizer qual é qual.

## Testes

- Parser contra o formato real dos dois payloads medidos (Renan e Cury),
  incluindo `totalRecebido` nulo do vice.
- O teste de privacidade descrito acima.
- A composição fecha, e o teste tem de exigir isso: `total ==
  soma(parcelas) + otherReceived`, com tolerância de centavo.

## Fora de escopo

- Governadores e demais cargos.
- Segundo turno.
- Receita e despesa item a item — só os consolidados e os top 5.
- Retroalimentar 2018/2022; o `importTseFinanciamento.ts` antigo continua como
  está e não é tocado por esta mudança.

## Dependências

- O job roda pela ponte de browser (`TSE_BROWSER_TRANSPORT=1`) na máquina de
  desenvolvimento, ou por CI quando o billing do GitHub voltar.
- Escrever em produção depende de `DATABASE_URL`, que ainda não foi fornecida.
