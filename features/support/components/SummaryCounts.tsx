interface SummaryCountsProps {
  newMessages: number
  newFraud: number
  openNotificationIssues: number
  openBillingIssues: number
  pendingSuggestions: number
}

export function SummaryCounts({
  newMessages,
  newFraud,
  openNotificationIssues,
  openBillingIssues,
  pendingSuggestions,
}: SummaryCountsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <div className="bg-white border border-blue-200 rounded-xl p-4">
        <p className="text-xs text-blue-600 font-medium">New Contacts</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{newMessages}</p>
      </div>
      <div className="bg-white border border-amber-200 rounded-xl p-4">
        <p className="text-xs text-amber-600 font-medium">New Fraud</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{newFraud}</p>
      </div>
      <div className="bg-white border border-brand-200 rounded-xl p-4">
        <p className="text-xs text-brand-600 font-medium">Open Notification Issues</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{openNotificationIssues}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs text-gray-600 font-medium">Open Billing Issues</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{openBillingIssues}</p>
      </div>
      <div className="bg-white border border-violet-200 rounded-xl p-4 col-span-2 lg:col-span-1">
        <p className="text-xs text-violet-600 font-medium">Pending Suggestions</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{pendingSuggestions}</p>
      </div>
    </div>
  )
}
