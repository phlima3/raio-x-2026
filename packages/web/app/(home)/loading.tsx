import { CandidateCardSkeleton } from '@/components/CandidateCard'

export default function HomeLoading() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="h-7 bg-gray-200 rounded w-64 mb-6 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <CandidateCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
