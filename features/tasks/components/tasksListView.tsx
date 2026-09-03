"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { AlertPopup } from "@/components/common/AlertPopup"
import { Task } from "@/app/tasks/page"
import { useState } from "react"
import { backendApiUrl } from "@/lib/backendApi"
import { useAuth } from "@clerk/nextjs"

const TasksListView = ({status, tasks, loading, caseDetails, setTrigger}: {status: string, tasks: Task[], loading: boolean, caseDetails?: {fileNo: string, caseTitle: string, caseNo: string}, setTrigger: React.Dispatch<React.SetStateAction<number>>}) => {
  const router = useRouter();
  const { getToken } = useAuth();
  const [remark, setRemark] = useState<string>("")

  const handleDeleteTask = async (_id: string) => {
    const token = await getToken();
    if (!token) return;

    const response = await fetch(backendApiUrl(`/api/userdetails/tasks`), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({_id}),
    });
    const data = await response.json();
    if (data.success) {
      setTrigger((prev) => prev + 1);
    }
  }

  const handleTaskMark = async (task: Task, taskStatus: string) => {
    const taskData = taskStatus === "completed" ? {
      ...task,
      status: taskStatus,
      taskCompletedRemarks: remark
    } : {
      ...task,
      status: taskStatus,
      taskCompletedRemarks: ""
    }

    console.log("[tasks] PUT /api/userdetails/tasks payload", taskData)

    const token = await getToken();
    if (!token) return;

    const response = await fetch(backendApiUrl(`/api/userdetails/tasks`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(taskData),
    });
    const data = await response.json();
    if (data.success) {
      setTrigger((prev) => prev + 1);
    }
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
                            {status === "pending" 
                            ? 
                            <AlertPopup type="mark" remark={remark} setRemark={setRemark} handleFunction={() => handleTaskMark(task, "completed")}>
                                <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>Mark as Completed</DropdownMenuItem>
                            </AlertPopup> 
                            : 
                            <DropdownMenuItem onClick={(e) => {e.stopPropagation(); handleTaskMark(task, "pending")}} onSelect={(e) => e.preventDefault()}>Mark as Pending</DropdownMenuItem>
                            }
                            <DropdownMenuItem onClick={() => {router.push(`/tasks/edit/${task._id}`)}}>Edit</DropdownMenuItem>
                            <AlertPopup type="delete" handleFunction={() => handleDeleteTask(task._id)}>
                                <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>Delete</DropdownMenuItem>
                            </AlertPopup>
                            <AlertPopup type="documents" handleFunction={() => handleDeleteTask(task._id)}>
                                <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>Documents</DropdownMenuItem>
                            </AlertPopup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                        <h2 className="text-xl font-bold break-words whitespace-pre-wrap w-4/5">{task.task}</h2>
                        {task.caseId && <p className="mt-2 break-words whitespace-pre-wrap max-w-4/5">Linked to: 
                            <a href={`/case-tracking/view/${task.caseId._id}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ms-2">F.No. {task.caseId.fileNo || caseDetails?.fileNo} | {task.caseId.caseTitle || caseDetails?.caseTitle} | {task.caseId.caseNo || caseDetails?.caseNo}</a>
                        </p>}
                        {task.resourceName && <p className="mt-2">Resource: {task.resourceName}</p>}
                        <p>Due on: {new Date(task.dueDate).toDateString()}, {task.dueTime}</p>
                    </div>
                    </TableCell>
                </TableRow>
                )) : loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell colSpan={4}>
                    <div className="flex flex-col mb-2 gap-y-2">
                        <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-9 w-24" />
                        </div>
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-1/3" />
                    </div>
                    </TableCell>
                </TableRow>
                ))
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
        <div className="flex items-center justify-center gap-2 py-2">
          <Button variant="outline" size="sm" disabled>Previous</Button>
          <Button variant="outline" size="sm" className="bg-sidebar-primary text-white">1</Button>
          <Button variant="outline" size="sm" disabled>Next</Button>
        </div>
        </>}
        </>
  )
}
export default TasksListView