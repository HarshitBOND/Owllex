/**
 * Seeds the "Court Forms & Pleadings" document-template category with
 * ready-to-use Indian court forms (starting with the standard Address Form)
 * so they show up in the admin Document Templates tab and the public
 * Draft Documents template library without anyone hand-building them in
 * the rich-text editor first.
 *
 * Upserts by slug, so it's safe to re-run -- editing an entry below and
 * re-running updates the existing template instead of duplicating it.
 *
 *   npm run seed:court-forms
 */
import path from "node:path"
import { config as loadEnv } from "dotenv"
import mongoose from "mongoose"

loadEnv({ path: path.resolve(process.cwd(), ".env.local") })

const { MONGODB_URI, MONGODB_DB } = process.env

if (!MONGODB_URI) {
  console.error("Missing required env var MONGODB_URI")
  process.exit(1)
}

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "template"
  )
}

const CATEGORY = "Court Forms & Pleadings"

const templates: { title: string; description: string; bodyHtml: string }[] = [
  {
    title: "Address Form",
    description:
      "Standard court address form recording the address for service of summons, notices, and orders on a plaintiff, defendant, or applicant.",
    bodyHtml: `
<h1 style="text-align:center">ADDRESS FORM</h1>
<p><strong>In the Court of :</strong> ________________________________________________</p>
<p><strong>Case</strong> ______________________________ &nbsp;&nbsp;&nbsp; <strong>Versus</strong> ______________________________</p>
<p><strong>Suit</strong> ______________________________ &nbsp;&nbsp;&nbsp; <strong>Date of Hearing</strong> ______________________________</p>
<p>The address of Plaintiff/ Defendant/ Applicant is as under :-</p>
<table>
<tr>
<th>Name with Father's Name</th>
<th>Caste</th>
<th>Resident of</th>
<th>Post Office</th>
<th>Tehsil</th>
<th>Distt.</th>
<th>Remarks</th>
</tr>
<tr><td>&nbsp;<br>&nbsp;<br>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
<tr><td>&nbsp;<br>&nbsp;<br>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
<tr><td>&nbsp;<br>&nbsp;<br>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</table>
<p>Sir,</p>
<p>All the summons, notices orders etc. In connection with the above suit be sent to me at the address given above.</p>
<p>In Case of any change in address, the same shall be communicated to with full particulars and details.</p>
`.trim(),
  },
]

async function main() {
  await mongoose.connect(MONGODB_URI!, { dbName: MONGODB_DB || "LexVert" })
  const db = mongoose.connection.db!

  const admin =
    (await db.collection("users").findOne({ email: "basantaranjan02@gmail.com" })) ||
    (await db.collection("users").findOne({ role: "admin" }))

  if (!admin) {
    console.error("No admin user found to attribute these templates to. Aborting.")
    process.exit(1)
  }

  for (const t of templates) {
    const slug = slugify(t.title)
    const now = new Date()
    const result = await db.collection("documenttemplates").updateOne(
      { slug },
      {
        $set: {
          title: t.title,
          description: t.description,
          category: CATEGORY,
          bodyHtml: t.bodyHtml,
          status: "published",
          updatedBy: admin._id,
          publishedAt: now,
          updatedAt: now,
        },
        $setOnInsert: {
          slug,
          usageCount: 0,
          createdBy: admin._id,
          createdAt: now,
        },
      },
      { upsert: true }
    )
    const action = result.upsertedCount > 0 ? "created" : "updated"
    console.log(`${action}: ${t.title} (${slug})`)
  }

  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
