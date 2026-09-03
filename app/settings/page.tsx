import { redirect } from "next/navigation"

// Settings is a panel, not a page. Old links land on the dashboard with it open.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; tab?: string }>
}) {
  const { section, tab } = await searchParams
  return redirect(`/dashboard/overview?settings=${section || tab || "general"}`)
}
