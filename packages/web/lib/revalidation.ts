export interface RevalidationPayload {
  paths: string[]
  tags: string[]
}

const SAFE_PATH = /^\/[A-Za-z0-9/_\-.]*$/
const SAFE_TAG = /^[A-Za-z0-9:_\-.]{1,120}$/

export function validateRevalidationPayload(value: unknown): RevalidationPayload | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { paths?: unknown; tags?: unknown }
  const paths = candidate.paths ?? []
  const tags = candidate.tags ?? []
  if (!Array.isArray(paths) || !Array.isArray(tags)) return null
  if (paths.length > 50 || tags.length > 50 || (paths.length === 0 && tags.length === 0)) {
    return null
  }
  if (
    paths.some(
      (path) =>
        typeof path !== 'string' ||
        path.length > 300 ||
        path.includes('..') ||
        !SAFE_PATH.test(path),
    ) ||
    tags.some((tag) => typeof tag !== 'string' || !SAFE_TAG.test(tag))
  ) {
    return null
  }

  return {
    paths: [...new Set(paths as string[])],
    tags: [...new Set(tags as string[])],
  }
}
