import { useEffect, useState } from "react"

export function useAdminAccess(isSignedIn: boolean | undefined) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isSignedIn) return
    fetch("/api/admin/check")
      .then((res) => {
        if (res.ok) return res.json()
        throw new Error("not admin")
      })
      .then((d) => setIsAdmin(d.isAdmin === true))
      .catch(() => setIsAdmin(false))
  }, [isSignedIn])

  return isAdmin
}
