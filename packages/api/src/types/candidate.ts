import { z } from 'zod'

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const PositionSchema = z.enum([
  'PRESIDENTE',
  'VICE_PRESIDENTE',
  'SENADOR',
  'PRIMEIRO_SUPLENTE',
  'SEGUNDO_SUPLENTE',
  'DEPUTADO_FEDERAL',
  'DEPUTADO_ESTADUAL',
  'DEPUTADO_DISTRITAL',
  'GOVERNADOR',
  'VICE_GOVERNADOR',
  'PREFEITO',
  'VEREADOR',
])

export const CandidateFiltersSchema = z.object({
  party: z.string().optional(),
  state: z.string().length(2).optional(),
  position: PositionSchema.optional(),
  electionYear: z.coerce.number().int().min(2026).optional(),
  search: z.string().min(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const CreateCandidateSchema = z.object({
  name: z.string().min(2),
  socialName: z.string().optional(),
  party: z.string().min(2).max(20),
  state: z.string().length(2),
  position: PositionSchema,
  tseId: z.string().optional(),
  coalitionName: z.string().optional(),
  photoUrl: z.string().url().optional(),
  bio: z.string().optional(),
  siteUrl: z.string().url().optional(),
  email: z.string().email().optional(),
  ballotNumber: z.number().int().positive().optional(),
  electionYear: z.number().int().default(2026),
  isIncumbent: z.boolean().default(false),
})

// ── Inferred TypeScript types ─────────────────────────────────────────────────

export type Position = z.infer<typeof PositionSchema>
export type CandidateFilters = z.infer<typeof CandidateFiltersSchema>
export type CreateCandidateDto = z.infer<typeof CreateCandidateSchema>

export interface CandidateSummary {
  id: string
  name: string
  party: string
  state: string
  position: Position
  photoUrl: string | null
  ballotNumber: number | null
  isOfficial?: boolean
  officialStatus?: string | null
  dataSource?: string
  lastSyncedAt?: Date | null
}

export interface CandidateDetail extends CandidateSummary {
  socialName: string | null
  coalitionName: string | null
  bio: string | null
  bioSummary: string | null
  siteUrl: string | null
  email: string | null
  isIncumbent: boolean
  electionYear: number
}
