"use client"

import { useState, useEffect } from "react"
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
import { ChevronDown, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { AlertPopup } from "../common/AlertPopup"

interface Task {
  task: string;
  case: string;
  dueDate: string;
  dueTime: string;
  reminder: string;
  resourceType: string;
  resourceName: string;
  fieldToShow: string;
  referenceFile: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const testTask = [
  {
    task: "Task 1",
    case: "Case 1",
    dueDate: "2022-01-01",
    dueTime: "12:00",
    reminder: "12:00",
    resourceType: "Resource Type 1",
    resourceName: "Resource Name 1",
    fieldToShow: "Field To Show 1",
    referenceFile: "Reference File 1",
    status: "Pending",
    createdAt: "2022-01-01",
    updatedAt: "2022-01-01",
  },
]

const TasksListView = ({status}: {status: string}) => {
  const [tasks, setTasks] = useState<Task[]>([])
  const router = useRouter()
  const handleClientView = (task: string) => {
    router.push(`/tasks/${task}`)
  }
  const handleDeleteClient = (task: string) => {
    console.log(task)
  }
  useEffect(() => {
    setTasks(testTask)
  }, [status])
  
  return (
        <>
        <div>
        <Table>
            <TableBody>
                {tasks.length > 0 ? tasks.map((task) => (
                <TableRow key={task.task} className="cursor-pointer">
                    <TableCell colSpan={4} onClick={() => handleClientView(task.task)}>
                    <div className="flex flex-col mb-2 gap-y-1">
                        <div className="flex items-center justify-between">
                        <p>Created On: {new Date(task.createdAt).toDateString()}</p>
                        <DropdownMenu >
                            <DropdownMenuTrigger asChild>
                            <Button variant="outline">Actions <ChevronDown /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent onClick={(e) => {e.stopPropagation()}}>
                            <DropdownMenuItem onClick={() => {router.push(`/tasks/edit/${task.task}`)}}>Edit</DropdownMenuItem>
                            <AlertPopup  handleDeleteClient={() => handleDeleteClient(task.task)}>
                                <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>Delete</DropdownMenuItem>
                            </AlertPopup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                        <h2 className="text-2xl font-bold">{task.task}</h2>
                        <p>{task.case}</p>
                        <p>Contact Number: {task.dueDate}</p>
                    </div>
                    </TableCell>
                </TableRow>
                )) : tasks ? (
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