"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
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
import { useState } from "react"
import { FileText, MessageCircle, Calendar as CalendarIcon, Truck, FileDown, FileUp, ArrowDownNarrowWide, FunnelPlus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Client {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
}

const MyClients = () => {
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
    const [clients, setClients] = useState<Client[]>([
      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
      },
    ])
    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 transition-all duration-300", isOpen ? "md:ml-54" : "md:ml-13.5")}>
            <Navbar location="My Clients" />
            
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
            <div className="bg-background rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-4">
                <div className="flex items-center justify-between">
                    <p className="whitespace-nowrap text-lg font-semibold">Client Details</p>
                    <div className="flex items-center gap-x-2">
                      <Input placeholder="Search" className="border border-gray-200 rounded-lg bg-gray-50 w-70" />
                      <Button variant="outline"><FileUp /></Button>
                      <Button variant="outline"><FileDown /></Button>
                      <Button variant="outline"><FunnelPlus /></Button>
                      <Button variant="outline"><ArrowDownNarrowWide /></Button>
                      <Button variant="secondary">Add New Client</Button>
                    </div>
                </div>
                <hr className="my-4" />
                <Table className="min-h-57">
                  <TableBody>
                      {clients.length > 0 ? clients.map((client) => (
                      <TableRow key={client.id}>
                          <TableCell>{client.name}</TableCell>
                          <TableCell>{client.email}</TableCell>
                          <TableCell>{client.phone}</TableCell>
                          <TableCell>{client.address}</TableCell>
                      </TableRow>
                      )) : (
                          <TableRow>
                              <TableCell colSpan={4} className="h-24 text-center">
                                  No clients found
                              </TableCell>
                          </TableRow>
                      )}
                  </TableBody>
                </Table>
                <hr className="my-4" />
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
export default MyClients