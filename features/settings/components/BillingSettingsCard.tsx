import { ReceiptText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { BillingTransaction, NoticeState, SubscriptionState } from "../types"
import { formatAmount, formatDateValue } from "../utils"
import { NoticeBanner } from "./NoticeBanner"

interface BillingSettingsCardProps {
  subscription: SubscriptionState | null
  transactions: BillingTransaction[]
  notice: NoticeState
  loading: boolean
  onRunSubscriptionAction: (action: "cancel" | "renew") => void
  onRefresh: () => void
}

export function BillingSettingsCard({
  subscription,
  transactions,
  notice,
  loading,
  onRunSubscriptionAction,
  onRefresh,
}: BillingSettingsCardProps) {
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <ReceiptText className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        <h3 className="font-semibold text-gray-900 dark:text-foreground">Billing Settings</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-muted-foreground mb-4">Monitor plan lifecycle and transaction history.</p>

      <NoticeBanner notice={notice} />

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-md border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted p-3">
          <p className="text-xs text-gray-500 dark:text-muted-foreground">Plan</p>
          <p className="font-semibold text-gray-900 dark:text-foreground mt-0.5 uppercase">{subscription?.plan || "free"}</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted p-3">
          <p className="text-xs text-gray-500 dark:text-muted-foreground">Status</p>
          <p className="font-semibold text-gray-900 dark:text-foreground mt-0.5 capitalize">{subscription?.status || "active"}</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted p-3">
          <p className="text-xs text-gray-500 dark:text-muted-foreground">Case Usage</p>
          <p className="font-semibold text-gray-900 dark:text-foreground mt-0.5">
            {subscription
              ? subscription.caseLimit === null
                ? `${subscription.casesUsed} / Unlimited`
                : `${subscription.casesUsed} / ${subscription.caseLimit}`
              : "—"}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted p-3">
          <p className="text-xs text-gray-500 dark:text-muted-foreground">Renewal</p>
          <p className="font-semibold text-gray-900 dark:text-foreground mt-0.5">
            {subscription?.renewalDate
              ? new Date(subscription.renewalDate).toLocaleDateString("en-IN")
              : subscription?.cancelAtPeriodEnd
                ? "Cancels at period end"
                : "Not scheduled"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <Button
          variant="outline"
          onClick={() => onRunSubscriptionAction("cancel")}
          disabled={loading}
        >
          Cancel at Period End
        </Button>
        <Button
          variant="outline"
          onClick={() => onRunSubscriptionAction("renew")}
          disabled={loading}
        >
          Renew
        </Button>
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          Refresh Billing Data
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
          <p className="font-medium text-gray-900 dark:text-foreground">Recent Transactions</p>
          <p className="text-xs text-gray-500 dark:text-muted-foreground">{transactions.length} shown</p>
        </div>

        {transactions.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 dark:text-muted-foreground text-center">No transactions available.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-border">
            {transactions.map((transaction) => (
              <div key={transaction._id} className="p-4 text-sm space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-900 dark:text-foreground">
                    {formatAmount(transaction.amount, transaction.currency || "INR")}
                  </p>
                  <span
                    className={cn(
                      "text-xs px-2 py-1 rounded-full border",
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

                <p className="text-xs text-gray-500 dark:text-muted-foreground">
                  {transaction.paymentGateway} • {formatDateValue(transaction.createdAt)}
                </p>

                {transaction.description ? (
                  <p className="text-xs text-gray-600 dark:text-gray-400">{transaction.description}</p>
                ) : null}

                {transaction.failureReason ? (
                  <p className="text-xs text-red-600 dark:text-red-400">Failure: {transaction.failureReason}</p>
                ) : null}

                <div className="flex items-center gap-3 text-xs">
                  {transaction.receiptUrl ? (
                    <a
                      href={transaction.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sidebar-primary underline"
                    >
                      Receipt
                    </a>
                  ) : null}
                  {transaction.invoiceUrl ? (
                    <a
                      href={transaction.invoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sidebar-primary underline"
                    >
                      Invoice
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
