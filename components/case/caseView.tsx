"use client"

import { Case } from '@/app/case-tracking/page';
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AlertPopup } from '../common/AlertPopup';
import { ChevronDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import RichTextEditor from '../common/richTextEditor';
import DisplayNotes from '../common/displayNotes';
import { Note } from '../client/clientView';
import FilingsList from './filingsList';
import { Client } from '@/app/my-clients/page';
import ContactsList from './contactsList';
import { Task } from '@/app/tasks/page';
import TasksListView from '../task/tasksListView';

export interface Filing {
    srlNo: string;
    date: string;
    filingDetails: string;
    _id: string;
}

const CaseView = ({id}: {id: string}) => {
    const [caseData, setCaseData] = useState<Case | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{message: string} | null>(null);
    const [trigger, setTrigger] = useState<number>(0);
    const [notes, setNotes] = useState<Note[]>([]);
    const [filings, setFilings] = useState<Filing[]>([]);
    const [contacts, setContacts] = useState<Client[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [taskStatus, setTaskStatus] = useState("pending");

    useEffect(() => {
        const fetchCaseData = async () => {
            try {
                setLoading(true);
                const response = await fetch(`/api/userdetails/cases?id=${id}`);
                const data = await response.json();
                console.log(data)
                setCaseData(data.caseFound);
                setNotes(data.caseFound.notes);
                setFilings(data.caseFound.filingDetails);
                setContacts(data.caseFound.clients);
                setTasks(data.caseFound.tasks);
            } catch (error) {
                setError(error as {message: string});
            } finally {
                setLoading(false);
            }
        };
        fetchCaseData();
    }, [id, trigger]);

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error?.message}</div>;
    }

    const handleDeleteCase = async (id: string) => {
        try {
            const response = await fetch(`/api/userdetails/cases?id=${id}`, {
                method: "DELETE",
            });
            const data = await response.json();
            console.log(data)
            if (data.success) {
                alert("Case deleted successfully");
                window.location.reload();
            }
        } catch (error) {
            console.error(error);
        }
    }

    return (
        <div>
            <div className='flex items-center justify-between text-sm'>
                <div>
                    <div className='flex gap-x-18'>
                        <div className='flex gap-x-2 items-end'>
                            <span className="font-semibold">File No.</span>
                            <span>{caseData?.fileNo}</span>
                        </div>
                        <div className='flex gap-x-2 items-end'>
                            <span className="font-semibold">Billing Currency</span>
                            <span>INR</span>
                        </div>
                    </div>
                    <div className='flex gap-x-16'>
                        <span className='font-semibold'>{caseData?.caseNo}</span>
                        <span className='font-semibold'>Delhi High Court</span>
                    </div>
                </div>
                <div className='py-1.5 px-4 rounded-md border border-gray-200 bg-gray-200 cursor-pointer'>
                    {caseData?.status}
                </div>
            </div>
            <hr className='my-4' />
            <div className='flex gap-x-2 w-full'>
                <div className='w-3/5'>
                    <h1 className='font-semibold text-lg'>{caseData?.caseTitle}</h1>
                    <div className='flex flex-col gap-y-2 mt-4'>
                        <div>
                            <span className="font-semibold">Stage: </span>
                            <span>{caseData?.caseStage || "Short Matters/case Management Hearings/pre-Trial Conferences/framing Of Issues"}</span>
                        </div>
                        <div>
                            <span className="font-semibold">Remarks: </span>
                            <span>{caseData?.remarks || "No Remarks"}</span>
                        </div>
                    </div>
                    <div className='flex items-center justify-between mt-2'>
                        <div className='flex flex-col gap-y-2'>
                            <div>
                                <span className="font-semibold">Court Jurisdiction (State): </span>
                                <span>Delhi</span>
                            </div>
                            <div>
                                <span className="font-semibold">Court Jurisdiction (District): </span>
                                <span>Delhi</span>
                            </div>
                            <div>
                                <span className="font-semibold">Registration Date: </span>
                                <span>{caseData?.registrationDate}</span>
                            </div>
                        </div>

                        <div className='flex flex-col gap-y-2'>
                            <div>
                                <span className="font-semibold">Date of Filing: </span>
                                <span>{caseData?.fillingDate}</span>
                            </div>
                            <div>
                                <span className="font-semibold">Filing Advocate: </span>
                                <span>{caseData?.fillingAdvocate}</span>
                            </div>
                            <div>
                                <span className="font-semibold">CNR No: </span>
                                <span>{caseData?.cnrNo}</span>
                            </div>
                        </div>

                    </div>
                    <div className='flex flex-col mt-2'>
                        <div>
                            <span className="font-semibold">Advocates: </span>
                            <span>{caseData?.advocate}</span>
                        </div>
                    </div>
                </div>
                <div className='w-2/5'>
                    <div className='border border-gray-200 rounded-md bg-background w-4/5 h-40 ms-auto'>

                    </div>
                    <div className='ms-auto w-fit mt-4 flex gap-x-2'>
                        <Button variant="outline">Raise an Invoice</Button>
                        <DropdownMenu >
                            <DropdownMenuTrigger asChild>
                            <Button variant="outline">Actions <ChevronDown /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent onClick={(e) => {e.stopPropagation()}}>
                            <DropdownMenuItem >Update</DropdownMenuItem>
                            <DropdownMenuItem >Edit</DropdownMenuItem>
                            <AlertPopup type="delete"  handleFunction={() => handleDeleteCase(id)}>
                                <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>Delete</DropdownMenuItem>
                            </AlertPopup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            <hr className='my-4' />

            <Tabs defaultValue="notes" className="w-full">
            <TabsList className="gap-x-2">
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="filings">Filings</TabsTrigger>
                <TabsTrigger value="listings">Listings</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>  
            </TabsList>
            <TabsContent value="notes">
                <RichTextEditor id={id} setTrigger={setTrigger} source="case" />
                <DisplayNotes id={id} setTrigger={setTrigger} notes={notes} source="case" />
            </TabsContent>
            <TabsContent value="filings">
                <FilingsList filings={filings} />
            </TabsContent>
            <TabsContent value="listings">
            </TabsContent>
            <TabsContent value="contacts">
                <ContactsList contacts={contacts} loading={loading} setTrigger={setTrigger} id={id} />
            </TabsContent>
            <TabsContent value="invoices">
            </TabsContent>
            <TabsContent value="tasks">
                <hr className='mt-2 mb-4' />
                <Tabs defaultValue="pending" value={taskStatus} onValueChange={(value) => setTaskStatus(value)} className="w-full">
                    <TabsList>
                        <TabsTrigger value="pending">Pending</TabsTrigger>
                        <TabsTrigger value="completed">Completed</TabsTrigger>
                    </TabsList>
                    <TabsContent value="pending">
                        <TasksListView status={taskStatus} tasks={tasks.filter(task => task.status === "pending")} loading={loading} caseDetails={{fileNo: caseData?.fileNo || "", caseTitle: caseData?.caseTitle || "", caseNo: caseData?.caseNo || ""}} setTrigger={setTrigger}/>
                    </TabsContent>
                    <TabsContent value="completed">
                        <TasksListView status={taskStatus} tasks={tasks.filter(task => task.status === "completed")} loading={loading} caseDetails={{fileNo: caseData?.fileNo || "", caseTitle: caseData?.caseTitle || "", caseNo: caseData?.caseNo || ""}} setTrigger={setTrigger}/>
                    </TabsContent>
                </Tabs>
            </TabsContent>
            <TabsContent value="documents">
            </TabsContent>
            </Tabs>
        </div>
    )
}
export default CaseView