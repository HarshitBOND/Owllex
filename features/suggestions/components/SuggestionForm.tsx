import { CheckCircle2, CircleAlert, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { SuggestionFormData, SuggestionNotice } from "../types"
import { categories } from "../utils"

interface SuggestionFormProps {
  formData: SuggestionFormData
  setFormData: React.Dispatch<React.SetStateAction<SuggestionFormData>>
  notice: SuggestionNotice
  saving: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export function SuggestionForm({ formData, setFormData, notice, saving, onSubmit }: SuggestionFormProps) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Send className="h-4 w-4 text-sidebar-primary" />
        <p className="font-semibold text-gray-900 dark:text-foreground">Submit a new suggestion</p>
      </div>
      <p className="text-sm text-gray-500 dark:text-muted-foreground mb-4">Suggestions are reviewed by support/admin before being publicly visible.</p>

      {notice?.kind === "success" && (
        <div className="mb-4 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {notice.text}
        </div>
      )}

      {notice?.kind === "error" && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <CircleAlert className="h-4 w-4" />
          {notice.text}
        </div>
      )}

      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="grid md:grid-cols-3 gap-3">
          <Input
            value={formData.title}
            onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Suggestion title"
            className="md:col-span-2"
            maxLength={180}
            required
          />
          <select
            value={formData.category}
            onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
            className="w-full h-10 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-input px-3 text-sm dark:text-foreground"
          >
            {categories.filter((cat) => cat !== "All").map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <Textarea
          value={formData.description}
          onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Describe the workflow problem and what should improve"
          rows={4}
          maxLength={5000}
          required
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Suggestion
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
