import { Loader2, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AccountSettingsState, NoticeState } from "../types"
import { NoticeBanner } from "./NoticeBanner"

interface AccountPreferencesCardProps {
  account: AccountSettingsState
  setAccount: React.Dispatch<React.SetStateAction<AccountSettingsState>>
  notice: NoticeState
  saving: boolean
  onSave: () => void
}

export function AccountPreferencesCard({
  account,
  setAccount,
  notice,
  saving,
  onSave,
}: AccountPreferencesCardProps) {
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserRound className="h-4 w-4 text-blue-600 dark:text-sky-400" />
        <h3 className="font-semibold text-gray-900 dark:text-foreground">Account Preferences</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-muted-foreground mb-4">Update profile metadata and account-level preferences.</p>

      <NoticeBanner notice={notice} />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Input
          placeholder="First name"
          value={account.firstName}
          onChange={(event) =>
            setAccount((previous) => ({ ...previous, firstName: event.target.value }))
          }
        />
        <Input
          placeholder="Last name"
          value={account.lastName}
          onChange={(event) =>
            setAccount((previous) => ({ ...previous, lastName: event.target.value }))
          }
        />
        <Input
          placeholder="Email"
          value={account.email}
          readOnly
          className="bg-gray-50"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-3 mt-3">
        <select
          value={account.defaultLandingPage}
          onChange={(event) =>
            setAccount((previous) => ({
              ...previous,
              defaultLandingPage: event.target.value as AccountSettingsState["defaultLandingPage"],
            }))
          }
          className="h-10 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-input px-3 text-sm dark:text-foreground"
        >
          <option value="/dashboard">Default Landing: Dashboard</option>
          <option value="/case-tracking">Default Landing: Case Tracking</option>
          <option value="/tasks">Default Landing: Tasks</option>
          <option value="/invoices">Default Landing: Invoices</option>
        </select>

        <label className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-border px-3 h-10 text-sm text-gray-700 dark:text-foreground">
          <input
            type="checkbox"
            checked={account.weeklyDigestEnabled}
            onChange={(event) =>
              setAccount((previous) => ({
                ...previous,
                weeklyDigestEnabled: event.target.checked,
              }))
            }
          />
          Weekly digest email
        </label>

        <label className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-border px-3 h-10 text-sm text-gray-700 dark:text-foreground">
          <input
            type="checkbox"
            checked={account.showBillingSummary}
            onChange={(event) =>
              setAccount((previous) => ({
                ...previous,
                showBillingSummary: event.target.checked,
              }))
            }
          />
          Show billing summary on dashboard
        </label>
      </div>

      <div className="flex justify-end mt-4">
        <Button onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Account Preferences"
          )}
        </Button>
      </div>
    </div>
  )
}
