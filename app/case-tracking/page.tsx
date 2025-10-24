"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Input } from "@/components/ui/input"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { FileText, MessageCircle, Calendar as CalendarIcon, Truck, FileDown, FileUp, ArrowDownNarrowWide, FunnelPlus, ChevronDown, LoaderCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Checkbox } from "@/components/ui/checkbox"
import { useRouter } from "next/navigation"

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
    const [loading, setLoading] = useState<boolean>(false)

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
                        <Button onClick={() => router.push("/case-tracking/add")} variant="secondary">Add New Case</Button>
                      </div>
                    </div>
                </div>
                <hr className="my-2" />
                <div className="min-h-113">
                <Table>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24">
                          <div className="flex items-center justify-center">
                            <Loader2 className="animate-spin" />
                            <p className="ms-2">Loading cases...</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      cases && cases.length > 0 ? cases.map((c: Case) => (
                      <TableRow key={c._id} className="cursor-pointer">
                          <TableCell colSpan={4} onClick={() => router.push(`/case-tracking/view/${c._id}`)}>
                            <div className="flex flex-col mb-2 gap-y-1 border border-gray-200 rounded-md shadow-sm p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-x-3">
                                  <Checkbox className="border border-gray-200 bg-gray-50 cursor-pointer" />
                                  <h2 className="text-lg font-semibold">{c.caseTitle}</h2>
                                </div>
                                <p className="px-3 py-0.5 rounded-md border uppercase bg-gray-50">{c.status}</p>
                              </div>

                              <hr className="my-2" />

                              <div className="flex items-center justify-between">
                                <div>
                                  <p>Delhi High Court</p>
                                  <p>{c.caseNo.match(/^[A-Za-z().\s-]*\d+\/\d{4}/)?.[0]}</p>
                                </div>
                                <div className="grid grid-cols-4 h-20 w-120 gap-x-2">
                                  <div className="bg-slate-200 rounded-md p-2">
                                    <span>Previous</span>
                                  </div>
                                  <div className="col-span-2 bg-slate-200 rounded-md p-2">
                                  </div>
                                  <div className="bg-slate-200 rounded-md p-2">
                                    <span>Upcoming</span>
                                  </div>
                                </div>
                              </div>

                              <hr className="my-2" />

                              <div className="flex items-center gap-x-35">
                                <div className="flex gap-x-6">
                                  <div className="text-muted-foreground">
                                    <p>Court Jurisdiction</p>
                                    <p>(State)</p>
                                  </div>
                                  <p className="text-black">Delhi</p>
                                </div>

                                <div className="flex gap-x-6">
                                  <div className="text-muted-foreground">
                                    <p>Court Jurisdiction</p>
                                    <p>(District)</p>
                                  </div>
                                  <p className="text-black">Delhi</p>
                                </div>

                                <div>
                                  <p>Assigned Tasks</p>
                                  <p className="text-blue-500 cursor-pointer hover:underline">View Tasks</p>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                      </TableRow>
                      )) : (
                          <TableRow>
                              <TableCell colSpan={4} className="h-24 text-center">
                                  No cases found
                              </TableCell>
                          </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
                </div>
                <hr className="my-2" />
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#" />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#">1</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#" isActive>2</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#">3</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext href="#" />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
            </div>
        </div>
    </div>
  )
}
export default CaseTracking