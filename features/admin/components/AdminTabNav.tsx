import { cn } from "@/lib/utils"
import type { Tab } from "../types"
import { tabs } from "../utils"

interface AdminTabNavProps {
  activeTab: Tab
  onSelect: (tab: Tab) => void
}

export function AdminTabNav({ activeTab, onSelect }: AdminTabNavProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-sidebar-primary text-sidebar-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
