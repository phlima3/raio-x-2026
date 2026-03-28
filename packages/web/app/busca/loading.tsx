import { CandidateCardSkeleton } from '@/components/CandidateCard'

export default function BuscaLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse" />
      <div className="h-4 bg-gray-100 rounded w-72 mb-8 animate-pulse" />
      <div className="h-12 bg-gray-100 rounded-xl mb-8 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CandidateCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
