/**
 * Strips markdown fences and extracts the first valid JSON block.
 * Handles both `{...}` objects and arrays.
 */
export function extractJson(raw: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
  // Find the outermost { } or [ ]
  const start = stripped.search(/[{[]/)
  if (start === -1) return stripped
  let depth = 0
  let end = -1
  const open = stripped[start]
  const close = open === '{' ? '}' : ']'
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === open) depth++
    else if (stripped[i] === close) {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  return end !== -1 ? stripped.slice(start, end + 1) : stripped
}
