import { opensAsDownload } from '@/lib/candidacy'

const STATUS_CONFIG: Record<string, { label: string; tone: 'approved' | 'rejected' | 'neutral' | 'warning' }> = {
  APPROVED: { label: 'Aprovado', tone: 'approved' },
  REJECTED: { label: 'Rejeitado', tone: 'rejected' },
  ARCHIVED: { label: 'Arquivado', tone: 'neutral' },
  VOTED: { label: 'Votado', tone: 'neutral' },
  IN_COMMITTEE: { label: 'Em comissão', tone: 'warning' },
  SUBMITTED: { label: 'Apresentado', tone: 'neutral' },
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
}

const STATUS_TONE: Record<'approved' | 'rejected' | 'neutral' | 'warning', string> = {
  approved: 'text-emerald-800 border-emerald-800/40',
  rejected: 'text-ember border-ember/50',
  neutral: 'text-ink-muted border-ink/30',
  warning: 'text-amber-800 border-amber-800/40',
}

const SOURCE_LABELS: Record<string, string> = {
  camara: 'Câmara dos Deputados',
  senado: 'Senado Federal',
  candidate_site: 'Site do candidato',
  tse_program: 'Plano de governo registrado no TSE',
}

interface ProposalBlockProps {
  id: string
  title: string
  category?: string | null
  status: string
  origin?: string
  summary?: string | null
  description?: string | null
  source: string
  url?: string | null
  proposedAt?: string | null
}

export function ProposalBlock({
  title,
  status,
  origin,
  summary,
  description,
  source,
  url,
  proposedAt,
}: ProposalBlockProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT
  const toneClass = STATUS_TONE[cfg.tone]

  return (
    <article className="border-b border-ink/20 py-6 md:py-7 group">
      {/* Title + status */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-3">
        <h4 className="font-serif text-xl md:text-2xl leading-snug tracking-[-0.01em] flex-1 min-w-[14rem] text-pretty">
          {title}
        </h4>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.22em] px-2 py-1 border whitespace-nowrap ${toneClass}`}
        >
          {cfg.label}
        </span>
      </div>

      {/* AI summary — collapsible */}
      {summary && (
        <details className="mb-2 group/details">
          <summary className="focus-editorial list-none cursor-pointer font-mono text-[11px] uppercase tracking-[0.22em] text-ember hover:underline inline-block pb-0.5 border-b border-transparent hover:border-ember">
            <span className="group-open/details:hidden">§ Resumo IA</span>
            <span className="hidden group-open/details:inline">× Fechar resumo</span>
          </summary>
          <p className="mt-3 font-serif italic text-[15px] md:text-base leading-[1.65] text-ink-muted max-w-3xl text-pretty">
            {summary}
          </p>
        </details>
      )}

      {/* Full description */}
      {description && description !== summary && (
        <details className="mb-2 group/details">
          <summary className="focus-editorial list-none cursor-pointer font-mono text-[11px] uppercase tracking-[0.22em] text-ink-muted hover:text-ember inline-block pb-0.5 border-b border-transparent hover:border-ember">
            <span className="group-open/details:hidden">▸ Texto integral</span>
            <span className="hidden group-open/details:inline">▾ Ocultar</span>
          </summary>
          <p className="mt-3 text-[15px] md:text-base leading-[1.7] text-ink-muted max-w-3xl text-pretty">
            {description}
          </p>
        </details>
      )}

      {/* Meta line */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        <span>{SOURCE_LABELS[source] ?? source}</span>
        {/* Texto de máquina não pode passar por texto conferido, item a item. */}
        {origin === 'AI_EXTRACTION' && (
          <>
            <span aria-hidden>·</span>
            <span className="text-amber-800">Resumo por IA</span>
          </>
        )}
        {proposedAt && (
          <>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {new Date(proposedAt).getFullYear()}
            </span>
          </>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-editorial ml-auto text-ember hover:underline underline-offset-4"
          >
            {/* O rótulo tem de dizer a verdade sobre o clique. A página da
                candidatura no DivulgaCandContas abre para leitura; o pacote do
                catálogo, que é o caminho de quem não passou por lá, continua
                sendo um arquivo que cai nos downloads. */}
            {source === 'tse_program'
              ? opensAsDownload(url)
                ? 'Baixar plano no TSE ↗'
                : 'Ver no TSE ↗'
              : 'Ver original ↗'}
          </a>
        )}
      </div>
    </article>
  )
}
