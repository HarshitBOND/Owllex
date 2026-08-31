import type { ReactNode } from "react"
import { toast as sonner } from "sonner"

export type Toast = {
  title?: ReactNode
  description?: ReactNode
  variant?: "default" | "destructive"
}

function toast({ title, description, variant }: Toast) {
  const show = variant === "destructive" ? sonner.error : sonner
  const id = show(title as string, { description: description as string })
  return { id, dismiss: () => sonner.dismiss(id) }
}

function useToast() {
  return { toast, dismiss: (id?: string | number) => sonner.dismiss(id) }
}

export { useToast, toast }
