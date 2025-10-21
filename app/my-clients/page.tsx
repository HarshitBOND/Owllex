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
import { FileText, MessageCircle, Calendar as CalendarIcon, Truck, FileDown, FileUp, ArrowDownNarrowWide, FunnelPlus, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Client {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    createdAt: Date;
}

const MyClients = () => {
    const { isOpen } = useSidebar();
    const [clients, setClients] = useState<Client[]>([
      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },
            {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      },      {
        id: "1",
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "123-456-7890",
        address: "123 Main St, Anytown, USA",
        createdAt: new Date(),
      }
    ])
    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 transition-all duration-300", isOpen ? "lg:ml-54" : "lg:ml-13.5")}>
            <div className="max-w-[1400px] w-full mx-auto">
            <Navbar location="My Clients" />
                <div className="flex items-center">
                    <div className="flex items-center gap-x-2 w-full">
                      <Input placeholder="Search" className="border border-gray-200 rounded-lg bg-gray-50 w-80" />
                      <div className="flex items-center gap-x-2 ms-auto">
                        <Button variant="outline"><FileUp /> Export</Button>
                        <Button variant="outline"><FileDown /> Import</Button>
                        <Button variant="outline"><FunnelPlus /> Filter</Button>
                        <Button variant="outline"><ArrowDownNarrowWide /> Sort</Button>
                        <Button variant="secondary">Add New Client</Button>
                      </div>
                    </div>
                </div>
                <hr className="my-2" />
                <Table className="min-h-113">
                  <TableBody>
                      {clients.length > 0 ? clients.map((client) => (
                      <TableRow key={client.id} className="h-24">
                          <TableCell colSpan={4}>
                            <div className="flex flex-col mb-2 gap-y-1">
                              <div className="flex items-center justify-between">
                                <p>Created On: {client.createdAt.toDateString()}</p>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline">Actions <ChevronDown /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent>
                                    <DropdownMenuItem>Edit</DropdownMenuItem>
                                    <DropdownMenuItem>Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              <h2 className="text-2xl font-bold">{client.name}</h2>
                              <p>{client.email}</p>
                              <p>Contact Number: {client.phone}</p>
                            </div>
                          </TableCell>
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
export default MyClients