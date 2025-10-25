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
import { Loader2 } from "lucide-react"
import { Case } from "@/app/case-tracking/page"
import { Checkbox } from "@radix-ui/react-checkbox"
import { useRouter } from "next/navigation"
import { Button } from "../ui/button"

const CasesListView = ({cases, loading, clientView, clientId, setTrigger}: {cases: Case[], loading: boolean, clientView?: boolean, clientId?: string, setTrigger?: React.Dispatch<React.SetStateAction<number>>}) => {
    const router = useRouter()
    const handleUnlinkCase = (caseId: string) => {
        const unlinkCase = async () => {
            const response = await fetch(`/api/userdetails/cases?caseId=${caseId}&clientId=${clientId}`, {
                method: "DELETE"
            })
            const data = await response.json()
            if (!data.success) {
                throw new Error("Failed to unlink case")
            }
            alert("Case unlinked successfully")
            setTrigger && setTrigger((prev) => prev + 1)
        }
        try {
            unlinkCase()
        } catch (error) {
            console.error(error)
            alert("Failed to unlink case")
        }
    }
    return (
        <>
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
                            <div className="flex items-center">
                                <p className="px-3 py-0.5 rounded-md border uppercase bg-gray-50">{c.status}</p>
                                {clientView && (
                                    <Button onClick={(e) => {e.stopPropagation(); handleUnlinkCase(c._id)}} variant="link" className="ml-2">Unlink Case</Button>
                                )}
                            </div>
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
            {cases && cases.length > 25 &&
                <>
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
                </>
            }
        </>
    )
}
export default CasesListView