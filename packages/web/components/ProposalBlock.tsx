const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  APPROVED:     { label: 'Aprovado',      className: 'bg-green-50 text-green-700' },
  REJECTED:     { label: 'Rejeitado',     className: 'bg-red-50 text-red-700' },
  ARCHIVED:     { label: 'Arquivado',     className: 'bg-gray-100 text-gray-500' },
  VOTED:        { label: 'Votado',        className: 'bg-brand-50 text-brand-700' },
  IN_COMMITTEE: { label: 'Em Comissão',  className: 'bg-yellow-50 text-yellow-700' },
  SUBMITTED:    { label: 'Apresentado',  className: 'bg-gray-100 text-gray-600' },
  DRAFT:        { label: 'Rascunho',     className: 'bg-gray-50 text-gray-400' },
}

const SOURCE_LABELS: Record<string, string> = {
  camara:         'Câmara dos Deputados',
  senado:         'Senado Federal',
  candidate_site: 'Site do candidato',
}

interface ProposalBlockProps {
  id: string
  title: string
  category?: string | null
  status: string
  summary?: string | null
  description?: string | null
  source: string
  url?: string | null
  proposedAt?: string | null
}

export function ProposalBlock({
  title,
  status,
  summary,
  description,
  source,
  url,
  proposedAt,
}: ProposalBlockProps) {
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT

  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-3 bg-white hover:border-brand-200 transition-colors">
      {/* Title + status */}
      <div className="flex flex-wrap items-start gap-2 mb-2">
        <h4 className="font-semibold text-gray-900 text-sm leading-snug flex-1 min-w-0">{title}</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 ${statusCfg.className}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* AI summary — collapsible via native <details> */}
      {summary && (
        <details className="mb-2 group">
          <summary className="text-xs text-brand-600 cursor-pointer hover:text-brand-700 font-medium list-none flex items-center gap-1">
            <span className="group-open:hidden">▸ Ver resumo IA</span>
            <span className="hidden group-open:inline">▾ Ocultar resumo</span>
          </summary>
          <p className="text-sm text-gray-600 mt-2 bg-brand-50 rounded-lg p-3 leading-relaxed">
            {summary}
          </p>
        </details>
      )}

      {/* Full description */}
      {description && description !== summary && (
        <details className="mb-2 group">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 list-none flex items-center gap-1">
            <span className="group-open:hidden">▸ Ver texto completo</span>
            <span className="hidden group-open:inline">▾ Ocultar</span>
          </summary>
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{description}</p>
        </details>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-gray-50 text-xs text-gray-400">
        <span>{SOURCE_LABELS[source] ?? source}</span>
        {proposedAt && <span>· {new Date(proposedAt).getFullYear()}</span>}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-brand-500 hover:text-brand-700 font-medium"
          >
            Ver original ↗
          </a>
        )}
      </div>
    </div>
  )
}
