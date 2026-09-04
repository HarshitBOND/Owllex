const DEFAULT_BACKEND_API = "https://owllex-backend.owllex-backend-container.workers.dev"

export const BACKEND_API_BASE = (
  process.env.NEXT_PUBLIC_BACKEND_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  DEFAULT_BACKEND_API
).replace(/\/$/, "")

export function backendApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${BACKEND_API_BASE}${normalizedPath}`
}
