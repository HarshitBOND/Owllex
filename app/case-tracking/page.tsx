"use client"

import { Input } from "@/components/ui/input"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { FileText, MessageCircle, Calendar as CalendarIcon, Truck, FileUp, ArrowDownNarrowWide, FunnelPlus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { useRouter } from "next/navigation"
import CasesListView from "@/components/case/casesListView"
import { Note } from "@/components/client/clientView"

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
  client: string;
  notes: Note[];
}

const CaseTracking = () => {
    const { isLoaded, isSignedIn } = useUser()
    const { isOpen } = useSidebar();
    const router = useRouter();
    const [quickOptions, setQuickOptions] = useState([
        {
            name: "Active Documents",
            description: "Documents is progress",
            value: 0,
            icon: <FileText color="blue" className="text-white" size={18} />,
        },
        {
            name: "Consultations",
            description: "Scheduled this week",
            value: 0,
            icon: <MessageCircle color="green" className="text-white" size={18} />,
        },        {
            name: "Court Dates",
            description: "Upcoming hearings",
            value: 0,
            icon: <CalendarIcon color="orange" className="text-white" size={18} />,
        },
        {
            name: "Deliveries",
            description: "Completed this month",
            value: 0,
            icon: <Truck color="violet" className="text-white" size={18} />,
        },
    ])
    const [cases, setCases] = useState<Case[]>([])
    const [loading, setLoading] = useState<boolean>(false);
    const [addingCase, setAddingCase] = useState(false);

    useEffect(() => {
        const fetchCases = async () => {
            setLoading(true)
            const response = await fetch(`/api/userdetails/cases`)
            const data = await response.json()
            setCases(data.userCases.cases)
            setLoading(false)
        }
        try {
            fetchCases()
        } catch (error) {
            console.log(error)
            setLoading(false)
        }
    }, [])

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
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 transition-all duration-300", isOpen ? "lg:ml-54" : "lg:ml-13.5")}>
            <div className="max-w-[1400px] w-full mx-auto">
                <Navbar location="Cases" />
                <div className="w-full gap-4 flex items-center justify-between mb-4 flex-col md:flex-row">
                    {quickOptions.map((item) => (
                        <div key={item.name} className="flex flex-col md:w-[24%] w-full min-w-38 min-h-36 border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-300 p-5">
                            <div className="flex w-full items-center justify-between">
                                <h3>{item.name}</h3>
                                <span>{item.icon}</span>
                            </div>
                            <p className="text-lg font-semibold mt-auto">{item.value}</p>
                            <p className="text-sm">{item.description}</p>
                        </div>
                    ))}
                </div>

                <div className="flex items-center">
                    <div className="flex items-center gap-x-2 w-full">
                      <Input placeholder="Search" className="border border-gray-200 rounded-lg bg-gray-50 w-80" />
                      <div className="flex items-center gap-x-2 ms-auto">
                        <Button variant="outline"><FileUp /> Export</Button>
                        <Button variant="outline"><FunnelPlus /> Filter</Button>
                        <Button variant="outline"><ArrowDownNarrowWide /> Sort</Button>
                        <Button onClick={() => {setAddingCase(true); router.push("/case-tracking/add")}} disabled={addingCase} variant="secondary">
                            {addingCase && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {addingCase ? "Adding..." : "Add New Case"}
                        </Button>
                      </div>
                    </div>
                </div>
                <hr className="my-2" />
                <CasesListView cases={cases} loading={loading} />
            </div>
        </div>
    </div>
  )
}
export default CaseTracking