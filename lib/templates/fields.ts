import { z } from "zod"

/**
 * The field schema is the contract every filling path shares.
 *
 * A template used to be one opaque blob of HTML whose blanks were literal
 * underscores. A run of underscores is not a field: nothing can fill it, so the
 * wizard, the AI, the case record and the corpus all had no purchase on a
 * document. Naming the blanks is what makes all four possible at once, and this
 * file is the single definition of what a name means -- the Mongo schema, the
 * admin API validators and the renderer all derive from here rather than
 * restating it and drifting apart.
 */

export const FIELD_TYPES = ["text", "longtext", "date", "number", "select", "table"] as const
export type FieldType = (typeof FIELD_TYPES)[number]

/** Column types are the scalar subset -- a table cannot nest a table. */
export const COLUMN_TYPES = ["text", "date", "number", "select"] as const
export type ColumnType = (typeof COLUMN_TYPES)[number]

/**
 * A field key has to survive being written into a `{{token}}`, split on ".",
 * and used as an object key, so it is deliberately narrower than a slug.
 */
export const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/

const fieldKeySchema = z
  .string()
  .regex(FIELD_KEY_RE, "Field keys are lowercase letters, digits and underscores, starting with a letter")

export const columnSchema = z.object({
  key: fieldKeySchema,
  label: z.string().trim().min(1).max(120),
  type: z.enum(COLUMN_TYPES).default("text"),
  options: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  required: z.boolean().default(false),
})

/**
 * Overlay geometry is stored in PDF user-space points with the origin at the
 * bottom-left, which is pdf-lib's own coordinate system. Keeping the stored
 * form identical to the drawing form means the y-axis is flipped exactly once,
 * in the admin mapper, instead of being flipped again at every draw site.
 */
export const overlaySchema = z.object({
  page: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fontSize: z.number().min(4).max(72).default(10),
  align: z.enum(["left", "center", "right"]).default("left"),
  /** Table fields only: the vertical pitch between repeated rows, and how many fit. */
  rowHeight: z.number().positive().optional(),
  maxRows: z.number().int().min(1).max(60).optional(),
  /** Table fields only: per-column boxes, keyed by column key, for the first row. */
  columns: z
    .record(
      z.string(),
      z.object({
        x: z.number(),
        width: z.number().positive(),
        align: z.enum(["left", "center", "right"]).default("left"),
      })
    )
    .optional(),
})

export const fieldSchema = z.object({
  key: fieldKeySchema,
  label: z.string().trim().min(1).max(160),
  help: z.string().trim().max(300).default(""),
  type: z.enum(FIELD_TYPES).default("text"),
  options: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  columns: z.array(columnSchema).max(20).default([]),
  required: z.boolean().default(false),
  group: z.string().trim().max(80).default(""),
  /**
   * Where a value may come from without asking -- "case.courtName" and the
   * like. A hint, never a guarantee: if the source resolves to nothing, or no
   * case is linked at all, the field falls through to being asked. Nothing may
   * end up silently blank because its source was missing.
   */
  source: z.string().trim().max(80).nullable().default(null),
  overlay: overlaySchema.nullable().default(null),
})

export type TemplateField = z.infer<typeof fieldSchema>
export type TemplateColumn = z.infer<typeof columnSchema>
export type FieldOverlay = z.infer<typeof overlaySchema>

export const fieldsSchema = z
  .array(fieldSchema)
  .max(120)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>()
    for (const [i, field] of fields.entries()) {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "key"],
          message: `Duplicate field key "${field.key}"`,
        })
      }
      seen.add(field.key)

      if (field.type === "select" && field.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "options"],
          message: `Field "${field.key}" is a select but lists no options`,
        })
      }
      if (field.type === "table") {
        if (field.columns.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, "columns"],
            message: `Field "${field.key}" is a table but has no columns`,
          })
        }
        const cols = new Set<string>()
        for (const [j, col] of field.columns.entries()) {
          if (cols.has(col.key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, "columns", j, "key"],
              message: `Duplicate column key "${col.key}" in table "${field.key}"`,
            })
          }
          cols.add(col.key)
        }
      } else if (field.columns.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "columns"],
          message: `Only a table field can define columns (field "${field.key}")`,
        })
      }
    }
  })

/* ------------------------------------------------------------------ tokens */

/**
 * Matches `{{court_name}}` and `{{parties.tehsil}}`. Whitespace inside the
 * braces is tolerated because the extraction model emits it about a third of
 * the time and rejecting the import over a space would be absurd.
 */
export const TOKEN_RE = /\{\{\s*([a-z][a-z0-9_]*)(?:\.([a-z][a-z0-9_]*))?\s*\}\}/g

export type Token = { raw: string; key: string; column: string | null }

export function extractTokens(bodyHtml: string): Token[] {
  const tokens: Token[] = []
  for (const match of bodyHtml.matchAll(TOKEN_RE)) {
    tokens.push({ raw: match[0], key: match[1], column: match[2] ?? null })
  }
  return tokens
}

/**
 * Every token must name a field and every field must appear in the body.
 *
 * A template whose body and field list disagree fails in a way that is very
 * hard to read from the outside: a field nothing renders looks like a wizard
 * question with no effect, and a token no field describes renders as a literal
 * "{{court_name}}" on a document heading to a registry. Both are caught here,
 * at save time, where the message can name the offending key.
 */
export function validateTokenParity(bodyHtml: string, fields: TemplateField[]): string[] {
  const errors: string[] = []
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const tokens = extractTokens(bodyHtml)

  const referenced = new Set<string>()
  for (const token of tokens) {
    const field = byKey.get(token.key)
    if (!field) {
      errors.push(`The body uses {{${token.key}}} but no field defines "${token.key}".`)
      continue
    }
    referenced.add(token.key)

    if (field.type === "table") {
      if (!token.column) {
        errors.push(`"${field.key}" is a table, so the body must use {{${field.key}}.<column>}, not {{${field.key}}}.`)
      } else if (!field.columns.some((c) => c.key === token.column)) {
        errors.push(`The body uses {{${token.key}.${token.column}}} but table "${field.key}" has no column "${token.column}".`)
      }
    } else if (token.column) {
      errors.push(`"${field.key}" is not a table, so {{${token.key}.${token.column}}} is not valid.`)
    }
  }

  for (const field of fields) {
    if (!referenced.has(field.key)) {
      errors.push(`Field "${field.key}" (${field.label}) never appears in the body.`)
    }
  }

  return errors
}
