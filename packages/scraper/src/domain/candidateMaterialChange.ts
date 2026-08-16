export interface CandidateMaterialSnapshot {
  bio: string | null
  bioSummary: string | null
  photoUrl: string | null
  photoSourceUrl: string | null
  siteUrl: string | null
  bioSourceUrl: string | null
  approvalRate: number | null
}

export type CandidateMaterialPatch = Partial<CandidateMaterialSnapshot>

export function hasCandidateMaterialChange(
  current: CandidateMaterialSnapshot,
  patch: CandidateMaterialPatch,
): boolean {
  return (Object.keys(patch) as Array<keyof CandidateMaterialPatch>).some(
    (field) => patch[field] !== undefined && patch[field] !== current[field],
  )
}
