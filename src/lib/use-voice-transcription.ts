import { useEffect, useRef, useState } from 'react'

export type VoiceState = 'idle' | 'recording' | 'transcribing'

const MAX_SECONDS = 60
const MIN_RECORDING_MS = 1000

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function useVoiceTranscription(accessToken: string | null, onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const cancelledRef = useRef(false)

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      releaseStream()
      clearTimer()
    }
  }, [])

  async function sendForTranscription(blob: Blob) {
    setState('transcribing')
    if (!accessToken) {
      setError('You must be signed in to use voice input.')
      setState('idle')
      return
    }
    try {
      const audioBase64 = await blobToBase64(blob)
      const res = await fetch('/api/posts/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ audioBase64, mimeType: blob.type || 'audio/webm' }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error || 'Transcription failed. Please try again.')
        setState('idle')
        return
      }
      if (typeof body.transcript === 'string' && body.transcript.trim()) {
        onTranscript(body.transcript.trim())
      } else {
        setError('No speech detected in the recording.')
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setState('idle')
    }
  }

  function stop() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  async function start() {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Voice recording is not supported in this browser.')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone permission denied. Enable microphone access and try again.')
      return
    }
    streamRef.current = stream

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    chunksRef.current = []
    cancelledRef.current = false

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      releaseStream()
      clearTimer()

      if (cancelledRef.current) {
        setState('idle')
        setElapsedSeconds(0)
        return
      }

      const recordedMs = Date.now() - startedAtRef.current
      setElapsedSeconds(0)
      if (recordedMs < MIN_RECORDING_MS) {
        setError('Recording was too short. Hold the mic button and try again.')
        setState('idle')
        return
      }

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      void sendForTranscription(blob)
    }

    mediaRecorderRef.current = recorder
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
    recorder.start()
    setState('recording')

    timerRef.current = window.setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setElapsedSeconds(secs)
      if (secs >= MAX_SECONDS) {
        stop()
      }
    }, 250)
  }

  function cancel() {
    setError(null)
    cancelledRef.current = true
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    } else {
      releaseStream()
      clearTimer()
      setState('idle')
      setElapsedSeconds(0)
    }
  }

  return { state, error, elapsedSeconds, maxSeconds: MAX_SECONDS, start, stop, cancel }
}
