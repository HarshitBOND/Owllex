import { generateObject } from "ai"
import { z } from "zod"
import { modelFor } from "@/lib/ai/provider"
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories"
import { ALLOWED_TAGS } from "@/lib/html/allowlist"
import { CASE_SOURCES } from "@/lib/templates/case-source"
import { COLUMN_TYPES, FIELD_TYPES, fieldsSchema, type TemplateField } from "@/lib/templates/fields"

/**
 * Turns the text of a court's PDF into a fillable template.
 *
 * The model is asked for two things that have to agree: a body reproducing the
 * form's structure with `{{token}}` where each blank was, and the field list
 * describing those tokens. They are validated against each other by the caller
 * before anything is stored, because a body and field list that disagree fail
 * silently -- a field nothing renders, or a literal "{{court_name}}" printed on
 * a document going to a registry.
 *
 * Output is always a draft. This is a reconstruction of a court document by a
 * language model, and it does not reach an advocate until an admin has put it
 * beside the original and said yes.
 */

const EXTRACTION_TIMEOUT_MS = 120_000

/**
 * Deliberately looser than the stored schema: optional keys are omitted rather
 * than defaulted so the model is not pushed into inventing options or columns
 * for fields that have none. fieldsSchema fills the defaults afterwards.
 */
const aiFieldSchema = z.object({
  key: z
    .string()
    .describe("snake_case identifier, e.g. court_name. Lowercase letters, digits and underscores."),
  label: z.string().describe("The form's own wording for this blank, verbatim, e.g. \"Date of Hearing\"."),
  help: z.string().optional().describe("One short line only if the label alone would be unclear."),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string()).optional().describe("For type=select: the exact choices printed on the form."),
  columns: z
    .array(
      z.object({
        key: z.string(),
        label: z.string().describe("The column heading, verbatim."),
        type: z.enum(COLUMN_TYPES),
        required: z.boolean(),
      })
    )
    .optional()
    .describe("For type=table: one entry per column, left to right."),
  required: z.boolean().describe("True only if the form cannot be filed without it."),
  group: z.string().describe('A short section name for batching questions, e.g. "Case details".'),
  source: z
    .enum(CASE_SOURCES)
    .nullable()
    .describe("Which case-record field can fill this without asking, or null."),
})

export const extractionSchema = z.object({
  title: z.string().describe("The form's own title, e.g. \"Address Form\"."),
  description: z.string().describe("One sentence saying what the form is for and who files it."),
  category: z.enum(DOCUMENT_CATEGORIES),
  bodyHtml: z.string(),
  fields: z.array(aiFieldSchema),
})

export const TEMPLATE_EXTRACTION_PROMPT = `You convert Indian court forms into fillable templates.

You are given the text of a blank form issued by a court. Reproduce it as HTML, and
replace every blank on it with a named token.

STRUCTURE
- Reproduce the form's own wording verbatim. Do not improve, modernise or reorder it.
  An advocate is going to file this: the registry expects the words the court printed.
- Use only these tags: ${ALLOWED_TAGS.join(", ")}.
- Never emit inline styles, classes, ids, colours, widths or attributes of any kind
  except colspan and rowspan. Everything else is stripped, so it is wasted output.
- Use <h1> for the form's title, <p> for its lines, <table> for its ruled tables.

TOKENS
- Every blank -- a run of underscores, a dotted line, an empty box, an empty table
  cell -- becomes a token: {{field_key}}.
- Keep the form's printed label as ordinary text, and put the token where the blank
  was. "Date of Hearing ________" becomes "Date of Hearing {{hearing_date}}".
- Never leave a run of underscores in the body. If it was a blank, it is a token.

TABLES THAT REPEAT
- A table with several identical blank rows is ONE field of type "table", not one
  field per row.
- Emit the heading row with <th>, then exactly ONE body <tr> whose cells hold
  {{table_key.column_key}} tokens. Do not emit the other blank rows -- the app
  repeats that single row once per entry the advocate adds.
- Example, for a table field keyed "parties" with columns name and tehsil:
  <table><tr><th>Name</th><th>Tehsil</th></tr>
  <tr><td>{{parties.name}}</td><td>{{parties.tehsil}}</td></tr></table>

FIELDS
- Return exactly one field per distinct token key. Every token in the body must have
  a field, and every field must appear in the body. This is checked, and a mismatch
  rejects the import.
- type "select" only where the form itself prints the choices, e.g.
  "Plaintiff/ Defendant/ Applicant" -- put each choice in options and write the label
  as a question the advocate can answer.
- type "date" for dates, "number" for amounts and counts, "longtext" for anything
  running to a paragraph, "text" otherwise.
- required is true only where the form cannot be filed without it. Be sparing:
  a required field the advocate cannot answer blocks them.
- source: set it only where a case record plainly holds that value -- the court's
  name, the case number, the next hearing date. Anything about a party's address,
  caste, or parentage is not on a case record: leave those null.
- group: batch the fields into a few short sections following the form's own layout,
  e.g. "Case details", then "Party details".`

export type ExtractedTemplate = {
  title: string
  description: string
  category: (typeof DOCUMENT_CATEGORIES)[number]
  bodyHtml: string
  fields: TemplateField[]
}

export async function extractTemplateFromText(opts: {
  text: string
  filename: string
  modelKey: string
}): Promise<{ template: ExtractedTemplate; usage: unknown }> {
  const { object, usage } = await generateObject({
    model: modelFor(opts.modelKey),
    system: TEMPLATE_EXTRACTION_PROMPT,
    schema: extractionSchema,
    prompt: `Convert this court form into a template.\n\nFile: ${opts.filename}\n\n<form>\n${opts.text}\n</form>`,
    abortSignal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
  })

  // fieldsSchema applies the defaults the AI schema deliberately left off, and
  // rejects the structural mistakes worth catching before an admin sees them --
  // a duplicate key, a select with no options, a table with no columns.
  const fields = fieldsSchema.parse(
    object.fields.map((f) => ({
      key: f.key,
      label: f.label,
      help: f.help ?? "",
      type: f.type,
      options: f.options ?? [],
      columns: (f.columns ?? []).map((c) => ({
        key: c.key,
        label: c.label,
        type: c.type,
        options: [],
        required: c.required,
      })),
      required: f.required,
      group: f.group ?? "",
      source: f.source ?? null,
      overlay: null,
    }))
  )

  return {
    template: {
      title: object.title,
      description: object.description,
      category: object.category,
      bodyHtml: object.bodyHtml,
      fields,
    },
    usage,
  }
}
