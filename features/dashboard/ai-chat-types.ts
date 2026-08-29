export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  fileNames: string[]
}

export type Conversation = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}
