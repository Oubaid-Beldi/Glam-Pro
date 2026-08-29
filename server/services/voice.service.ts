import { createAuthClient } from '../integrations/supabase.client'
import { transcribeAudio } from '../integrations/groq.client'

// Generous cap well above what a 60s client-side recording produces (session 8's
// browser-side cap), just to reject obviously-wrong payloads before they reach Groq.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024

export type TranscribeResult =
  | { status: 'ok'; transcript: string }
  | { status: 'config_error'; message: string }
  | { status: 'unauthorized'; message: string }
  | { status: 'bad_request'; message: string }
  | { status: 'timeout'; message: string }
  | { status: 'provider_unreachable'; message: string }
  | { status: 'rate_limited'; message: string }
  | { status: 'bad_response'; message: string }

export async function transcribeObjectiveAudio(params: {
  token: string
  audio: Buffer
  mimeType: string
}): Promise<TranscribeResult> {
  const { token, audio, mimeType } = params

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
  const groqApiKey = process.env.GROQ_API_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 'config_error', message: 'Server misconfigured: missing Supabase env vars.' }
  }
  if (!groqApiKey) {
    return { status: 'config_error', message: 'Server misconfigured: missing GROQ_API_KEY.' }
  }

  const authClient = createAuthClient(supabaseUrl, supabaseAnonKey)
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token)
  if (userError || !user) {
    return { status: 'unauthorized', message: 'Invalid or expired session.' }
  }

  if (audio.length === 0) {
    return { status: 'bad_request', message: 'No audio data received.' }
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    return { status: 'bad_request', message: 'Audio recording is too large.' }
  }

  const result = await transcribeAudio(groqApiKey, audio, mimeType)

  if (!result.ok) {
    switch (result.error.kind) {
      case 'timeout':
        return { status: 'timeout', message: 'Transcription timed out. Please try again.' }
      case 'unreachable':
        return {
          status: 'provider_unreachable',
          message: 'Could not reach the transcription provider. Please try again.',
        }
      case 'rate_limited':
        return { status: 'rate_limited', message: 'Transcription rate limit reached. Please wait and try again.' }
      case 'http_error':
        return { status: 'provider_unreachable', message: 'Transcription failed. Please try again.' }
      case 'empty_response':
        return { status: 'bad_response', message: 'No speech detected in the recording.' }
    }
  }

  return { status: 'ok', transcript: result.transcript }
}
