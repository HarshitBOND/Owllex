"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { BillingTransaction, NoticeState, SubscriptionState } from "../types"
import { formatAmount, formatDateValue } from "../utils"
import { NoticeBanner } from "./NoticeBanner"
import { PanelHeader, Pill, Row, RowGroup } from "./SettingsPrimitives"

interface BillingPanelProps {
  subscription: SubscriptionState | null
  transactions: BillingTransaction[]
  notice: NoticeState
  loading: boolean
  onRunSubscriptionAction: (action: "cancel" | "renew") => void
  onRefresh: () => void
}

export function BillingPanel({
  subscription,
  transactions,
  notice,
  loading,
  onRunSubscriptionAction,
  onRefresh,
}: BillingPanelProps) {
  const caseUsage = subscription
    ? subscription.caseLimit === null
      ? `${subscription.casesUsed} of unlimited`
      : `${subscription.casesUsed} of ${subscription.caseLimit}`
    : "—"

  const renewal = subscription?.renewalDate
    ? new Date(subscription.renewalDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : subscription?.cancelAtPeriodEnd
      ? "Cancels at period end"
      : "Not scheduled"

  return (
    <>
      <PanelHeader title="Billing" description="Your plan, renewal and payment history." />

      <NoticeBanner notice={notice} />

      <RowGroup title="Plan">
        <Row label="Current plan">
          <div className="flex items-center gap-2">
            <Pill tone="brand">{subscription?.plan || "trial"}</Pill>
            <Pill tone={subscription?.status === "active" ? "neutral" : "warn"}>
              {subscription?.status || "active"}
            </Pill>
          </div>
        </Row>

        <Row label="Billing cycle">
          <p className="text-[13px] text-gray-700 dark:text-foreground capitalize">
            {subscription?.billingCycle || "—"}
          </p>
        </Row>

        <Row label="Renews">
          <p className="text-[13px] text-gray-700 dark:text-foreground">{renewal}</p>
        </Row>

        <Row label="Cases tracked" hint="Counts against your plan's case limit.">
          <p className="text-[13px] text-gray-700 dark:text-foreground tabular-nums">{caseUsage}</p>
        </Row>

        <Row label="Manage subscription" align="start">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => onRunSubscriptionAction("cancel")} disabled={loading}>
              Cancel at period end
            </Button>
            <Button variant="outline" size="sm" onClick={() => onRunSubscriptionAction("renew")} disabled={loading}>
              Renew
            </Button>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              Refresh
            </Button>
          </div>
        </Row>
      </RowGroup>

      <RowGroup title="Payment history">
        {transactions.length === 0 ? (
          <div className="py-6 text-[13px] text-gray-500 dark:text-muted-foreground">No transactions yet.</div>
        ) : (
          transactions.map((transaction) => (
            <div key={transaction._id} className="py-4 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13.5px] font-medium text-gray-900 dark:text-foreground tabular-nums">
                  {formatAmount(transaction.amount, transaction.currency || "INR")}
                </p>
                <span
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded-full border capitalize",
                    transaction.status === "completed"
                      ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border-brand-200 dark:border-brand-500/30"
                      : transaction.status === "failed"
                        ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30"
                        : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
                  )}
                >
                  {transaction.status}
                </span>
              </div>

              <p className="text-[12.5px] text-gray-500 dark:text-muted-foreground">
                {transaction.paymentGateway} • {formatDateValue(transaction.createdAt)}
              </p>

              {transaction.description ? (
                <p className="text-[12.5px] text-gray-600 dark:text-gray-400">{transaction.description}</p>
              ) : null}

              {transaction.failureReason ? (
                <p className="text-[12.5px] text-red-600 dark:text-red-400">Failure: {transaction.failureReason}</p>
              ) : null}

              {transaction.receiptUrl || transaction.invoiceUrl ? (
                <div className="flex items-center gap-3 text-[12.5px]">
                  {transaction.receiptUrl ? (
                    <a href={transaction.receiptUrl} target="_blank" rel="noreferrer" className="text-sidebar-primary underline">
                      Receipt
                    </a>
                  ) : null}
                  {transaction.invoiceUrl ? (
                    <a href={transaction.invoiceUrl} target="_blank" rel="noreferrer" className="text-sidebar-primary underline">
                      Invoice
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </RowGroup>
    </>
  )
}
