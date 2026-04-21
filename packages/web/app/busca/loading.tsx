import { CandidateCardSkeleton } from '@/components/CandidateCard'

export default function BuscaLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 pb-16">
      <header className="border-b-2 border-ink pb-4 mb-8">
        <div className="h-3 w-24 bg-ink/10 mb-3 animate-pulse" />
        <div className="h-10 sm:h-12 bg-ink/10 w-72 animate-pulse" />
        <div className="h-4 bg-ink/[0.06] w-96 max-w-full mt-3 animate-pulse" />
      </header>

      <div className="flex flex-col sm:flex-row gap-4 mb-10">
        <div className="flex-1 border-b-2 border-ink/15 pb-2">
          <div className="h-3 w-20 bg-ink/[0.06] mb-2 animate-pulse" />
          <div className="h-6 bg-ink/10 w-full animate-pulse" />
        </div>
        <div className="sm:w-44 border-b-2 border-ink/15 pb-2">
          <div className="h-3 w-12 bg-ink/[0.06] mb-2 animate-pulse" />
          <div className="h-6 bg-ink/10 w-full animate-pulse" />
        </div>
        <div className="sm:w-28 border-b-2 border-ink/15 pb-2">
          <div className="h-3 w-14 bg-ink/[0.06] mb-2 animate-pulse" />
          <div className="h-6 bg-ink/10 w-full animate-pulse" />
        </div>
      </div>

      <div className="border-y border-ink/20 py-2 mb-1">
        <div className="h-3 w-28 bg-ink/[0.06] animate-pulse" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
        {Array.from({ length: 9 }).map((_, i) => (
          <CandidateCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
