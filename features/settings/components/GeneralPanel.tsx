"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AccountSettingsState, NoticeState } from "../types"
import { NoticeBanner } from "./NoticeBanner"
import { PanelHeader, Row, RowGroup, Select, Toggle } from "./SettingsPrimitives"

interface GeneralPanelProps {
  account: AccountSettingsState
  setAccount: React.Dispatch<React.SetStateAction<AccountSettingsState>>
  notice: NoticeState
  saving: boolean
  onSave: () => void
}

export function GeneralPanel({ account, setAccount, notice, saving, onSave }: GeneralPanelProps) {
  const update = <K extends keyof AccountSettingsState>(key: K, value: AccountSettingsState[K]) =>
    setAccount((previous) => ({ ...previous, [key]: value }))

  const initials = `${account.firstName?.[0] ?? ""}${account.lastName?.[0] ?? ""}`.toUpperCase() || "•"

  return (
    <>
      <PanelHeader title="General" description="Your profile and how the workspace opens for you." />

      <RowGroup title="Profile">
        <Row label="Avatar">
          <span className="w-9 h-9 rounded-full bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground text-[12px] font-medium flex items-center justify-center">
            {initials}
          </span>
        </Row>

        <Row label="First name">
          <Input
            value={account.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            placeholder="First name"
            className="h-9 w-full sm:w-[260px] text-[13px]"
          />
        </Row>

        <Row label="Last name">
          <Input
            value={account.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            placeholder="Last name"
            className="h-9 w-full sm:w-[260px] text-[13px]"
          />
        </Row>

        <Row label="Email" hint="Managed by your sign-in provider.">
          <Input
            value={account.email}
            readOnly
            className="h-9 w-full sm:w-[260px] text-[13px] bg-gray-50 dark:bg-muted text-gray-500"
          />
        </Row>
      </RowGroup>

      <RowGroup title="Preferences">
        <Row label="Landing page" hint="Where the app opens after you sign in.">
          <Select
            value={account.defaultLandingPage}
            onChange={(value) => update("defaultLandingPage", value as AccountSettingsState["defaultLandingPage"])}
            options={[
              { value: "/dashboard", label: "Dashboard" },
              { value: "/case-tracking", label: "Case Tracking" },
              { value: "/tasks", label: "Tasks" },
              { value: "/invoices", label: "Invoices" },
            ]}
          />
        </Row>

        <Row label="Weekly digest" hint="A Monday email summarising cases, hearings and tasks.">
          <Toggle
            label="Weekly digest email"
            checked={account.weeklyDigestEnabled}
            onChange={(next) => update("weeklyDigestEnabled", next)}
          />
        </Row>

        <Row label="Billing summary on dashboard" hint="Show plan and renewal details on the overview page.">
          <Toggle
            label="Show billing summary on dashboard"
            checked={account.showBillingSummary}
            onChange={(next) => update("showBillingSummary", next)}
          />
        </Row>
      </RowGroup>

      <div className="mt-5">
        <NoticeBanner notice={notice} />
        <Button onClick={onSave} disabled={saving} size="sm">
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Saving
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </>
  )
}
