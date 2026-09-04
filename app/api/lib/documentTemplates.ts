import { z } from "zod";
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories";
import { fieldsSchema, validateTokenParity, type TemplateField } from "@/lib/templates/fields";

export const MIN_PUBLISHED_BODY_CHARS = 40;

export const PUBLISH_BODY_ERROR = "A published template needs a body of at least 40 characters.";

export const templateInputSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(160),
  description: z.string().trim().max(400).default(""),
  category: z.enum(DOCUMENT_CATEGORIES),
  bodyHtml: z.string().min(1, "Body is required").max(200000),
  fields: fieldsSchema.default([]),
  renderMode: z.enum(["html", "pdf-overlay"]).default("html"),
  changeNote: z.string().trim().max(400).default(""),
  status: z.enum(["draft", "published"]).default("draft"),
});

export const templatePatchSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(400).optional(),
    category: z.enum(DOCUMENT_CATEGORIES).optional(),
    bodyHtml: z.string().min(1).max(200000).optional(),
    fields: fieldsSchema.optional(),
    renderMode: z.enum(["html", "pdf-overlay"]).optional(),
    changeNote: z.string().trim().max(400).optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "template"
  );
}

/**
 * Rejects a template whose body and field list disagree.
 *
 * The two failure modes are both invisible from the outside and both reach the
 * advocate: a field nothing renders is a wizard question with no effect, and a
 * token no field describes prints a literal "{{court_name}}" on a document
 * heading to a registry. Catching it at save time is the only place the error
 * can name the key that is wrong.
 */
export function assertTemplateConsistent(bodyHtml: string, fields: TemplateField[]) {
  const errors = validateTokenParity(bodyHtml, fields);
  if (errors.length === 0) return null;
  return errors.length === 1
    ? errors[0]
    : `${errors.length} problems with this template: ${errors.join(" ")}`;
}

/**
 * Stamping cannot be switched on while any field is still unplaced -- the
 * export would silently drop those values onto the floor, and nobody would
 * notice until the form reached the registry with blanks where the parties
 * should be.
 */
export function assertOverlayComplete(fields: TemplateField[]) {
  const unmapped = fields.filter((f) => !f.overlay);
  if (unmapped.length === 0) return null;
  const names = unmapped.map((f) => f.label || f.key).join(", ");
  return `Every field needs a position on the PDF before stamping can be enabled. Still unplaced: ${names}.`;
}
