import 'dotenv/config'
import { PrismaClient, ReviewItemStatus } from '@prisma/client'

const prisma = new PrismaClient()

export async function buildOpenReviewReport(db: PrismaClient = prisma) {
  const items = await db.reviewItem.findMany({
    where: { status: ReviewItemStatus.OPEN },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      kind: true,
      source: true,
      reason: true,
      officialRecordId: true,
      createdAt: true,
      candidate: {
        select: { id: true, slug: true, name: true, party: true, state: true, position: true },
      },
      person: { select: { id: true, name: true } },
      syncRun: { select: { id: true, startedAt: true, status: true } },
    },
  })
  const byKind = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1
    return counts
  }, {})
  return { generatedAt: new Date().toISOString(), total: items.length, byKind, items }
}

if (require.main === module) {
  buildOpenReviewReport()
    .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
