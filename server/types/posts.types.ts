export type PostDraft = string

export interface GeneratePostsRequestBody {
  projectId: string
  objective: string
}

export interface GeneratePostsResponseBody {
  drafts: PostDraft[]
}
