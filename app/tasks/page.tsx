"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import TasksListView from "@/components/task/tasksListView"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowDownNarrowWide } from "lucide-react"
import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AddTaskForm from "@/components/Forms/addTaskForm"
import { Case } from "../case-tracking/page"

export interface Task {
    _id: string;
    task: string;
    caseId: Case | null;
    dueDate: string;
    dueTime: string;
    reminder: string;
    resourceType: string;
    resourceName: string | null;
    fieldToShow: string;
    referenceFile: string;
    status: string;
    taskCompletedRemarks: string | null;
    createdAt: string;
    updatedAt: string;
}

const Tasks = () => {
    const { isOpen } = useSidebar()
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [taskStatus, setTaskStatus] = useState<"pending" | "completed">("pending");
    const [updateTrigger, setUpdateTrigger] = useState(0);
    const [loading, setLoading] = useState(false);

    const handleAddTask = () => {
        setShowTaskForm(true)
    }

    useEffect(() => {
        setTasks([])
        setLoading(true)
        const fetchTasks = async () => {
            const response = await fetch(`/api/userdetails/tasks?status=${taskStatus}`)
            const data = await response.json()
            setTasks(data.tasks)
            setLoading(false)
        }
        fetchTasks()
    }, [taskStatus, updateTrigger])

    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] min-h-screen w-full md:p-6 p-2 transition-all duration-300", isOpen ? "lg:ml-54" : "lg:ml-13.5")}>
            <div className="max-w-[1400px] w-full mx-auto">
            <Navbar location="Tasks" />
                <div className="flex items-center">
                    <div className="flex items-center gap-x-2 w-full">
                        <Input placeholder="Search" className="border border-gray-200 rounded-lg bg-gray-50 w-80" />
                        <div className="flex items-center gap-x-2 ms-auto">
                            <Button variant="outline"><ArrowDownNarrowWide /> Sort</Button>
                            <Button onClick={() => {handleAddTask()}} variant="secondary">
                            Add New Task
                            </Button>
                        </div>
                    </div>
                </div>
                <hr className="my-2" />
                <Tabs defaultValue="pending" value={taskStatus} onValueChange={(value) => setTaskStatus(value as "pending" | "completed")} className="w-full">
                    <TabsList>
                        <TabsTrigger value="pending">Pending</TabsTrigger>
                        <TabsTrigger value="completed">Completed</TabsTrigger>
                    </TabsList>
                    <TabsContent value="pending">
                        <TasksListView status={taskStatus} tasks={tasks} loading={loading} setTrigger={setUpdateTrigger} />
                    </TabsContent>
                    <TabsContent value="completed">
                        <TasksListView status={taskStatus} tasks={tasks} loading={loading} setTrigger={setUpdateTrigger} />
                    </TabsContent>
                </Tabs>
                {showTaskForm && <AddTaskForm  setShowTaskForm={setShowTaskForm} setUpdateTrigger={setUpdateTrigger} />}
            </div>
        </div>
    </div>
  )
}
export default Tasks