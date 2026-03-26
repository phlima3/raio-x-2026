# LLM Integration — Raio-X 2026

Documentação da integração com modelos de linguagem para extração e sumarização de dados.

---

## Providers suportados

| Provider      | Modelo                  | Free tier     | Melhor para                 |
| ------------- | ----------------------- | ------------- | --------------------------- |
| Groq          | llama-3.3-70b-versatile | 1.000 req/dia | Dev + MVP                   |
| Google Gemini | gemini-1.5-pro          | 50 req/dia    | Produção + Search Grounding |

Configurado via `.env`:

```env
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
```

---

## Casos de uso

### 1. Extração de propostas (principal)

**Input:** texto HTML/texto limpo do site do candidato ou PDF  
**Output:** JSON com propostas por tema  
**Provider:** qualquer um  
**Frequência:** semanal

**Prompt:**

```
Você é um assistente de análise política apartidário.
Analise o texto abaixo e extraia as propostas do candidato.

Retorne APENAS JSON válido, sem markdown, sem explicações adicionais.

Schema:
{
  "economia": string[],
  "saude": string[],
  "educacao": string[],
  "seguranca": string[],
  "meioambiente": string[],
  "tecnologia": string[],
  "politicaexterna": string[],
  "outros": string[]
}

Regras:
- Máximo 2 frases por proposta
- Seja factual, sem julgamento de valor
- Se não houver propostas para um tema, retorne []
- Não invente propostas que não estejam no texto

TEXTO:
{input}
```

---

### 2. Sumarização de Projeto de Lei

**Input:** ementa + texto completo do PL  
**Output:** resumo em linguagem simples (max 3 frases)  
**Provider:** qualquer um  
**Frequência:** sob demanda (novos PLs detectados)

**Prompt:**

```
Explique o seguinte projeto de lei em linguagem simples,
como se estivesse explicando para alguém que não tem
conhecimento jurídico.

Máximo 3 frases. Seja neutro e factual.

EMENTA: {ementa}

TEXTO: {texto}
```

---

### 3. Monitoramento de notícias (Gemini only)

**Requer:** Gemini com Google Search Grounding  
**Input:** nome do candidato  
**Output:** declarações recentes e possíveis contradições  
**Frequência:** diária

**Prompt:**

```
Busque as declarações mais recentes do candidato {nome}
sobre propostas para as eleições de 2026.

Retorne JSON:
{
  "declarations": [
    {
      "theme": "economia",
      "statement": "declaração resumida",
      "source": "URL da notícia",
      "date": "YYYY-MM-DD"
    }
  ]
}
```

---

## Score de consistência (fase 5)

Cruza propostas declaradas com histórico de votações:

**Prompt:**

```
Dado o histórico de votações e as propostas declaradas do candidato,
identifique contradições entre o que ele diz e como votou.

PROPOSTAS:
{proposals_json}

VOTAÇÕES RECENTES:
{votes_json}

Retorne JSON:
{
  "consistencyScore": 0-100,
  "contradictions": [
    {
      "theme": "economia",
      "proposal": "proposta declarada",
      "vote": "votou contra PL que propunha isso",
      "severity": "high|medium|low"
    }
  ]
}
```

---

## Implementação

```typescript
// packages/scraper/src/processors/proposalExtractor.ts

const provider =
  process.env.LLM_PROVIDER === "gemini"
    ? new GeminiProcessor()
    : new GroqProcessor();

const proposals = await provider.extractProposals(cleanedText);
```

---

## Limites e custos estimados

### MVP (20 candidatos, sync semanal)

- Extração de propostas: ~20 req/semana
- Sumarização de PLs: ~50 req/semana (novos PLs)
- **Total: ~70 req/semana → dentro do free tier de qualquer provider**

### Produção (50 candidatos + monitoramento diário)

- ~500 req/dia → Groq free tier ainda aguenta
- Com Search Grounding (Gemini): pode precisar de plano pago

---

## Troubleshooting

**Gemini retorna 429 com limit 0:**
O projeto foi criado via Google Cloud Console. Solução: gerar a API key diretamente em `aistudio.google.com/api-keys` ou habilitar a Generative Language API no console do projeto.

**JSON inválido retornado pelo LLM:**
O `proposalExtractor.ts` tem um fallback que tenta extrair o JSON com regex caso venha com markdown ` ```json ``` `. Se ainda assim falhar, loga o erro e retorna objeto vazio — nunca quebra o pipeline.
