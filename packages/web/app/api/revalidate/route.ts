import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { validateRevalidationPayload } from '@/lib/revalidation'

export async function POST(request: Request) {
  const configuredSecret = process.env.REVALIDATION_SECRET
  if (!configuredSecret) {
    return NextResponse.json(
      { success: false, error: 'Revalidação não configurada' },
      { status: 503 },
    )
  }

  const authorization = request.headers.get('authorization')
  if (authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })
  }

  const payload = validateRevalidationPayload(await request.json().catch(() => null))
  if (!payload) {
    return NextResponse.json({ success: false, error: 'Payload inválido' }, { status: 400 })
  }

  for (const path of payload.paths) revalidatePath(path)
  for (const tag of payload.tags) revalidateTag(tag)

  return NextResponse.json({
    success: true,
    revalidated: payload,
    at: new Date().toISOString(),
  })
}
