"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Calendar1, ChevronDown, LoaderCircle, NotebookPen } from "lucide-react"
import { Calendar22 } from "@/components/common/datePick"
import { useState } from "react"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"

interface Case {
    id: string;
    name: string;
}

interface Invoice {
    id: string;
    name: string;
    case: Case;
    amount: number;
    paidAmount: number;
    raisedOn: Date;
    dueOn: Date;
}

interface InvoiceData {
    raised: Invoice[];
    paid: Invoice[];
    pending: Invoice[];
    scheduled: Invoice[];
}

const Invoices = () => {
    const { isOpen } = useSidebar()
    const [invoiceData, setInvoiceData] = useState<InvoiceData>({
        raised: [
            {
                id: "1",
                name: "John Doe",
                case: {
                    id: "1",
                    name: "Case 1"
                },
                amount: 100,
                paidAmount: 0,
                raisedOn: new Date(),
                dueOn: new Date()
            },
            {
                id: "2",
                name: "John Doe",
                case: {
                    id: "1",
                    name: "Case 1"
                },
                amount: 100,
                paidAmount: 0,
                raisedOn: new Date(),
                dueOn: new Date()
            }
        ],
        paid: [
            {
                id: "1",
                name: "John Doe",
                case: {
                    id: "1",
                    name: "Case 1"
                },
                amount: 100,
                paidAmount: 100,
                raisedOn: new Date(),
                dueOn: new Date()
            },
            {
                id: "2",
                name: "John Doe",
                case: {
                    id: "1",
                    name: "Case 1"
                },
                amount: 100,
                paidAmount: 100,
                raisedOn: new Date(),
                dueOn: new Date()
            }
        ],
        pending: [
            {
                id: "1",
                name: "John Doe",
                case: {
                    id: "1",
                    name: "Case 1"
                },
                amount: 100,
                paidAmount: 50,
                raisedOn: new Date(),
                dueOn: new Date()
            },
            {
                id: "2",
                name: "John Doe",
                case: {
                    id: "1",
                    name: "Case 1"
                },
                amount: 100,
                paidAmount: 50,
                raisedOn: new Date(),
                dueOn: new Date()
            }
        ],
        scheduled: [
            {
                id: "1",
                name: "John Doe",
                case: {
                    id: "1",
                    name: "Case 1"
                },
                amount: 100,
                paidAmount: 0,
                raisedOn: new Date(),
                dueOn: new Date()
            },
            {
                id: "2",
                name: "John Doe",
                case: {
                    id: "1",
                    name: "Case 1"
                },
                amount: 100,
                paidAmount: 0,
                raisedOn: new Date(),
                dueOn: new Date()
            }
        ]
    })
    const { isLoaded, isSignedIn } = useUser()
    if (!isLoaded) {
        return (
          <div className="flex items-center justify-center h-screen">
            <LoaderCircle className="text-gray-500 animate-spin" size={18} />
            <p className="text-center text-gray-500">Loading...</p>
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
            <Navbar location="Invoices" />

            <div className="h-35 w-full bg-background border-2 border-[#F3F5F9] rounded-lg mb-4 flex-flex-col">
                <div className="flex items-center bg-gray-200 px-4 py-1 rounded-t-lg">
                    <span className="me-2">Select Date Type</span>
                    <Select>
                        <SelectTrigger className="bg-background">
                            <SelectValue defaultValue="raisedOn" placeholder="Raised On" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="raisedOn">Raised On</SelectItem>
                            <SelectItem value="dueOn">Due On</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="flex items-center ms-4 bg-background rounded-md border pe-4">
                        <Calendar22 refDate={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)} />  -  <Calendar22 refDate={new Date()} /> <Calendar1 size={16} />
                    </div>
                </div>
                <div className="flex gap-x-2 flex-1 h-22.5 rounded-b-lg">
                    {Object.entries(invoiceData).map(([key, value]) => (
                        <div key={key} className="w-1/4 h-full hover:bg-gray-50 flex flex-col items-center justify-center">
                            <h2 className="text-sm uppercase">{key}</h2>
                            <p className="text-lg font-semibold">₹ {value.reduce((total: number, invoice: Invoice) => total + (invoice.amount - invoice.paidAmount), 0).toFixed(2)}</p>
                        </div>
                    ))}
                </div>
            </div>
            
            <Tabs defaultValue="raised">
                <div className="flex items-center justify-between">
                    <TabsList>
                        <TabsTrigger value="raised" className="w-20">Raised</TabsTrigger>
                        <TabsTrigger value="paid" className="w-20">Paid</TabsTrigger>
                        <TabsTrigger value="pending" className="w-35">Pending</TabsTrigger>
                        <TabsTrigger value="scheduled" className="w-35">Scheduled</TabsTrigger>
                    </TabsList>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="outline">Add Invoice <ChevronDown /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                        <DropdownMenuItem>Raise New Invoice</DropdownMenuItem>
                        <DropdownMenuItem>Schedule New Invoice</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <TabsContent value="raised">
                    <div className="w-full flex flex-col gap-y-2 mb-2">
                        {invoiceData.raised.length > 0 ? invoiceData.raised.map((invoice) => (
                            <div key={invoice.id} className="h-22 w-full bg-background shadow-sm p-4 border rounded-lg">
                                <div className="flex items-center h-full justify-between">
                                    <div className="w-1/4">
                                        <p>{invoice.id}</p>
                                        <p className="font-semibold">{invoice.dueOn.toDateString()}</p>
                                    </div>
                                    <div className="w-1/4">
                                        <p className="font-semibold">(case) {invoice.case.name}</p>
                                        <p className="font-semibold">{invoice.name}</p>
                                    </div>
                                    <div className="w-1/4">
                                        <p className="font-semibold">Total: ₹ {invoice.amount}</p>
                                        <p className="font-semibold">Due: ₹ {invoice.amount - invoice.paidAmount}</p>
                                    </div>
                                    <div className="w-1/5 flex items-center gap-x-2 cursor-pointer">
                                        <NotebookPen size={16} /> Add notes
                                    </div>
                                    <Button variant="outline">View Invoice</Button>
                                </div>
                            </div>
                        )) : (
                            <div>
                                <div className="h-24 text-center">
                                    No Invoices found
                                </div>
                            </div>
                        )}
                    </div>
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
                </TabsContent>
                <TabsContent value="paid">
                    <div className="w-full flex flex-col gap-y-2 mb-2">
                        {invoiceData.paid.length > 0 ? invoiceData.paid.map((invoice) => (
                            <div key={invoice.id} className="h-22 w-full bg-background shadow-sm p-4 border rounded-lg">
                                <div className="flex items-center h-full justify-between">
                                    <div className="w-1/4">
                                        <p>{invoice.id}</p>
                                        <p className="font-semibold">{invoice.dueOn.toDateString()}</p>
                                    </div>
                                    <div className="w-1/4">
                                        <p className="font-semibold">(case) {invoice.case.name}</p>
                                        <p className="font-semibold">{invoice.name}</p>
                                    </div>
                                    <div className="w-1/4">
                                        <p className="font-semibold">Total: ₹ {invoice.amount}</p>
                                        <p className="font-semibold">Due: ₹ {invoice.amount - invoice.paidAmount}</p>
                                    </div>
                                    <div className="w-1/5 flex items-center gap-x-2 cursor-pointer">
                                        <NotebookPen size={16} /> Add notes
                                    </div>
                                    <Button variant="outline">View Invoice</Button>
                                </div>
                            </div>
                        )) : (
                            <div>
                                <div className="h-24 text-center">
                                    No Invoices found
                                </div>
                            </div>
                        )}
                    </div>
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
                </TabsContent>
                <TabsContent value="pending">
                    <div className="w-full flex flex-col gap-y-2 mb-2">
                        {invoiceData.pending.length > 0 ? invoiceData.pending.map((invoice) => (
                            <div key={invoice.id} className="h-22 w-full bg-background shadow-sm p-4 border rounded-lg">
                                <div className="flex items-center h-full justify-between">
                                    <div className="w-1/4">
                                        <p>{invoice.id}</p>
                                        <p className="font-semibold">{invoice.dueOn.toDateString()}</p>
                                    </div>
                                    <div className="w-1/4">
                                        <p className="font-semibold">(case) {invoice.case.name}</p>
                                        <p className="font-semibold">{invoice.name}</p>
                                    </div>
                                    <div className="w-1/4">
                                        <p className="font-semibold">Total: ₹ {invoice.amount}</p>
                                        <p className="font-semibold">Due: ₹ {invoice.amount - invoice.paidAmount}</p>
                                    </div>
                                    <div className="w-1/5 flex items-center gap-x-2 cursor-pointer">
                                        <NotebookPen size={16} /> Add notes
                                    </div>
                                    <Button variant="outline">View Invoice</Button>
                                </div>
                            </div>
                        )) : (
                            <div>
                                <div className="h-24 text-center">
                                    No Invoices found
                                </div>
                            </div>
                        )}
                    </div>
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
                </TabsContent>
                <TabsContent value="scheduled">
                    <div className="w-full flex flex-col gap-y-2 mb-2">
                        {invoiceData.scheduled.length > 0 ? invoiceData.scheduled.map((invoice) => (
                            <div key={invoice.id} className="h-22 w-full bg-background shadow-sm p-4 border rounded-lg">
                                <div className="flex items-center h-full justify-between">
                                    <div className="w-1/4">
                                        <p>{invoice.id}</p>
                                        <p className="font-semibold">{invoice.dueOn.toDateString()}</p>
                                    </div>
                                    <div className="w-1/4">
                                        <p className="font-semibold">(case) {invoice.case.name}</p>
                                        <p className="font-semibold">{invoice.name}</p>
                                    </div>
                                    <div className="w-1/4">
                                        <p className="font-semibold">Total: ₹ {invoice.amount}</p>
                                        <p className="font-semibold">Due: ₹ {invoice.amount - invoice.paidAmount}</p>
                                    </div>
                                    <div className="w-1/5 flex items-center gap-x-2 cursor-pointer">
                                        <NotebookPen size={16} /> Add notes
                                    </div>
                                    <Button variant="outline">View Invoice</Button>
                                </div>
                            </div>
                        )) : (
                            <div>
                                <div className="h-24 text-center">
                                    No Invoices found
                                </div>
                            </div>
                        )}
                    </div>
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
                </TabsContent>
            </Tabs>       
            </div>
        </div>
    </div>
  )
}
export default Invoices