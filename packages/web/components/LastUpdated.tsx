'use client'

import { useEffect, useState } from 'react'

type Props = {
  isoDate: string
}

const RTF = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diffSec = Math.round((then - Date.now()) / 1000)
  const absSec = Math.abs(diffSec)

  if (absSec < 60) return RTF.format(diffSec, 'second')
  if (absSec < 3600) return RTF.format(Math.round(diffSec / 60), 'minute')
  if (absSec < 86400) return RTF.format(Math.round(diffSec / 3600), 'hour')
  return RTF.format(Math.round(diffSec / 86400), 'day')
}

export function LastUpdated({ isoDate }: Props) {
  const [label, setLabel] = useState(() => formatRelative(isoDate))

  useEffect(() => {
    const update = () => setLabel(formatRelative(isoDate))
    update()
    const id = window.setInterval(update, 30_000)
    return () => window.clearInterval(id)
  }, [isoDate])

  return (
    <time dateTime={isoDate} className="tabular-nums">
      {label}
    </time>
  )
}
