"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { useState } from "react"
import { FileText, MessageCircle, Calendar as CalendarIcon, Truck, FileDown, FileUp, ArrowDownNarrowWide, FunnelPlus, ChevronDown, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Checkbox } from "@/components/ui/checkbox"

interface Case {
  _id: string;
  fileNo: string;
  caseNo: string;
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
    const { isOpen } = useSidebar();
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
    const [cases, setCases] = useState<Case[]>([
      {
        _id: "1",
        fileNo: "1",
        caseNo: "CS(OS) - 1626/1999 WITH TEST.CAS. 30/2001 Case history.",
        caseTitle: "VIJAY ARORA v/s RAMESH KUMAR ARORA AND ORS.",
        advocate: "VANITA SAHNI, RISHI DEWAN, SK TYAGI, VISHNU MEHRA,  RK SHARMA, RS DEWAN, HARDIK LUTHRA, SAMAR VIJAY SINGH, H S JAGGI, SAMAR VIJAY SINGH, PRASHANT  BATRA, AZEEM A DOST, AZEEM A DOST, POONAM  LAU,  P.P.AHUJA",
        caseStage: "",
        remarks: "",
        links: ["javascript:void(0)", "https://delhihighcourt.nic.in/app/online-cause-history/eyJpdiI6IkFxb0NhUVFGYTJVS3hQc2RHMmNQUmc9PSIsInZhbHVlIjoiOGNvVFBCZU5ORXVYc2ZPWmN0VzJjZz09IiwibWFjIjoiMzVjODdlZGY0NjNmMDNjYTQxZjZiZjYxZjYwYjcyNjE4ZWRkYTdjNjliOGQ2ZGYyZTBjODZmOWJjMGZlNWIxOSIsInRhZyI6IiJ9/eyJpdiI6Inp4Um1ENnRoWXhIVHRoaTdnYnBLcmc9PSIsInZhbHVlIjoiVzZUZGpWQk94bGpiQ1lsQ0ZrWjRBZz09IiwibWFjIjoiYmE4Nzg0MmIwODkyMGU3MmJkNzg2ZDM5NmVmODg4MGY2ZDc5NTFjM2U2MGQ1MzJiMDE2YmIxZjU0OGI5OThhNyIsInRhZyI6IiJ9/eyJpdiI6ImgvY0IyeU9XZVNvVzN2S08rQ20wL3c9PSIsInZhbHVlIjoiMjhDTFN5L2E2V1YxQUFnZ1NmVWdlQT09IiwibWFjIjoiMDk1MTY2NTYxYjg3NTc4NmE1ZDEyNTc0MjA2NGVhNTRlNWQxMjIxZmE2NDE0MjcxOWFjZjE0MzFjZDgwNzk5MCIsInRhZyI6IiJ9"],
        documents: ["1"],
        courtName: "HON'BLE MR. JUSTICE JASMEET SINGH (O)",
        courtValue: "41~O",
        courtRoom: "41",
        courtDate: "2025-10-22",
        fillingAdvocate: "P.P.AHUJA",
        fillingDate: "2025-10-22",
        status: "pending",
        registrationDate: "2025-10-22",
        filingDetails: [{
          srlNo: "1",
          date: "2025-10-22",
          filingDetails: "1",
        }],
        listingDetails: [{
          srlNo: "1",
          date: "2025-10-22",
          listingDetails: "1",
        }],
      },
            {
        _id: "1",
        fileNo: "1",
        caseNo: "CS(OS) - 1626/1999 WITH TEST.CAS. 30/2001 Case history.",
        caseTitle: "VIJAY ARORA v/s RAMESH KUMAR ARORA AND ORS.",
        advocate: "VANITA SAHNI, RISHI DEWAN, SK TYAGI, VISHNU MEHRA,  RK SHARMA, RS DEWAN, HARDIK LUTHRA, SAMAR VIJAY SINGH, H S JAGGI, SAMAR VIJAY SINGH, PRASHANT  BATRA, AZEEM A DOST, AZEEM A DOST, POONAM  LAU,  P.P.AHUJA",
        caseStage: "",
        remarks: "",
        links: ["javascript:void(0)", "https://delhihighcourt.nic.in/app/online-cause-history/eyJpdiI6IkFxb0NhUVFGYTJVS3hQc2RHMmNQUmc9PSIsInZhbHVlIjoiOGNvVFBCZU5ORXVYc2ZPWmN0VzJjZz09IiwibWFjIjoiMzVjODdlZGY0NjNmMDNjYTQxZjZiZjYxZjYwYjcyNjE4ZWRkYTdjNjliOGQ2ZGYyZTBjODZmOWJjMGZlNWIxOSIsInRhZyI6IiJ9/eyJpdiI6Inp4Um1ENnRoWXhIVHRoaTdnYnBLcmc9PSIsInZhbHVlIjoiVzZUZGpWQk94bGpiQ1lsQ0ZrWjRBZz09IiwibWFjIjoiYmE4Nzg0MmIwODkyMGU3MmJkNzg2ZDM5NmVmODg4MGY2ZDc5NTFjM2U2MGQ1MzJiMDE2YmIxZjU0OGI5OThhNyIsInRhZyI6IiJ9/eyJpdiI6ImgvY0IyeU9XZVNvVzN2S08rQ20wL3c9PSIsInZhbHVlIjoiMjhDTFN5L2E2V1YxQUFnZ1NmVWdlQT09IiwibWFjIjoiMDk1MTY2NTYxYjg3NTc4NmE1ZDEyNTc0MjA2NGVhNTRlNWQxMjIxZmE2NDE0MjcxOWFjZjE0MzFjZDgwNzk5MCIsInRhZyI6IiJ9"],
        documents: ["1"],
        courtName: "HON'BLE MR. JUSTICE JASMEET SINGH (O)",
        courtValue: "41~O",
        courtRoom: "41",
        courtDate: "2025-10-22",
        fillingAdvocate: "P.P.AHUJA",
        fillingDate: "2025-10-22",
        status: "pending",
        registrationDate: "2025-10-22",
        filingDetails: [{
          srlNo: "1",
          date: "2025-10-22",
          filingDetails: "1",
        }],
        listingDetails: [{
          srlNo: "1",
          date: "2025-10-22",
          listingDetails: "1",
        }],
      },
            {
        _id: "1",
        fileNo: "1",
        caseNo: "CS(OS) - 1626/1999 WITH TEST.CAS. 30/2001 Case history.",
        caseTitle: "VIJAY ARORA v/s RAMESH KUMAR ARORA AND ORS.",
        advocate: "VANITA SAHNI, RISHI DEWAN, SK TYAGI, VISHNU MEHRA,  RK SHARMA, RS DEWAN, HARDIK LUTHRA, SAMAR VIJAY SINGH, H S JAGGI, SAMAR VIJAY SINGH, PRASHANT  BATRA, AZEEM A DOST, AZEEM A DOST, POONAM  LAU,  P.P.AHUJA",
        caseStage: "",
        remarks: "",
        links: ["javascript:void(0)", "https://delhihighcourt.nic.in/app/online-cause-history/eyJpdiI6IkFxb0NhUVFGYTJVS3hQc2RHMmNQUmc9PSIsInZhbHVlIjoiOGNvVFBCZU5ORXVYc2ZPWmN0VzJjZz09IiwibWFjIjoiMzVjODdlZGY0NjNmMDNjYTQxZjZiZjYxZjYwYjcyNjE4ZWRkYTdjNjliOGQ2ZGYyZTBjODZmOWJjMGZlNWIxOSIsInRhZyI6IiJ9/eyJpdiI6Inp4Um1ENnRoWXhIVHRoaTdnYnBLcmc9PSIsInZhbHVlIjoiVzZUZGpWQk94bGpiQ1lsQ0ZrWjRBZz09IiwibWFjIjoiYmE4Nzg0MmIwODkyMGU3MmJkNzg2ZDM5NmVmODg4MGY2ZDc5NTFjM2U2MGQ1MzJiMDE2YmIxZjU0OGI5OThhNyIsInRhZyI6IiJ9/eyJpdiI6ImgvY0IyeU9XZVNvVzN2S08rQ20wL3c9PSIsInZhbHVlIjoiMjhDTFN5L2E2V1YxQUFnZ1NmVWdlQT09IiwibWFjIjoiMDk1MTY2NTYxYjg3NTc4NmE1ZDEyNTc0MjA2NGVhNTRlNWQxMjIxZmE2NDE0MjcxOWFjZjE0MzFjZDgwNzk5MCIsInRhZyI6IiJ9"],
        documents: ["1"],
        courtName: "HON'BLE MR. JUSTICE JASMEET SINGH (O)",
        courtValue: "41~O",
        courtRoom: "41",
        courtDate: "2025-10-22",
        fillingAdvocate: "P.P.AHUJA",
        fillingDate: "2025-10-22",
        status: "pending",
        registrationDate: "2025-10-22",
        filingDetails: [{
          srlNo: "1",
          date: "2025-10-22",
          filingDetails: "1",
        }],
        listingDetails: [{
          srlNo: "1",
          date: "2025-10-22",
          listingDetails: "1",
        }],
      },
    ])

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
                        <Button variant="secondary">Add New Case</Button>
                      </div>
                    </div>
                </div>
                <hr className="my-2" />
                <div className="min-h-113">
                <Table>
                  <TableBody>
                      {cases.length > 0 ? cases.map((c: Case) => (
                      <TableRow key={c._id} className="cursor-pointer">
                          <TableCell colSpan={4}>
                            <div className="flex flex-col mb-2 gap-y-1 border border-gray-200 rounded-md shadow-sm p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-x-3">
                                  <Checkbox className="border border-gray-200 bg-gray-50" />
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
                                  <div className="bg-slate-200 rounded-md"></div>
                                  <div className="col-span-2 bg-slate-200 rounded-md"></div>
                                  <div className="bg-slate-200 rounded-md"></div>
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
                                  <p>View Tasks</p>
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