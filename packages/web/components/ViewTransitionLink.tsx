'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { forwardRef, type MouseEvent, type ReactNode } from 'react'

type DocumentWithVT = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> }
}

type Props = {
  href: string
  children: ReactNode
  className?: string
  prefetch?: boolean
  onNavigate?: () => void
}

export const ViewTransitionLink = forwardRef<HTMLAnchorElement, Props>(
  function ViewTransitionLink(
    { href, children, className, prefetch = true, onNavigate },
    ref
  ) {
    const router = useRouter()

    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return
      }

      const doc = document as DocumentWithVT
      if (typeof doc.startViewTransition !== 'function') return

      const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
      if (mql.matches) return

      e.preventDefault()
      onNavigate?.()
      doc.startViewTransition(() => {
        router.push(href)
      })
    }

    return (
      <Link
        ref={ref}
        href={href}
        prefetch={prefetch}
        onClick={handleClick}
        className={className}
      >
        {children}
      </Link>
    )
  }
)
