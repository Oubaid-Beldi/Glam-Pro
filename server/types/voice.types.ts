export interface TranscribeRequestBody {
  audioBase64: string
  mimeType: string
}

export interface TranscribeResponseBody {
  transcript: string
}
