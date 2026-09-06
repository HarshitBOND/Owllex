import { Ban, CheckCircle2, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SubscriptionPlan, UserRecord } from "../types"
import { SUBSCRIPTION_PLAN_OPTIONS } from "../types"
import { formatDate, formatDateTime, roleBadge } from "../utils"
import { Pagination } from "./Pagination"

interface UsersTabProps {
  users: UserRecord[]
  usersTotal: number
  usersPage: number
  usersTotalPages: number
  usersSearch: string
  setUsersSearch: (value: string) => void
  usersRoleFilter: string
  setUsersRoleFilter: (value: string) => void
  usersBannedFilter: string
  setUsersBannedFilter: (value: string) => void
  banningId: string | null
  changingPlanId: string | null
  onSearch: (page?: number) => void
  onBanToggle: (userId: string, currentlyBanned: boolean) => void
  onPlanChange: (userId: string, plan: SubscriptionPlan) => void
}

export function UsersTab({
  users,
  usersTotal,
  usersPage,
  usersTotalPages,
  usersSearch,
  setUsersSearch,
  usersRoleFilter,
  setUsersRoleFilter,
  usersBannedFilter,
  setUsersBannedFilter,
  banningId,
  changingPlanId,
  onSearch,
  onBanToggle,
  onPlanChange,
}: UsersTabProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={usersSearch}
              onChange={(e) => setUsersSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="Search by name or email..."
              className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <select
            value={usersRoleFilter}
            onChange={(e) => { setUsersRoleFilter(e.target.value); setTimeout(() => onSearch(), 0) }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
          <select
            value={usersBannedFilter}
            onChange={(e) => { setUsersBannedFilter(e.target.value); setTimeout(() => onSearch(), 0) }}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800"
          >
            <option value="">All Status</option>
            <option value="false">Active</option>
            <option value="true">Banned</option>
          </select>
          <Button size="sm" onClick={() => onSearch()} className="gap-1.5">
            <Search size={14} /> Search
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{usersTotal} total users</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Signed Up</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Last Login</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No users found</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.email || "—"}</td>
                    <td className="px-4 py-3">{roleBadge(u.role)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={u.subscription?.plan || "trial"}
                          disabled={changingPlanId === u._id}
                          onChange={(e) => onPlanChange(u._id, e.target.value as SubscriptionPlan)}
                          className="px-2 py-1 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 disabled:opacity-50"
                        >
                          {SUBSCRIPTION_PLAN_OPTIONS.map((plan) => (
                            <option key={plan} value={plan}>
                              {plan.charAt(0).toUpperCase() + plan.slice(1)}
                            </option>
                          ))}
                        </select>
                        {changingPlanId === u._id && <Loader2 size={12} className="animate-spin text-gray-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.isBanned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          <Ban size={10} /> Banned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
                          <CheckCircle2 size={10} /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{formatDate(u.signupDate || u.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">{u.lastLogin ? formatDateTime(u.lastLogin) : "Never"}</td>
                    <td className="px-4 py-3">
                      {u.role !== "admin" && (
                        <Button
                          size="sm"
                          variant={u.isBanned ? "default" : "destructive"}
                          className="h-7 text-xs gap-1"
                          disabled={banningId === u._id}
                          onClick={() => onBanToggle(u._id, u.isBanned)}
                        >
                          {banningId === u._id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : u.isBanned ? (
                            <>
                              <CheckCircle2 size={12} /> Unban
                            </>
                          ) : (
                            <>
                              <Ban size={12} /> Ban
                            </>
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={usersPage}
          totalPages={usersTotalPages}
          total={usersTotal}
          label="users"
          onPrev={() => onSearch(usersPage - 1)}
          onNext={() => onSearch(usersPage + 1)}
        />
      </div>
    </div>
  )
}
