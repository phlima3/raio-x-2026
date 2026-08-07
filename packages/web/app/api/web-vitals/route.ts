import { validateWebVital } from '@/lib/web-vitals'

export async function POST(request: Request) {
  const metric = validateWebVital(await request.json().catch(() => null))
  if (!metric) {
    return Response.json({ success: false, error: 'Métrica inválida' }, { status: 400 })
  }

  console.info('[web-vital]', JSON.stringify(metric))
  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' },
  })
}
