const INTERNAL_HEADER_NAME = "x-internal-token"

export function getBackendInternalHeaders(): Record<string, string> {
  const internalToken = process.env.BACKEND_INTERNAL_TOKEN?.trim()

  if (!internalToken) {
    throw new Error("Missing BACKEND_INTERNAL_TOKEN")
  }

  return {
    [INTERNAL_HEADER_NAME]: internalToken,
  }
}
