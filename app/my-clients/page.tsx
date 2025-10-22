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
import { useState, useEffect } from "react"
import { FileDown, FileUp, ArrowDownNarrowWide, FunnelPlus, ChevronDown, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { useRouter } from "next/navigation"
import { AlertPopup } from "@/components/common/AlertPopup"

interface CustomField {
    name: string;
    value: string;
}

interface Address {
    building: string;
    street: string;
    city: string;
    district: string;
    state: string;
    pincode: string;
    country: string;
}

interface Client {
    _id: string;
    salutation: string;
    name: string;
    company: string;
    group: string;
    email: string;
    contact: string;
    contactAlt: string;
    gstin: string;
    address: Address;
    customFields: CustomField[];
    createdAt: Date;
    updatedAt: Date;
}

const MyClients = () => {
    const { isOpen } = useSidebar();
    const [clients, setClients] = useState<Client[]>([])
    const [clientsLoading, setClientsLoading] = useState(true)
    const { isLoaded, isSignedIn } = useUser()
    const [trigger, setTrigger] = useState(0)
    const router = useRouter()

    useEffect(() => {
        const fetchClients = async () => {
            const response = await fetch(`/api/userdetails/clients`)
            const data = await response.json()
            setClients(data.userClients?.clients ?? [])
            setClientsLoading(false)
        }
        try {
            fetchClients()
        } catch (error) {
            setClientsLoading(false)
            console.error(error)
        }
    }, [trigger])

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

    const handleClientView = (clientId: string) => {
        router.push(`/my-clients/view/${clientId}`)
    }

    const handleAddClient = () => {
        router.push("/my-clients/add")
    }

    const handleDeleteClient = (clientId: string) => {
        const deleteClient = async () => {
            const response = await fetch(`/api/userdetails/clients?id=${clientId}`, {
                method: "DELETE"
            })
            if (!response.ok) {
                throw new Error("Failed to delete client")
            }
            alert("Client deleted successfully")
            setTrigger((prev) => prev + 1)
        }
        try {
            deleteClient()
        } catch (error) {
            console.error(error)
            alert("Failed to delete client")
        }
    }

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
                        <Button onClick={() => handleAddClient()} variant="secondary">
                          Add New Client
                        </Button>
                      </div>
                    </div>
                </div>
                <hr className="my-2" />
                <div className="min-h-113">
                <Table>
                  <TableBody>
                      {clients.length > 0 ? clients.map((client) => (
                      <TableRow key={client._id} className="cursor-pointer">
                          <TableCell colSpan={4} onClick={() => handleClientView(client._id)}>
                            <div className="flex flex-col mb-2 gap-y-1">
                              <div className="flex items-center justify-between">
                                <p>Created On: {new Date(client.createdAt).toDateString()}</p>
                                <DropdownMenu >
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline">Actions <ChevronDown /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent onClick={(e) => {e.stopPropagation()}}>
                                    <DropdownMenuItem onClick={() => {router.push(`/my-clients/edit/${client._id}`)}}>Edit</DropdownMenuItem>
                                    <AlertPopup  handleDeleteClient={() => handleDeleteClient(client._id)}>
                                      <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>Delete</DropdownMenuItem>
                                    </AlertPopup>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              <h2 className="text-2xl font-bold">{client.name}</h2>
                              <p>{client.email}</p>
                              <p>Contact Number: {client.contact}</p>
                            </div>
                          </TableCell>
                      </TableRow>
                      )) : clientsLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center">
                            <div className="h-100 flex items-center justify-center gap-x-1">
                              <LoaderCircle className="text-gray-500 animate-spin" size={18} />
                              <p className="text-center text-gray-500">Loading...</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center">
                            No clients found
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
export default MyClients