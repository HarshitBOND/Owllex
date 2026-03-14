"use client"

import { Loader2, X } from "lucide-react"
import { Button } from "../ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Label } from "../ui/label"
import { useState, useEffect } from "react"
import { Input } from "../ui/input"
import { Calendar22 } from "../common/datePick"
import { FileDropzone } from "../common/fileDropzone"
import ComboBox from "../common/comboBox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type TaskPriority = "low" | "medium" | "high" | "urgent"
type TaskCategory =
    | "hearing"
    | "filing"
    | "deposition"
    | "client-meeting"
    | "research"
    | "case-review"
    | "motion"
    | "discovery"

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
]

const CATEGORY_OPTIONS: { value: TaskCategory; label: string }[] = [
    { value: "hearing", label: "⚖️ Hearing" },
    { value: "filing", label: "📋 Filing" },
    { value: "deposition", label: "🎤 Deposition" },
    { value: "client-meeting", label: "🤝 Client Meeting" },
    { value: "research", label: "🔍 Legal Research" },
    { value: "case-review", label: "📂 Case Review" },
    { value: "motion", label: "📝 Motion" },
    { value: "discovery", label: "🔎 Discovery" },
]

const AddTaskForm = ( {setShowTaskForm, setUpdateTrigger}: {setShowTaskForm: (showTaskForm: boolean) => void, setUpdateTrigger: React.Dispatch<React.SetStateAction<number>>} ) => {
    const [resourceType, setResourceType] = useState<"None" | "Case">("None");
    const [clientCases, setClientCases] = useState([]);
    const [selectedClientCase, setSelectedClientCase] = useState("");
    const [fieldToShow, setFieldToShow] = useState({
        caseInfo: false,
        caseNo: false,
    });
    const [reminderTimeUnit, setReminderTimeUnit] = useState("minutes");
    const [reminderTime, setReminderTime] = useState("30");
    const [files, setFiles] = useState<string[]>([]);
    const [dueTime, setDueTime] = useState("");
    const [task, setTask] = useState("");
    const [dueDate, setDueDate] = useState<Date | undefined>(new Date());
    const [priority, setPriority] = useState<TaskPriority>("medium");
    const [category, setCategory] = useState<TaskCategory>("case-review");
    const [addingTask, setAddingTask] = useState(false);
    const [resourceName, setResourceName] = useState("");
    const [submitError, setSubmitError] = useState("");


    useEffect(() => {

        const fetchCases = async () => {
            const response = await fetch(`/api/userdetails/cases`)
            const data = await response.json()

            const cases = (data.userCases?.cases ?? []).map((caseFound: any) => {
                return {
                    value: caseFound._id,
                    label: `F.No. ${caseFound.fileNo} | ${caseFound.caseNo} - ${caseFound.caseTitle}`
                }
            })
            setClientCases(cases)
        }

        if (resourceType === "Case") {
            fetchCases();
        }
        
    }, [resourceType])
    
    const onChange = (file: string | null, type: "add" | "remove") => {
        if (type === "add") {
            setFiles(prev => [...prev, file || ""])
        } else {
            setFiles(prev => prev.filter((f) => f !== file))
        }
    }

    const handleAddTask = async () => {
        setSubmitError("")
        setAddingTask(true)
        if (!task || !dueDate) {
            setSubmitError("Task title and due date are required.")
            setAddingTask(false)
            return
        }

        if (resourceType === "Case" && !selectedClientCase) {
            setSubmitError("Select a case before adding a case-linked task.")
            setAddingTask(false)
            return
        }

        const baseFormData = {
        task,
        dueDate,
        dueTime,
        reminder: {
            reminderTime,
            reminderTimeUnit,
        },
        resourceType,
        fieldToShow: resourceType === "Case" ? fieldToShow : undefined,
        referenceFiles: files,
        status: "pending",
        taskCompletedRemarks: "",
        priority,
        category,
        }

        const formData =
        resourceType === "Case"
            ? {
                ...baseFormData,
                caseId: selectedClientCase,
                resourceName: null,
            }
            : {
                ...baseFormData,
                caseId: null,
                resourceName,
            }

        const response = await fetch(`/api/userdetails/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(formData)
        })

        const data = await response.json()

        if (!response.ok || !data.success) {
            setSubmitError(data?.message || "Task could not be added. Please try again.")
            setAddingTask(false)
            return
        }

        setAddingTask(false)
        setShowTaskForm(false)
        setUpdateTrigger(prev => prev + 1)
    }
    
    return (
        <div className="fixed top-0 left-0 w-full h-full bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg min-w-220 max-h-136.5 overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Add Task</h2>
                    <Button variant="outline" onClick={() => setShowTaskForm(false)}>
                        <X />
                    </Button>
                </div>
                <hr className="my-2" />
                <div className="flex gap-x-2 mt-4">
                    <div className="flex flex-col gap-y-2">
                        <Label className="text-sm font-semibold">Resource Type</Label>
                        <ButtonGroup>
                            <Button onClick={() => setResourceType("None")} variant={resourceType === "None" ? "secondary" : "outline"}>None</Button>
                            <Button onClick={() => setResourceType("Case")} variant={resourceType === "Case" ? "secondary" : "outline"}>Case</Button>
                        </ButtonGroup>
                    </div>
                    <div className="flex flex-1 flex-col gap-y-2">
                        <Label className="text-sm font-semibold">Resource Name</Label>
                        {resourceType === "None" ? 
                        <Input placeholder="Resource Name" className="border-2 border-gray-200 rounded-lg bg-gray-50" value={resourceName} onChange={(e) => setResourceName(e.target.value)}/> 
                        : 
                        <ComboBox className="w-full! max-w-125" dropdownItems={clientCases} type="" value={selectedClientCase} setValue={setSelectedClientCase} />}
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="text-sm font-semibold">Select Fields</Label>
                        <ButtonGroup>
                            <Button disabled={resourceType === "None"} onClick={() => setFieldToShow({ ...fieldToShow, caseInfo: !fieldToShow.caseInfo })} variant={fieldToShow.caseInfo ? "secondary" : "outline"}>Case Name</Button>
                            <Button disabled={resourceType === "None"} onClick={() => setFieldToShow({ ...fieldToShow, caseNo: !fieldToShow.caseNo })} variant={fieldToShow.caseNo ? "secondary" : "outline"}>Case No</Button>
                        </ButtonGroup>
                    </div>
                </div>

                <div className="flex flex-col gap-y-2 mt-4">
                    <Label className="text-sm font-semibold">Task <span className="text-red-500">*</span></Label>
                    <Input placeholder="Type your task here" className="border-2 border-gray-200 rounded-lg bg-gray-50" value={task} onChange={(e) => setTask(e.target.value)} />
                </div>

                <div className="grid grid-cols-1 gap-2 mt-4 md:grid-cols-2">
                    <div className="flex flex-col gap-y-2">
                        <Label className="text-sm font-semibold">Urgency</Label>
                        <Select value={priority} onValueChange={(val) => setPriority(val as TaskPriority)}>
                            <SelectTrigger className="border-2 border-gray-200 rounded-lg bg-gray-50">
                                <SelectValue placeholder="Select urgency" />
                            </SelectTrigger>
                            <SelectContent>
                                {PRIORITY_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-y-2">
                        <Label className="text-sm font-semibold">Category</Label>
                        <Select value={category} onValueChange={(val) => setCategory(val as TaskCategory)}>
                            <SelectTrigger className="border-2 border-gray-200 rounded-lg bg-gray-50">
                                <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                                {CATEGORY_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex gap-x-2 mt-4">
                        <div className="flex flex-col gap-y-2 flex-1">
                            <Label className="text-sm font-semibold">Due Date<span className="text-red-500">*</span></Label>
                            <Calendar22 date={dueDate} setDate={setDueDate} buttonVariant="outline" />
                        </div>
                        <div className="flex flex-col gap-y-2 flex-1">
                            <Label className="text-sm font-semibold">Due Time</Label>
                            <Input placeholder="Due Time" type="time" className="no-time-indicator border-2 border-gray-200 rounded-lg bg-gray-50 w-full" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-y-2 flex-1">
                            <Label className="text-sm font-semibold">Reminder</Label>
                            <div className="flex gap-x-2">
                                <Input defaultValue={reminderTime} onChange={(e) => setReminderTime(e.target.value)} className="border-2 border-gray-200 rounded-lg bg-gray-50" />
                                <Select
                                value={reminderTimeUnit}
                                onValueChange={(val) => setReminderTimeUnit(val)}
                                >
                                <SelectTrigger className="border-2 border-gray-200 rounded-lg bg-gray-50">
                                    <SelectValue placeholder="Select unit" />
                                </SelectTrigger>

                                <SelectContent>
                                    <SelectItem value="minutes">Minutes</SelectItem>
                                    <SelectItem value="hours">Hours</SelectItem>
                                    <SelectItem value="days">Days</SelectItem>
                                </SelectContent>
                                </Select>
                                <Button variant="link" onClick={() => {setReminderTimeUnit(""); setReminderTime("")}} className="p-0">
                                    <X className="text-gray-500" />
                                </Button>
                            </div>
                        </div>
                </div>

                <div className="flex flex-col gap-y-2 mt-4">
                    <Label className="text-sm font-semibold">Upload File</Label>
                    <FileDropzone onChange={onChange} />
                </div>

                {submitError ? <p className="mt-4 text-sm text-red-500">{submitError}</p> : null}

                <div className="flex items-center justify-end gap-x-2 mt-4">
                    <Button variant="outline" onClick={() => setShowTaskForm(false)}>Cancel</Button>
                    <Button onClick={() => handleAddTask()} disabled={addingTask}>
                        {addingTask ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : ""}
                        {addingTask ? "Adding Task..." : "Add Task"}
                    </Button>
                </div>
            </div>
        </div>
    )
}
export default AddTaskForm