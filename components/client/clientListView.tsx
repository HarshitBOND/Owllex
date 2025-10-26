"use client"

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { AlertPopup } from "../common/AlertPopup"
import { Button } from "../ui/button"
import { ChevronDown } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { Client } from "@/app/my-clients/page"

const ClientListView = ({clients, clientsLoading, setTrigger}: {clients: Client[], clientsLoading: boolean, setTrigger: React.Dispatch<React.SetStateAction<number>>}) => {
    const router = useRouter()

    const handleClientView = (clientId: string) => {
        router.push(`/my-clients/view/${clientId}`)
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
        <>
        <div>
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
        {clients && clients.length > 25 && <>
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
        </>}
        </>
    )
}
export default ClientListView