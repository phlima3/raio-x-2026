import { ImageResponse } from 'next/og'
import { fetchCandidate } from '@/lib/api'
import { candidacyStatusPresentation } from '@/lib/candidacy'

export const runtime = 'edge'
export const alt = 'Raio-X eleitoral do candidato'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function CandidateOpenGraphImage({
  params,
}: {
  params: { slug: string }
}) {
  const candidate = await fetchCandidate(params.slug)
    .then((response) => response.data)
    .catch(() => null)
  const name = candidate?.name ?? 'Perfil eleitoral'
  const partyState = candidate ? `${candidate.party} · ${candidate.state}` : 'Eleições 2026'
  const status = candidacyStatusPresentation(candidate?.candidacyStatus).label

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f1ebdc',
          color: '#1a1614',
          padding: '58px 68px',
          border: '16px solid #1a1614',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: 40, letterSpacing: '-1px' }}>Raio-X</span>
            <span
              style={{
                marginLeft: 16,
                color: '#b8321f',
                fontFamily: 'Arial, sans-serif',
                fontSize: 18,
                letterSpacing: '5px',
                textTransform: 'uppercase',
              }}
            >
              2026
            </span>
          </div>
          <span
            style={{
              fontFamily: 'Arial, sans-serif',
              fontSize: 15,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: '#6b625d',
            }}
          >
            Perfil eleitoral
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: 90, height: 5, background: '#b8321f', marginBottom: 26 }} />
          <h1
            style={{
              margin: 0,
              maxWidth: 1000,
              fontSize: name.length > 28 ? 68 : 82,
              lineHeight: 0.98,
              fontWeight: 400,
              letterSpacing: '-3px',
            }}
          >
            {name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 28 }}>
            <span
              style={{
                fontFamily: 'Arial, sans-serif',
                fontSize: 18,
                letterSpacing: '3px',
                textTransform: 'uppercase',
                color: '#b8321f',
              }}
            >
              {partyState}
            </span>
            <span style={{ margin: '0 18px', color: '#9c918a' }}>·</span>
            <span
              style={{
                fontFamily: 'Arial, sans-serif',
                fontSize: 16,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: '#6b625d',
              }}
            >
              {status}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 22,
            borderTop: '2px solid #1a1614',
            fontFamily: 'Arial, sans-serif',
            fontSize: 14,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#6b625d',
          }}
        >
          <span>Propostas · histórico · fontes</span>
          <span>raio-x-2026.com.br</span>
        </div>
      </div>
    ),
    size,
  )
}
