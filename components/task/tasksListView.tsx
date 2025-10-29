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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ChevronDown,  LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { AlertPopup } from "../common/AlertPopup"
import { Task } from "@/app/tasks/page"

const TasksListView = ({status, tasks, loading}: {status: string, tasks: Task[], loading: boolean}) => {
  const router = useRouter()

  const handleDeleteClient = (task: string) => {
    console.log(task)
  }
  
  return (
        <>
        <div>
        <Table>
            <TableBody>
                {tasks.length > 0 ? tasks.map((task) => (
                <TableRow key={task.task} className="cursor-pointer">
                    <TableCell colSpan={4}>
                    <div className="flex flex-col mb-2 gap-y-1">
                        <div className="flex items-center justify-between">
                        <p>Created On: {new Date(task.createdAt).toDateString()}</p>
                        <DropdownMenu >
                            <DropdownMenuTrigger asChild>
                            <Button variant="outline">Actions <ChevronDown /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent onClick={(e) => {e.stopPropagation()}}>
                            <AlertPopup  handleDeleteClient={() => handleDeleteClient(task.task)}>
                                <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>{status === "Completed" ? "Mark as Pending" : "Mark as Completed"}</DropdownMenuItem>
                            </AlertPopup>
                            <DropdownMenuItem onClick={() => {router.push(`/tasks/edit/${task.task}`)}}>Edit</DropdownMenuItem>
                            <AlertPopup  handleDeleteClient={() => handleDeleteClient(task.task)}>
                                <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>Delete</DropdownMenuItem>
                            </AlertPopup>
                            <AlertPopup  handleDeleteClient={() => handleDeleteClient(task.task)}>
                                <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>Documents</DropdownMenuItem>
                            </AlertPopup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                        <h2 className="text-xl font-bold break-words whitespace-pre-wrap w-4/5">{task.task}</h2>
                        {task.caseId && <p className="mt-2 break-words whitespace-pre-wrap max-w-4/5">Linked to: 
                            <a href={`/case-tracking/view/${task.caseId._id}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ms-2">F.No. {task.caseId.fileNo} | {task.caseId.caseTitle} | {task.caseId.caseNo}</a>
                        </p>}
                        {task.resourceName && <p className="mt-2">Resource: {task.resourceName}</p>}
                        <p>Due on: {new Date(task.dueDate).toDateString()}, {task.dueTime}</p>
                    </div>
                    </TableCell>
                </TableRow>
                )) : loading ? (
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
                    No {status} tasks found
                    </TableCell>
                </TableRow>
                )}
            </TableBody>
        </Table>
        </div>
        {tasks && tasks.length > 25 && <>
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
export default TasksListView