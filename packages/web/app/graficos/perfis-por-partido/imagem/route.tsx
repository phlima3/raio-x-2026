import { ImageResponse } from 'next/og'
import { fetchCandidateStats } from '@/lib/api'

export const revalidate = 3600

export async function GET() {
  const response = await fetchCandidateStats()
  const entries = Object.entries(response.data.byParty)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, 7)
  const maximum = Math.max(...entries.map(([, count]) => count), 1)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#f2eee4',
          color: '#171714',
          padding: '58px 68px 42px',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, color: '#b6492d' }}>
              RAIO-X 2026 · DADOS ELEITORAIS
            </div>
            <div style={{ display: 'flex', fontSize: 50, lineHeight: 1.05, marginTop: 14 }}>
              Perfis monitorados por partido
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', fontSize: 42 }}>{response.data.total}</div>
            <div style={{ display: 'flex', fontFamily: 'monospace', fontSize: 15, letterSpacing: 2 }}>PERFIS NO CATÁLOGO</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 34 }}>
          {entries.map(([party, count], index) => (
            <div key={party} style={{ display: 'flex', alignItems: 'center', height: 39 }}>
              <div style={{ display: 'flex', width: 35, fontFamily: 'monospace', fontSize: 14, color: '#77746d' }}>
                {String(index + 1).padStart(2, '0')}
              </div>
              <div style={{ display: 'flex', width: 145, fontFamily: 'monospace', fontSize: 18 }}>{party}</div>
              <div style={{ display: 'flex', flex: 1, height: 24, background: '#ded8ca' }}>
                <div style={{ display: 'flex', width: `${Math.max((count / maximum) * 100, 2)}%`, background: '#b6492d' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: 55, fontSize: 25 }}>{count}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '2px solid #171714',
            paddingTop: 14,
            marginTop: 'auto',
            fontFamily: 'monospace',
            fontSize: 14,
            letterSpacing: 1.2,
          }}
        >
          <span>FONTE: API RAIO-X 2026 · RAIO-X-2026.COM.BR/DADOS</span>
          <span>CATÁLOGO EDITORIAL · NÃO É LISTA OFICIAL DE REGISTROS</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
