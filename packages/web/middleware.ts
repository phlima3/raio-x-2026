import { NextResponse, type NextRequest } from 'next/server'
import { canonicalRedirectTarget } from '@/lib/seo'

export function middleware(request: NextRequest) {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const hostname = request.headers.get('host')?.split(':')[0] ?? request.nextUrl.hostname
  const target = canonicalRedirectTarget({
    hostname,
    protocol: forwardedProtocol ?? request.nextUrl.protocol,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  })

  return target ? NextResponse.redirect(target, 308) : NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
