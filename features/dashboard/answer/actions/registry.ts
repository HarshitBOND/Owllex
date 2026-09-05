"use client"

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"
import type { ActionResult, AgentAction } from "@/lib/ai/actions"

/**
 * What each proposed action actually does, once the advocate has approved it.
 *
 * Client-side, because most of these end in navigation: the advocate is taken
 * to the page where the work happens, with everything the assistant already
 * knows carried across in the record it just created. The `summary` each one
 * returns is written back into the conversation as the tool result, so it is
 * also what the model reads before deciding what to propose next -- keep it
 * factual, and carry ids forward in `data` for the actions that need them.
 */

export type ActionContext = {
  router: AppRouterInstance
  /** The corpus in scope, so work done here is filed against the right matter. */
  activeCorpusId: string | null
  setActiveCorpusId: (id: string | null) => void
  refreshCorpora: () => Promise<void>
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || `Request failed (${response.status})`)
  }
  return data
}

/**
 * Prints a draft without routing the advocate anywhere.
 *
 * The PDF the export route already produces is loaded into a hidden frame and
 * printed from there, so what reaches the printer is the same file they would
 * have downloaded -- not a screenshot of the editor, which is what printing the
 * page itself would give.
 */
async function printPdf(url: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("The document could not be prepared for printing.")

  const objectUrl = URL.createObjectURL(await response.blob())
  const frame = document.createElement("iframe")
  frame.style.position = "fixed"
  frame.style.right = "0"
  frame.style.bottom = "0"
  frame.style.width = "0"
  frame.style.height = "0"
  frame.style.border = "0"

  await new Promise<void>((resolve, reject) => {
    frame.onload = () => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
        resolve()
      } catch {
        reject(new Error("The browser refused to open the print dialog."))
      }
    }
    frame.onerror = () => reject(new Error("The document could not be loaded for printing."))
    frame.src = objectUrl
    document.body.appendChild(frame)
  })

  // The frame has to outlive the print dialog, which is modal and gives no
  // completion event -- removing it immediately cancels the job in some
  // browsers. A minute is far longer than any dialog stays open.
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
    frame.remove()
  }, 60_000)
}

async function execute(action: AgentAction, ctx: ActionContext): Promise<ActionResult> {
  switch (action.kind) {
    case "saveToCorpus": {
      const created = await postJson("/api/corpus", {
        name: action.corpusName,
        description: action.description ?? "",
      })
      const corpusId: string = created.corpus.id

      let remembered = 0
      if (action.facts.length > 0) {
        const written = await postJson(`/api/corpus/${corpusId}/facts`, { facts: action.facts })
        remembered = written.written ?? 0
      }

      // Making it active is the point: every later turn in this conversation
      // then searches and files against this matter rather than nothing.
      ctx.setActiveCorpusId(corpusId)
      await ctx.refreshCorpora()

      return {
        ok: true,
        summary: remembered
          ? `Saved as the corpus "${action.corpusName}", now active, remembering ${remembered} detail${remembered === 1 ? "" : "s"}.`
          : `Saved as the corpus "${action.corpusName}" and made it active.`,
        data: { corpusId },
      }
    }

    case "draftDocument": {
      const created = await postJson("/api/draft-documents", {
        title: action.title,
        seedPrompt: action.instructions,
        ...(ctx.activeCorpusId ? { corpusId: ctx.activeCorpusId, rememberInCorpus: true } : {}),
      })
      const draftId: string = created.id

      // The editor's assistant starts drafting on its own when the draft
      // carries a seedPrompt and has no messages yet, so opening it is all
      // that is needed here.
      ctx.router.push(`/draft-documents/${draftId}`)

      return {
        ok: true,
        summary: `Opened the editor and started drafting "${action.title}". The advocate can watch it there.`,
        data: { draftId, title: action.title },
      }
    }

    case "generateWorkflow": {
      const params = new URLSearchParams({ brief: action.brief, title: action.title })
      if (ctx.activeCorpusId) params.set("corpusId", ctx.activeCorpusId)
      ctx.router.push(`/ai-workflow?${params.toString()}`)

      return {
        ok: true,
        summary: `Opened the workflow canvas and started building "${action.title}".`,
        data: { title: action.title },
      }
    }

    case "printDocument": {
      await printPdf(`/api/draft-documents/${action.draftId}/export?format=pdf`)
      return {
        ok: true,
        summary: `Sent "${action.title}" to the printer.`,
        data: { draftId: action.draftId },
      }
    }

    case "emailDocument": {
      await postJson(`/api/draft-documents/${action.draftId}/email`, {
        to: action.to,
        subject: action.subject,
        message: action.message,
      })
      return {
        ok: true,
        summary: `Emailed the document to ${action.to}.`,
        data: { draftId: action.draftId, to: action.to },
      }
    }
  }
}

/**
 * Runs an approved action, turning any failure into a result the model can read
 * rather than an exception that would leave the tool call unanswered.
 */
export async function runAction(action: AgentAction, ctx: ActionContext): Promise<ActionResult> {
  try {
    return await execute(action, ctx)
  } catch (error) {
    const message = error instanceof Error ? error.message : "The action could not be completed."
    return { ok: false, summary: `That didn't work: ${message}` }
  }
}
