import { z } from 'zod'

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const ProposalStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'IN_COMMITTEE',
  'VOTED',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
])

export const ProposalSourceSchema = z.enum(['camara', 'senado', 'candidate_site'])

export const CreateProposalSchema = z.object({
  externalId: z.string().optional(),
  source: ProposalSourceSchema,
  title: z.string().min(5),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  status: ProposalStatusSchema.default('DRAFT'),
  proposedAt: z.coerce.date().optional(),
  url: z.string().url().optional(),
  candidateId: z.string(),
})

export const ProposalFiltersSchema = z.object({
  candidateId: z.string().optional(),
  category: z.string().optional(),
  status: ProposalStatusSchema.optional(),
  source: ProposalSourceSchema.optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().min(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ── Inferred TypeScript types ─────────────────────────────────────────────────

export type ProposalStatus = z.infer<typeof ProposalStatusSchema>
export type ProposalSource = z.infer<typeof ProposalSourceSchema>
export type CreateProposalDto = z.infer<typeof CreateProposalSchema>
export type ProposalFilters = z.infer<typeof ProposalFiltersSchema>

export interface ProposalSummary {
  id: string
  title: string
  category: string | null
  status: ProposalStatus
  source: string
  tags: string[]
  proposedAt: Date | null
}

export interface ProposalDetail extends ProposalSummary {
  description: string | null
  summary: string | null // Gerado pelo Gemini
  url: string | null
  candidateId: string
}
