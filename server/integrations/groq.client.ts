// llama-3.3-70b-versatile was removed from Groq's catalog (confirmed via a live
// /openai/v1/models check — 404 model_not_found). openai/gpt-oss-120b is the closest
// available replacement: comparable scale, still supports JSON mode. See
// docs/sessions/07-architecture-refactor.md for the verification that led here.
const GROQ_MODEL = 'openai/gpt-oss-120b'
const GROQ_TIMEOUT_MS = 20_000
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

export type GroqCallError =
  | { kind: 'timeout' }
  | { kind: 'unreachable' }
  | { kind: 'rate_limited' }
  | { kind: 'http_error' }
  | { kind: 'empty_response' }

export type GroqCallResult = { ok: true; content: string } | { ok: false; error: GroqCallError }

export async function callGroq(apiKey: string, systemPrompt: string, userPrompt: string): Promise<GroqCallResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return { ok: false, error: { kind: timedOut ? 'timeout' : 'unreachable' } }
  }
  clearTimeout(timeout)

  if (!response.ok) {
    if (response.status === 429) {
      return { ok: false, error: { kind: 'rate_limited' } }
    }
    return { ok: false, error: { kind: 'http_error' } }
  }

  const completion = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const rawContent = completion.choices?.[0]?.message?.content

  if (!rawContent) {
    return { ok: false, error: { kind: 'empty_response' } }
  }

  return { ok: true, content: rawContent }
}
