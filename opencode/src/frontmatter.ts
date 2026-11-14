export interface Frontmatter {
  readonly data: Readonly<Record<string, string>>
  readonly body: string
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontmatter(source: string): Frontmatter {
  const match = FENCE.exec(source)
  if (!match) {
    throw new Error("frontmatter: file does not start with a --- block")
  }
  const data: Record<string, string> = {}
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const colon = line.indexOf(":")
    if (colon <= 0) continue
    data[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return { data, body: source.slice(match[0].length) }
}
