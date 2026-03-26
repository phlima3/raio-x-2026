# Fontes de Dados — Raio-X 2026

Documentação das APIs públicas e fontes utilizadas no projeto.

---

## 1. API da Câmara dos Deputados

**Base URL:** `https://dadosabertos.camara.leg.br/api/v2`  
**Documentação:** `https://dadosabertos.camara.leg.br/swagger/api.html`  
**Formato:** JSON  
**Autenticação:** Nenhuma (pública)

### Endpoints utilizados

#### Listar deputados

```
GET /deputados
  ?nome=          # filtro por nome
  ?idPartido=     # filtro por partido
  ?siglaUf=       # filtro por estado
  ?itens=100      # paginação
```

#### Detalhes de um deputado

```
GET /deputados/{id}
```

Retorna: nome, partido, estado, foto, email, situação.

#### Votações de um deputado

```
GET /deputados/{id}/votacoes
  ?dataInicio=2023-01-01
  ?dataFim=2026-03-25
  ?itens=100
```

#### Proposições de autoria

```
GET /proposicoes
  ?idDeputadoAutor={id}
  ?dataApresentacaoInicio=2023-01-01
  ?itens=50
```

#### Detalhe de votação (como cada deputado votou)

```
GET /votacoes/{idVotacao}/votos
```

---

## 2. API do Senado Federal

**Base URL:** `https://legis.senado.leg.br/dadosabertos`  
**Documentação:** `https://legis.senado.leg.br/dadosabertos/docs`  
**Formato:** JSON ou XML  
**Autenticação:** Nenhuma (pública)

### Endpoints utilizados

#### Listar senadores

```
GET /senador/lista/atual
```

#### Detalhes de um senador

```
GET /senador/{codigo}
```

#### Votações de um senador

```
GET /senador/{codigo}/votacoes
  ?dataInicio=20230101
  ?dataFim=20260325
```

#### Matérias de autoria

```
GET /materia/pesquisa/lista
  ?codigoAutor={codigo}
```

---

## 3. TSE — Tribunal Superior Eleitoral

**Portal:** `https://dadosabertos.tse.jus.br`  
**Formato:** CSV (bulk download) + REST  
**Disponibilidade:** Candidaturas disponíveis após registro (pós-agosto/2026)

### Dados disponíveis

| Dataset              | Formato | Descrição                                     |
| -------------------- | ------- | --------------------------------------------- |
| Candidatos           | CSV     | Nome, partido, cargo, estado, CPF mascarado   |
| Bens declarados      | CSV     | Patrimônio declarado por candidato            |
| Financiamento        | CSV     | Doações recebidas por candidato e partido     |
| Pesquisas eleitorais | CSV     | Registro de pesquisas (não intenções de voto) |

### URLs de download (exemplo 2022, estrutura igual em 2026)

```
https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022_BR.zip
https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022_BR.zip
```

---

## 4. Portal da Transparência

**Base URL:** `https://api.portaldatransparencia.gov.br/api-de-dados`  
**Documentação:** `https://api.portaldatransparencia.gov.br/swagger-ui.html`  
**Autenticação:** API key gratuita (cadastro no portal)

### Endpoints úteis

#### Servidores / cargo por CPF

```
GET /servidores
  ?cpf={cpf}
  ?pagina=1
```

#### Remuneração

```
GET /servidores/{id}/remuneracoes
```

---

## 5. Sites de Candidatos (Scraping)

Sites que serão monitorados via Playwright. Atualizado conforme candidaturas evoluem.

| Candidato             | Site                | Status   |
| --------------------- | ------------------- | -------- |
| Lula (PT)             | lula.com.br         | A mapear |
| Flávio Bolsonaro (PL) | A mapear            | A mapear |
| Ronaldo Caiado        | caiado.com.br       | A mapear |
| Romeu Zema            | zema.com.br         | A mapear |
| Eduardo Leite         | eduardoleite.com.br | A mapear |

> ⚠️ Sites de candidatos costumam bloquear scrapers. Estratégia: user-agent rotation + delays entre requests + fallback para PDF do programa de governo.

---

## 6. LLM — Processamento de Propostas

O projeto suporta dois providers via `LLM_PROVIDER` no `.env`:

### Gemini Pro (Google)

- **SDK:** `@google/generative-ai`
- **Modelo:** `gemini-1.5-pro`
- **Diferencial:** Google Search Grounding para monitoramento de notícias
- **Free tier:** 50 req/dia (pode variar por projeto)
- **Docs:** `https://ai.google.dev/gemini-api/docs`

### Groq (fallback recomendado para dev)

- **SDK:** `groq-sdk`
- **Modelo:** `llama-3.3-70b-versatile`
- **Free tier:** 1.000 req/dia, 14.400 req/dia em alguns planos
- **Latência:** muito baixa (especialidade do Groq)
- **Docs:** `https://console.groq.com/docs`

### Prompt base para extração de propostas

```
Você é um assistente de análise política. Analise o texto abaixo e extraia
as propostas do candidato em formato JSON estruturado.

Retorne APENAS o JSON, sem markdown, sem explicações.

Schema esperado:
{
  "economia": ["proposta 1", "proposta 2"],
  "saude": ["proposta 1"],
  "educacao": ["proposta 1"],
  "seguranca": ["proposta 1"],
  "meioambiente": ["proposta 1"],
  "tecnologia": ["proposta 1"],
  "politicaexterna": ["proposta 1"],
  "outros": ["proposta 1"]
}

Se não houver propostas para um tema, retorne array vazio.
Seja conciso — máximo 2 frases por proposta.

TEXTO:
{texto_extraido}
```
