"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { Loader2 } from "lucide-react"
import { Case } from "@/app/case-tracking/page"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

const CasesListView = ({cases, loading, clientView, clientId, setTrigger}: {cases: Case[], loading: boolean, clientView?: boolean, clientId?: string, setTrigger?: React.Dispatch<React.SetStateAction<number>>}) => {
    const router = useRouter()
    
    // Colorful effect - rotate colors for each case
    const colors = [
        { border: "border-blue-200", bg: "bg-blue-50/30", icon: "bg-blue-100", text: "text-blue-600", shadow: "shadow-[0_2px_12px_rgba(59,130,246,0.08)]" },
        { border: "border-brand-200", bg: "bg-brand-50/30", icon: "bg-brand-100", text: "text-brand-600", shadow: "shadow-[0_2px_12px_rgba(16,185,129,0.08)]" },
        { border: "border-violet-200", bg: "bg-violet-50/30", icon: "bg-violet-100", text: "text-violet-600", shadow: "shadow-[0_2px_12px_rgba(124,58,237,0.08)]" },
        { border: "border-orange-200", bg: "bg-orange-50/30", icon: "bg-orange-100", text: "text-orange-600", shadow: "shadow-[0_2px_12px_rgba(249,115,22,0.08)]" },
        { border: "border-cyan-200", bg: "bg-cyan-50/30", icon: "bg-cyan-100", text: "text-cyan-600", shadow: "shadow-[0_2px_12px_rgba(6,182,212,0.08)]" },
    ]
    
    const getColorByIndex = (index: number) => colors[index % colors.length]
    
    const handleUnlinkCase = (caseId: string) => {
        const unlinkCase = async () => {
            const response = await fetch(`/api/userdetails/cases?caseId=${caseId}&clientId=${clientId}`, {
                method: "DELETE"
            })
            const data = await response.json()
            if (!data.success) {
                throw new Error("Failed to unlink case")
            }
            setTrigger && setTrigger((prev) => prev + 1)
        }
        try {
            unlinkCase()
        } catch (error) {
            console.error(error)
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
                    cases && cases.length > 0 ? cases.map((c: Case, idx: number) => {
                        const color = getColorByIndex(idx)
                    return (
                    <TableRow key={c._id} className="cursor-pointer">
                        <TableCell colSpan={4} onClick={() => router.push(`/case-tracking/view/${c._id}`)}>
                        <div className={`flex flex-col mb-2 gap-y-1 border-2 rounded-xl p-4 transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] ${color.border} ${color.bg} ${color.shadow}`}>
                            <div className="flex items-center justify-between">
                            <div className="flex items-center gap-x-3">
                                <div className={`w-6 h-6 rounded border-2 cursor-pointer ${color.icon} ${color.border}`} />
                                <h2 className="text-lg font-semibold break-words whitespace-pre-wrap me-2">{c.caseTitle}</h2>
                            </div>
                            <div className="flex items-center">
                                <p className={`px-3 py-0.5 rounded-md border uppercase ${color.icon} ${color.text}`}>{c.status}</p>
                                {clientView && (
                                    <Button onClick={(e) => {e.stopPropagation(); handleUnlinkCase(c._id)}} variant="link" className="ml-2">Unlink Case</Button>
                                )}
                            </div>
                            </div>

                            <hr className="my-2" />

                            <div className="flex items-center justify-between">
                            <div>
                                <p className="font-semibold">Delhi High Court</p>
                                <p className="text-sm text-gray-600">{c.caseNo.match(/^[A-Za-z().\s-]*\d+\/\d{4}/)?.[0]}</p>
                            </div>
                            <div className="grid grid-cols-4 h-20 w-120 gap-x-2">
                                <div className={`rounded-lg p-2 ${color.icon}`}>
                                <span className={`text-xs font-semibold ${color.text}`}>Previous</span>
                                </div>
                                <div className={`col-span-2 rounded-lg p-2 ${color.bg} border ${color.border}`}>
                                </div>
                                <div className={`rounded-lg p-2 ${color.icon}`}>
                                <span className={`text-xs font-semibold ${color.text}`}>Upcoming</span>
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
                    )}) : (
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
                <div className="flex items-center justify-center gap-2 py-2">
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                  <Button variant="outline" size="sm" className="bg-sidebar-primary text-white">1</Button>
                  <Button variant="outline" size="sm" disabled>Next</Button>
                </div>
                </>
            }
        </>
    )
}
export default CasesListView