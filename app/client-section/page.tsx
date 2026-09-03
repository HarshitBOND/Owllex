import { redirect } from "next/navigation";

// Redirect to unified My Clients page
export default function ClientSectionPage() {
    return redirect("/my-clients");
}
