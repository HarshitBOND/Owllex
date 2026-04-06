"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import AddTaskForm from "@/components/Forms/addTaskForm"
import MergedTaskWorkspace from "@/components/task/MergedTaskWorkspace"
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
    priority?: "low" | "medium" | "high" | "urgent";
    category?: "hearing" | "filing" | "deposition" | "client-meeting" | "research" | "case-review" | "motion" | "discovery";
    createdAt: string;
    updatedAt: string;
}

const Tasks = () => {
    const { isOpen } = useSidebar()
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [updateTrigger, setUpdateTrigger] = useState(0);
    const [loading, setLoading] = useState(false);

    const handleRefresh = () => {
      setUpdateTrigger((prev) => prev + 1)
    }

    useEffect(() => {
        setTasks([])
        setLoading(true)

        const fetchTasks = async () => {
            try {
              const [pendingResponse, completedResponse] = await Promise.all([
                fetch(`/api/userdetails/tasks?status=pending`),
                fetch(`/api/userdetails/tasks?status=completed`),
              ])

              const [pendingData, completedData] = await Promise.all([
                pendingResponse.json(),
                completedResponse.json(),
              ])

              const pendingTasks = pendingData.tasks ?? []
              const completedTasks = completedData.tasks ?? []
              const mergedTasks = [...pendingTasks, ...completedTasks]

              setTasks(mergedTasks)
            } finally {
              setLoading(false)
            }
        }

        fetchTasks()
    }, [updateTrigger])

    return (
    <div className="flex">
        <Sidebar />
        <div className={cn("bg-[#F3F5F9] dark:bg-background min-h-screen w-full md:p-6 p-2 pb-20 lg:pb-6 transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
            <div className="max-w-[1400px] w-full mx-auto">
            <Navbar location="Tasks" />
            <MergedTaskWorkspace
              tasks={tasks}
              loading={loading}
              onAddTask={() => setShowTaskForm(true)}
              onRefresh={handleRefresh}
            />

            {showTaskForm && <AddTaskForm setShowTaskForm={setShowTaskForm} setUpdateTrigger={setUpdateTrigger} />}
            </div>
        </div>
    </div>
  )
}
export default Tasks