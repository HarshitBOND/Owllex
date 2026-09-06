import { createHash } from "crypto"
import { getRedisClient } from "@/app/api/lib/rateLimit"

/**
 * Memoises an AI response so that asking the same question about the same
 * unchanged input a second time costs nothing.
 *
 * The app had no such cache, which is what made two automatic call sites
 * expensive out of proportion to how much anyone actually used them: the form
 * prefill fires on every page mount, so a browser refresh re-ran a `balanced`
 * call for a byte-identical answer, and contract analysis fires on upload and
 * again on every manual re-run.
 *
 * Fails open in both directions. A Redis outage -- or no Redis configured at
 * all, which is the local default -- must degrade to "call the model", never to
 * an error.
 */

const PREFIX = "ai:cache:"

export function hashForCache(...parts: (string | null | undefined)[]) {
  return createHash("sha256").update(parts.map((p) => p ?? "").join(" ")).digest("hex").slice(0, 32)
}

export type CachedResult<T> = { value: T; hit: boolean }

/**
 * `key` must already carry everything the answer depends on -- including the
 * owning user for anything derived from their private documents. Keying a
 * contract analysis on the document hash alone would serve one advocate's
 * analysis to another who happened to upload the same file.
 */
export async function cachedGenerate<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>
): Promise<CachedResult<T>> {
  const redis = getRedisClient()
  const fullKey = `${PREFIX}${key}`

  if (redis) {
    try {
      const cached = await redis.get<T>(fullKey)
      if (cached !== null && cached !== undefined) return { value: cached, hit: true }
    } catch (error) {
      console.error("[AI_CACHE] read failed, calling the model:", error)
    }
  }

  const value = await produce()

  if (redis) {
    try {
      await redis.set(fullKey, value, { ex: ttlSeconds })
    } catch (error) {
      // The answer is already computed and about to be returned; failing to
      // store it only costs us the next hit.
      console.error("[AI_CACHE] write failed:", error)
    }
  }

  return { value, hit: false }
}

export const CACHE_TTL = {
  /** Analysis of a fixed document text never changes. */
  contractAnalyze: 30 * 24 * 60 * 60,
  /** Court form templates are admin-curated and effectively immutable. */
  templateExtraction: 30 * 24 * 60 * 60,
  /** Case records and corpus facts move, so prefill is only good for a day. */
  prefill: 24 * 60 * 60,
  /** The advocate is still editing the description they are previewing. */
  corpusPreview: 60 * 60,
} as const
