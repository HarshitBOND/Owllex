type CronSecretValidationInput = {
  configuredSecret?: string | null
  secretHeader?: string | null
  authorizationHeader?: string | null
}

const normalize = (value?: string | null) => value?.trim() || ""

const readBearerToken = (authorizationHeader?: string | null) => {
  const headerValue = normalize(authorizationHeader)
  if (!headerValue.toLowerCase().startsWith("bearer ")) {
    return ""
  }

  return headerValue.slice(7).trim()
}

export function hasValidCronSecret({
  configuredSecret,
  secretHeader,
  authorizationHeader,
}: CronSecretValidationInput): boolean {
  const expectedSecret = normalize(configuredSecret)

  if (!expectedSecret) {
    return false
  }

  const headerSecret = normalize(secretHeader)
  if (headerSecret && headerSecret === expectedSecret) {
    return true
  }

  const bearerToken = readBearerToken(authorizationHeader)
  if (bearerToken && bearerToken === expectedSecret) {
    return true
  }

  return false
}