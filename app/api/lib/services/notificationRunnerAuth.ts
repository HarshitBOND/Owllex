import crypto from "crypto"

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
  if (headerSecret && areSecretsEqual(headerSecret, expectedSecret)) {
    return true
  }

  const bearerToken = readBearerToken(authorizationHeader)
  if (bearerToken && areSecretsEqual(bearerToken, expectedSecret)) {
    return true
  }

  return false
}

function areSecretsEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}