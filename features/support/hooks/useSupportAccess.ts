import { useEffect, useState } from "react"

export function useSupportAccess(isSignedIn: boolean | undefined) {
  const [isSupport, setIsSupport] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isSignedIn) return

    fetch("/api/support/check")
      .then((res) => {
        if (res.ok) return res.json()
        throw new Error("not support")
      })
      .then((data) => setIsSupport(data?.isSupport === true))
      .catch(() => setIsSupport(false))
  }, [isSignedIn])

  return isSupport
}
