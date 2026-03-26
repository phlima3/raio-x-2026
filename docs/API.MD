# API Reference — Raio-X 2026

Base URL local: `http://localhost:3001`

---

## Health

```
GET /health
```

```json
{ "status": "ok" }
```

---

## Candidatos

### Listar candidatos

```
GET /candidates
```

**Query params:**
| Param | Tipo | Descrição |
|---|---|---|
| `office` | string | `president`, `governor` |
| `state` | string | Sigla do estado (ex: `SP`, `MG`) |
| `party` | string | Sigla do partido (ex: `PT`, `PL`) |
| `page` | number | Paginação (default: 1) |
| `limit` | number | Itens por página (default: 20, max: 100) |

**Resposta:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Nome do Candidato",
      "slug": "nome-do-candidato",
      "party": "PT",
      "state": "SP",
      "office": "president",
      "photoUrl": "https://...",
      "approvalRate": 42,
      "updatedAt": "2026-03-25T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45
  }
}
```

---

### Perfil do candidato

```
GET /candidates/:slug
```

**Resposta:**

```json
{
  "id": "uuid",
  "name": "Nome do Candidato",
  "slug": "nome-do-candidato",
  "party": "PT",
  "state": "SP",
  "office": "president",
  "bio": "Texto biográfico resumido...",
  "photoUrl": "https://...",
  "officialSite": "https://...",
  "socialLinks": {
    "twitter": "https://...",
    "instagram": "https://..."
  },
  "partyHistory": ["PMDB (1980-1990)", "PT (1990-atual)"],
  "approvalRate": 42,
  "updatedAt": "2026-03-25T10:00:00Z"
}
```

---

### Propostas do candidato

```
GET /candidates/:slug/proposals
```

**Resposta:**

```json
{
  "candidateSlug": "nome-do-candidato",
  "source": "https://site-do-candidato.com.br/propostas",
  "extractedAt": "2026-03-20T00:00:00Z",
  "proposals": {
    "economia": ["Proposta 1", "Proposta 2"],
    "saude": ["Proposta 1"],
    "educacao": ["Proposta 1"],
    "seguranca": ["Proposta 1"],
    "meioambiente": [],
    "tecnologia": ["Proposta 1"],
    "politicaexterna": [],
    "outros": []
  }
}
```

---

### Histórico de votações

```
GET /candidates/:slug/votes
```

**Query params:**
| Param | Tipo | Descrição |
|---|---|---|
| `dateFrom` | string | Data inicial (YYYY-MM-DD) |
| `dateTo` | string | Data final (YYYY-MM-DD) |
| `theme` | string | Filtro por tema (ex: `economia`) |
| `page` | number | Paginação |

**Resposta:**

```json
{
  "data": [
    {
      "id": "uuid",
      "billId": "PL 1234/2024",
      "billTitle": "Reforma Tributária",
      "billSummary": "Simplificação do sistema tributário...",
      "vote": "yes",
      "date": "2024-07-15",
      "theme": "economia",
      "source": "camara"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 234 }
}
```

**Valores de `vote`:** `yes`, `no`, `abstain`, `absent`

---

### Projetos de lei de autoria

```
GET /candidates/:slug/bills
```

**Resposta:**

```json
{
  "data": [
    {
      "id": "uuid",
      "externalId": "PL 567/2023",
      "title": "Título do projeto",
      "summary": "Resumo em linguagem simples...",
      "status": "Em tramitação",
      "presentedAt": "2023-05-10",
      "theme": "saude",
      "source": "camara",
      "url": "https://camara.leg.br/..."
    }
  ]
}
```

---

### Declaração de bens

```
GET /candidates/:slug/assets
```

**Resposta:**

```json
{
  "year": 2026,
  "totalValue": 1250000.0,
  "source": "tse",
  "items": [
    {
      "type": "Imóvel",
      "description": "Apartamento em São Paulo",
      "value": 800000.0
    }
  ]
}
```

---

### Financiamento de campanha

```
GET /candidates/:slug/financing
```

**Resposta:**

```json
{
  "year": 2026,
  "totalReceived": 5000000.0,
  "source": "tse",
  "donors": [
    {
      "name": "Nome do doador",
      "type": "PJ",
      "amount": 500000.0,
      "date": "2026-08-15"
    }
  ]
}
```

---

## Comparador

```
GET /compare?a=:slug1&b=:slug2
```

**Resposta:**

```json
{
  "candidates": {
    "a": { "name": "...", "party": "...", "slug": "..." },
    "b": { "name": "...", "party": "...", "slug": "..." }
  },
  "proposals": {
    "economia": {
      "a": ["Proposta A1", "Proposta A2"],
      "b": ["Proposta B1"]
    },
    "saude": {
      "a": ["Proposta A1"],
      "b": ["Proposta B1", "Proposta B2"]
    }
  }
}
```

---

## Erros

| Código | Significado              |
| ------ | ------------------------ |
| 400    | Parâmetros inválidos     |
| 404    | Candidato não encontrado |
| 429    | Rate limit excedido      |
| 500    | Erro interno             |

```json
{
  "error": {
    "code": "CANDIDATE_NOT_FOUND",
    "message": "Candidato com slug 'fulano' não encontrado"
  }
}
```
