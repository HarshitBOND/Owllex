"use client"

import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import TasksListView from "@/components/task/tasksListView"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowDownNarrowWide, Loader2 } from "lucide-react"
import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const Tasks = () => {
    const { isOpen } = useSidebar()
    const [addingTask, setAddingTask] = useState(false)
    const handleAddTask = () => {
        setAddingTask(true)
        new Promise((resolve) => setTimeout(resolve, 1000))
        .then(() => {
        setAddingTask(false)
    })
    }
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
                            <Button onClick={() => {setAddingTask(true); handleAddTask()}} disabled={addingTask} variant="secondary">
                            {addingTask && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {addingTask ? "Adding..." : "Add New Task"}
                            </Button>
                        </div>
                    </div>
                </div>
                <hr className="my-2" />
                <Tabs defaultValue="pending" className="w-full">
                    <TabsList>
                        <TabsTrigger value="pending">Pending</TabsTrigger>
                        <TabsTrigger value="completed">Completed</TabsTrigger>
                    </TabsList>
                    <TabsContent value="pending">
                        <TasksListView status="pending" />
                    </TabsContent>
                    <TabsContent value="completed">
                        <TasksListView status="completed" />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    </div>
  )
}
export default Tasks