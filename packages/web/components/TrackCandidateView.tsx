'use client'

import { useEffect } from 'react'
import { track } from '@/lib/analytics'

interface Props {
  slug: string
  name: string
  party: string
  state: string
  position: string
}

export function TrackCandidateView({ slug, name, party, state, position }: Props) {
  useEffect(() => {
    track('candidate_view', { slug, name, party, state, position })
  }, [slug, name, party, state, position])

  return null
}
