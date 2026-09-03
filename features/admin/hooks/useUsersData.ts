import { useCallback, useState } from "react"
import type { SubscriptionPlan, UserRecord } from "../types"

export function useUsersData() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersPage, setUsersPage] = useState(1)
  const [usersTotalPages, setUsersTotalPages] = useState(1)
  const [usersSearch, setUsersSearch] = useState("")
  const [usersRoleFilter, setUsersRoleFilter] = useState("")
  const [usersBannedFilter, setUsersBannedFilter] = useState("")
  const [banningId, setBanningId] = useState<string | null>(null)
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null)

  const fetchUsers = useCallback(async (page = 1) => {
    try {
      const p = new URLSearchParams({ page: String(page), limit: "20" })
      if (usersSearch) p.set("search", usersSearch)
      if (usersRoleFilter) p.set("role", usersRoleFilter)
      if (usersBannedFilter) p.set("banned", usersBannedFilter)
      const res = await fetch(`/api/admin/users?${p}`)
      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
        setUsersTotal(data.total)
        setUsersPage(data.page)
        setUsersTotalPages(data.totalPages)
      }
    } catch (err) {
      console.error("Users fetch error:", err)
    }
  }, [usersSearch, usersRoleFilter, usersBannedFilter])

  const handleBanToggle = async (userId: string, currentlyBanned: boolean) => {
    setBanningId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned: !currentlyBanned }),
      })
      const data = await res.json()
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) =>
            u._id === userId ? { ...u, isBanned: !currentlyBanned } : u
          )
        )
      } else {
        alert(data.error || "Failed to update user status")
      }
    } catch {
      alert("Network error")
    } finally {
      setBanningId(null)
    }
  }

  const handlePlanChange = async (userId: string, plan: SubscriptionPlan) => {
    setChangingPlanId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) =>
            u._id === userId ? { ...u, subscription: { ...u.subscription, plan } } : u
          )
        )
      } else {
        alert(data.error || "Failed to update plan")
      }
    } catch {
      alert("Network error")
    } finally {
      setChangingPlanId(null)
    }
  }

  return {
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
    fetchUsers,
    handleBanToggle,
    handlePlanChange,
  }
}
