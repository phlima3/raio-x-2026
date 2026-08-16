import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Raio-X 2026 — Transparência Eleitoral'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
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
          padding: '64px 72px',
          border: '12px solid #1a1614',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderBottom: '2px solid #1a1614',
            paddingBottom: 28,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
            <span style={{ fontSize: 58, letterSpacing: '-2px' }}>Raio-X</span>
            <span
              style={{
                color: '#b8321f',
                fontFamily: 'Arial, sans-serif',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '5px',
              }}
            >
              2026
            </span>
          </div>
          <span
            style={{
              color: '#554c45',
              fontFamily: 'Arial, sans-serif',
              fontSize: 18,
              letterSpacing: '3px',
              textTransform: 'uppercase',
            }}
          >
            Transparência eleitoral
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 78, lineHeight: 1.04, letterSpacing: '-3px' }}>
            Quem são. O que propõem.
          </span>
          <span style={{ color: '#b8321f', fontSize: 78, lineHeight: 1.04, letterSpacing: '-3px' }}>
            Como votaram.
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #8a8079',
            paddingTop: 24,
            color: '#554c45',
            fontFamily: 'Arial, sans-serif',
            fontSize: 17,
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          <span>TSE · Câmara · Senado</span>
          <span>raio-x-2026.com.br</span>
        </div>
      </div>
    ),
    size,
  )
}
