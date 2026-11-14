const TAG = "cross-session-message"
const CLOSING_TAG = `</${TAG}>`

/** An opening or closing tag, in any case and with whitespace anywhere a parser might tolerate it. */
const TAG_LIKE = /<(\s*\/?\s*)(cross-session-message)/gi

/** Keeps a message body from closing the envelope early and opening a forged one. */
function neutralize(body: string): string {
  return body.replace(TAG_LIKE, (_match, padding: string, name: string) => `<\\${padding}${name}`)
}

export function buildEnvelope(from: string, id: string, body: string): string {
  return `<${TAG} from="${from}" id="${id}">\n${neutralize(body)}\n${CLOSING_TAG}`
}
