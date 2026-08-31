import { z } from "zod";
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories";

export const MIN_PUBLISHED_BODY_CHARS = 40;

export const PUBLISH_BODY_ERROR = "A published template needs a body of at least 40 characters.";

export const templateInputSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(160),
  description: z.string().trim().max(400).default(""),
  category: z.enum(DOCUMENT_CATEGORIES),
  bodyHtml: z.string().min(1, "Body is required").max(200000),
  status: z.enum(["draft", "published"]).default("draft"),
});

export const templatePatchSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(400).optional(),
    category: z.enum(DOCUMENT_CATEGORIES).optional(),
    bodyHtml: z.string().min(1).max(200000).optional(),
    status: z.enum(["draft", "published"]).optional(),
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
