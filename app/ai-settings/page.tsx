import { redirect } from "next/navigation"

// AI preferences live in the settings panel, opened over the current page.
export default function Page() {
  return redirect("/dashboard/overview?settings=model")
}
