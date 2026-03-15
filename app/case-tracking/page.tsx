"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import dynamic from "next/dynamic"

const MyCases = dynamic(() => import("@/components/my-cases").then(m => m.MyCases), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" /></div>,
  ssr: false
})

export interface Case {
  _id: string;
  fileNo: string;
  caseNo: string;
  cnrNo: string;
  caseTitle: string;
  advocate: string;
  caseStage: string;
  remarks: string;
  links: string[];
  documents: string[];
  courtName: string;
  courtValue: string;
  courtRoom: string;
  courtDate: string;
  fillingAdvocate: string;
  fillingDate: string;
  status: string;
  registrationDate: string;
  filingDetails: {
    srlNo: string;
    date: string;
    filingDetails: string;
  }[];
  listingDetails: {
    srlNo: string;
    date: string;
    listingDetails: string;
  }[];
  hearingHistory?: {
    type: "created" | "listing-added" | "rescheduled" | "updated";
    hearingDate: string;
    previousCourtDate?: string | null;
    listingDetails?: string;
    reason?: string;
    source?: "case-create" | "listing" | "reschedule" | "manual";
    changedByClerkUid?: string | null;
    changedAt?: string;
  }[];
  courtDateAuditTrail?: {
    previousCourtDate?: string | null;
    nextCourtDate: string;
    reason?: string;
    source?: "case-create" | "listing" | "reschedule" | "manual";
    changedByClerkUid?: string | null;
    changedAt?: string;
  }[];
  client: string;
  notes: any[];
}

const CaseTracking = () => {
    const { isLoaded, isSignedIn } = useUser()
    const { isOpen } = useSidebar();

    if (!isLoaded) {
        return (
          <div className="flex items-center justify-center min-h-screen">
              <div className="w-12 h-12 border-5 border-t-transparent border-sidebar-primary rounded-full scale-175 animate-spin" />
          </div>
        )
    }
    if (!isSignedIn) {
        return redirect("/")
    }

    return (
        <div className="flex">
            <Sidebar />
            <div className={cn("min-h-screen w-full transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
                <Navbar location="Cases" />
                <MyCases />
            </div>
        </div>
    )
}
export default CaseTracking