"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle } from "lucide-react"
import Navbar from "@/components/layout/navbar"
import { cn } from "@/lib/utils"
import TemplateWizard, { type Provenance } from "@/features/draft-documents/components/TemplateWizard"
import type { FieldValues } from "@/lib/templates/render"
import type { TemplateField } from "@/lib/templates/fields"

type TemplateDetail = {
  id: string
  title: string
  bodyHtml: string
  fields: TemplateField[]
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const router = useRouter()
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-sm text-center rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-8">
        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
        <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-foreground">
          Couldn&apos;t start document
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{message}</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-medium border border-gray-200 dark:border-border rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-secondary transition-colors"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.push("/draft-documents")}
            className="text-xs font-medium text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90 transition-opacity"
          >
            Back to documents
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Creates the draft immediately. Used for a blank copy, for an AI-drafted
 * document, and for any template with no fields to ask about.
 */
function CreateImmediately({
  templateId,
  prompt,
  caseId,
  corpusId,
}: {
  templateId: string | null
  prompt: string | null
  caseId: string | null
  corpusId: string | null
}) {
  const router = useRouter()
  const started = useRef(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (started.current) return
    started.current = true

    fetch("/api/draft-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(templateId ? { templateId } : {}),
        ...(prompt ? { seedPrompt: prompt.slice(0, 2000) } : {}),
        ...(caseId ? { caseId } : {}),
        ...(corpusId ? { corpusId } : {}),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.id) router.replace(`/draft-documents/${data.id}`)
        else setError(data.error || "We couldn't start that document.")
      })
      .catch(() => setError("We couldn't reach the server. Check your connection and try again."))
  }, [router, templateId, prompt, caseId, corpusId])

  if (error) {
    return (
      <ErrorCard
        message={error}
        onRetry={() => {
          started.current = false
          setError("")
          window.location.reload()
        }}
      />
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      <p className="text-sm text-gray-500 dark:text-muted-foreground">Preparing your document...</p>
    </div>
  )
}

/**
 * The guided path: load the form, fill in everything the case and corpus
 * already know, then ask only what is left.
 */
function GuidedFill({
  templateId,
  caseId,
  corpusId,
}: {
  templateId: string
  caseId: string | null
  corpusId: string | null
}) {
  const router = useRouter()

  const [template, setTemplate] = useState<TemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [prefill, setPrefill] = useState<FieldValues>({})
  const [prefillProvenance, setPrefillProvenance] = useState<Provenance>({})
  const [prefilling, setPrefilling] = useState(!!(caseId || corpusId))
  const [prefillNote, setPrefillNote] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  // Set only for a 404 from the create call -- the template, case or corpus
  // this wizard was built against is genuinely gone, not something another
  // click on "Create the document" will fix. Retrying resends the same
  // answers rather than making the advocate redo the whole form.
  const [submitFatal, setSubmitFatal] = useState(false)
  const [remember, setRemember] = useState(true)
  const lastSubmitRef = useRef<{ values: FieldValues; provenance: Provenance } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/document-templates/${templateId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.success) setTemplate(data.template)
        else setLoadError(data.error || "That form could not be opened.")
      })
      .catch(() => !cancelled && setLoadError("We couldn't reach the server."))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [templateId])

  useEffect(() => {
    if (!caseId && !corpusId) return
    let cancelled = false

    fetch(`/api/document-templates/${templateId}/prefill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(corpusId ? { corpusId } : {}), ...(caseId ? { caseId } : {}) }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success) return
        setPrefill(data.values || {})
        setPrefillProvenance(data.provenance || {})

        const filled = (data.fromCase || 0) + (data.fromFacts || 0) + (data.fromDocuments || 0)
        if (data.note) setPrefillNote(data.note)
        else if (filled > 0) {
          const parts: string[] = []
          if (data.fromCase) parts.push(`${data.fromCase} from the case record`)
          if (data.fromFacts) parts.push(`${data.fromFacts} from earlier forms`)
          if (data.fromDocuments) parts.push(`${data.fromDocuments} from your documents`)
          setPrefillNote(
            `Filled in ${filled} ${filled === 1 ? "answer" : "answers"} for you — ${parts.join(", ")}. Check them as you go.`
          )
        }
      })
      // Prefill is a convenience. If it fails the advocate is simply asked
      // everything, which is exactly what would have happened without it.
      .catch(() => {})
      .finally(() => !cancelled && setPrefilling(false))

    return () => {
      cancelled = true
    }
  }, [templateId, caseId, corpusId])

  const submit = useCallback(
    async (values: FieldValues, provenance: Provenance) => {
      lastSubmitRef.current = { values, provenance }
      setSubmitting(true)
      setSubmitError("")
      try {
        const res = await fetch("/api/draft-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId,
            fieldValues: values,
            fieldProvenance: provenance,
            ...(caseId ? { caseId } : {}),
            ...(corpusId ? { corpusId, rememberInCorpus: remember } : {}),
          }),
        })
        const data = await res.json()
        if (data.success && data.id) {
          router.replace(`/draft-documents/${data.id}`)
          return
        }
        // A 404 here means the template (or the linked case/corpus) is gone --
        // the advocate has a fully filled-out form and nowhere for it to go,
        // which a red line under the button is too easy to miss. Surface it
        // the same way a load-time failure is surfaced instead.
        if (res.status === 404) setSubmitFatal(true)
        setSubmitError(data.error || "We couldn't create that document.")
      } catch {
        setSubmitError("We couldn't reach the server.")
      } finally {
        setSubmitting(false)
      }
    },
    [templateId, caseId, corpusId, remember, router]
  )

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError || !template) {
    return <ErrorCard message={loadError || "That form could not be opened."} onRetry={() => window.location.reload()} />
  }

  if (submitFatal) {
    return (
      <ErrorCard
        message={submitError || "This form is no longer available. Your answers weren't lost -- try again, or start over from the library."}
        onRetry={() => {
          setSubmitFatal(false)
          setSubmitError("")
          if (lastSubmitRef.current) submit(lastSubmitRef.current.values, lastSubmitRef.current.provenance)
        }}
      />
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col px-3 sm:px-4 md:px-6 pb-4">
      <TemplateWizard
        title={template.title}
        bodyHtml={template.bodyHtml}
        fields={template.fields}
        initialValues={prefill}
        initialProvenance={prefillProvenance}
        autofilling={prefilling}
        autofillNote={prefillNote}
        submitting={submitting}
        error={submitError}
        corpusLinked={!!corpusId}
        remember={remember}
        onRememberChange={setRemember}
        onSubmit={submit}
        onCancel={() => router.push("/draft-documents/templates")}
      />
    </div>
  )
}

function Creating() {
  const searchParams = useSearchParams()

  const templateId = searchParams.get("templateId")
  const mode = searchParams.get("mode")
  const prompt = searchParams.get("prompt")
  const caseId = searchParams.get("caseId")
  const corpusId = searchParams.get("corpusId")

  if (mode === "wizard" && templateId) {
    return <GuidedFill templateId={templateId} caseId={caseId} corpusId={corpusId} />
  }

  return (
    <CreateImmediately templateId={templateId} prompt={prompt} caseId={caseId} corpusId={corpusId} />
  )
}

export default function Page() {
  return (
    <div
      className={cn(
        "bg-[#F3F5F9] dark:bg-background h-screen w-full transition-all duration-300 flex flex-col pb-20 lg:pb-0",
        "lg:ml-[var(--sidebar-offset)]",
      )}
    >
      <div className="px-3 sm:px-4 md:px-6 pt-3 md:pt-4 shrink-0">
        <Navbar withBack location="Draft Documents" />
      </div>
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
          </div>
        }
      >
        <Creating />
      </Suspense>
    </div>
  )
}
