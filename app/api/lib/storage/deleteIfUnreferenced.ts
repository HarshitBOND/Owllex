import { deletePrivateObject } from "@/app/api/lib/storage/r2"
import VaultDocument from "@/app/api/lib/models/vault-document"
import CorpusDocument from "@/app/api/lib/models/corpus-document"
import ContractReview from "@/app/api/lib/models/contract-review"
import Attachment from "@/app/api/lib/models/attachment"

/**
 * Deletes an R2 object only if no remaining row points at it.
 *
 * Uploads are content-addressed (see dedupe.ts), so one stored object can back
 * several rows -- the same exhibit filed under two matters, or a document kept
 * in both a corpus and the vault. Deleting the object with the first row would
 * break the others, so the reference count is checked first.
 *
 * Callers must delete their own row *before* calling this, so the row being
 * removed is not itself counted as a reference.
 */
export async function deleteIfUnreferenced(r2Key: string): Promise<boolean> {
  const counts = await Promise.all([
    VaultDocument.countDocuments({ r2Key }),
    CorpusDocument.countDocuments({ r2Key }),
    ContractReview.countDocuments({ r2Key }),
    Attachment.countDocuments({ r2Key }),
  ])

  if (counts.reduce((a, b) => a + b, 0) > 0) return false

  // A failure here leaves an orphan rather than failing the user's delete;
  // scripts/r2-orphan-sweep.mjs is the backstop.
  await deletePrivateObject(r2Key).catch(() => {})
  return true
}
