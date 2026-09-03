import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'
import { fetchCandidate } from '@/lib/api'
import { candidacyStatusPresentation } from '@/lib/candidacy'

// Node, nao edge: o retrato e lido do `public/` em disco. No edge o unico
// caminho era buscar a propria origem por HTTP, e essa requisicao nao voltava
// -- o card saia com a moldura vazia e depois sem foto nenhuma, sem erro.
export const runtime = 'nodejs'
export const alt = 'Raio-X eleitoral do candidato'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const TINTA = '#1a1614'
const PAPEL = '#f1ebdc'
const BRASA = '#b8321f'
const CINZA = '#6b625d'

/**
 * `R$ 35306860` → `R$ 35,3 mi`.
 *
 * O card é lido em miniatura, muitas vezes no celular: um número de oito
 * dígitos vira borrão. A ordem de grandeza é o que comunica, e é o que se
 * consegue conferir de relance.
 */
function dinheiroCurto(value: string | null | undefined): string | null {
  const total = Number(value)
  if (!Number.isFinite(total) || total <= 0) return null
  if (total >= 1_000_000) {
    return `R$ ${(total / 1_000_000).toFixed(1).replace('.', ',')} MI`
  }
  if (total >= 1_000) return `R$ ${Math.round(total / 1_000)} MIL`
  return `R$ ${Math.round(total)}`
}

/**
 * Retrato como data URI, lido do `public/` do proprio deploy.
 *
 * Passar a URL para o Satori deixava a moldura vazia: ele desenhava sem
 * esperar pela imagem, sem erro. E buscar por HTTP no runtime edge nao
 * resolvia, porque era a aplicacao chamando a si mesma. Ler do disco nao tem
 * nem espera de rede nem esse laco.
 */
async function retratoEmbutido(photoUrl: string | null | undefined): Promise<string | null> {
  if (!photoUrl?.startsWith('/')) return null
  try {
    const bytes = await readFile(join(process.cwd(), 'public', photoUrl))
    const tipo = photoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg'
    return `data:${tipo};base64,${bytes.toString('base64')}`
  } catch {
    // Foto ausente no disco nao invalida o card; ele so sai sem retrato.
    return null
  }
}

export default async function CandidateOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string }
}): Promise<ImageResponse> {
  const { slug } = await params
  const candidate = await fetchCandidate(slug)
    .then((response) => response.data)
    .catch(() => null)

  const name = candidate?.name ?? 'Perfil eleitoral'
  const status = candidacyStatusPresentation(candidate?.candidacyStatus).label
  const foto = await retratoEmbutido(candidate?.photoUrl)

  const identidade = [
    candidate?.party,
    candidate?.state,
    candidate?.ballotNumber != null ? `Nº ${candidate.ballotNumber}` : null,
  ].filter(Boolean).join(' · ') || 'Eleições 2026'

  // Só entra o que existe: card que promete "0 propostas" ou "R$ 0" diz menos
  // que o card que simplesmente não cita o número.
  const propostas = candidate?.proposals?.length ?? 0
  const arrecadado = dinheiroCurto(candidate?.campaignFinancings?.[0]?.totalReceived)
  const rodape = [
    propostas > 0 ? `${propostas} ${propostas === 1 ? 'PROPOSTA' : 'PROPOSTAS'}` : null,
    arrecadado,
    'FONTE: TSE',
  ].filter(Boolean).join('  ·  ')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: PAPEL,
          color: TINTA,
          padding: '52px 64px',
          border: `16px solid ${TINTA}`,
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: 38, letterSpacing: '-1px' }}>Raio-X</span>
            <span
              style={{
                marginLeft: 14,
                color: BRASA,
                fontFamily: 'Arial, sans-serif',
                fontSize: 17,
                letterSpacing: '5px',
              }}
            >
              2026
            </span>
          </div>
          <span
            style={{
              fontFamily: 'Arial, sans-serif',
              fontSize: 14,
              letterSpacing: '3px',
              color: CINZA,
            }}
          >
            PERFIL ELEITORAL
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {foto && (
            // Retrato oficial de urna. É o que faz o card parar o scroll — sem
            // ele, o compartilhamento do favorito e o do nanico são idênticos.
            <img
              src={foto}
              width={216}
              height={288}
              style={{
                width: 216,
                height: 288,
                objectFit: 'cover',
                border: `4px solid ${TINTA}`,
                marginRight: 44,
              }}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: foto ? 800 : 1040 }}>
            <div style={{ width: 84, height: 5, background: BRASA, marginBottom: 22 }} />
            <span
              style={{
                fontSize: name.length > 30 ? 58 : 74,
                lineHeight: 1.02,
                letterSpacing: '-2px',
              }}
            >
              {name}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 22 }}>
              <span
                style={{
                  fontFamily: 'Arial, sans-serif',
                  fontSize: 19,
                  letterSpacing: '3px',
                  color: BRASA,
                }}
              >
                {identidade}
              </span>
            </div>
            <span
              style={{
                fontFamily: 'Arial, sans-serif',
                fontSize: 16,
                letterSpacing: '2px',
                color: CINZA,
                marginTop: 10,
              }}
            >
              {status.toUpperCase()}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 20,
            borderTop: `2px solid ${TINTA}`,
            fontFamily: 'Arial, sans-serif',
            fontSize: 15,
            letterSpacing: '2px',
            color: TINTA,
          }}
        >
          <span>{rodape}</span>
          <span style={{ color: CINZA }}>raio-x-2026.com.br</span>
        </div>
      </div>
    ),
    size,
  )
}
