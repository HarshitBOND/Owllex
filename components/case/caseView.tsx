"use client"

import { Case } from '@/app/case-tracking/page';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import NoteEditor from '../editor/Index';
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

export interface Listing {
    srlNo: string;
    date: string;
    listingDetails: string;
    _id?: string;
}

export interface CauseListInfo {
    _id: string;
    list_type?: string;
    list_date?: string;
    court_no?: string;
    bench?: string;
    judge?: string;
    section?: string;
    item_no?: string;
    main_case_no?: string;
    petitioner?: string;
    respondent?: string;
    advocate_petitioner?: string;
    advocate_respondent?: string;
    parsed_at?: string;
}

// Parse DD.MM.YYYY or DD/MM/YYYY to a displayable string
function parseCauseListDate(dateStr?: string): string {
    if (!dateStr) return 'Date TBD';
    const parts = dateStr.split(/[./]/);
    if (parts.length === 3) {
        const [dd, mm, yyyy] = parts;
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const monthName = months[parseInt(mm, 10) - 1] || mm;
        return `${dd} ${monthName} ${yyyy}`;
    }
    return dateStr;
}

const CaseView = ({id}: {id: string}) => {
    const router = useRouter();
    const [caseData, setCaseData] = useState<Case | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{message: string} | null>(null);
    const [trigger, setTrigger] = useState<number>(0);
    const [notes, setNotes] = useState<Note[]>([]);
    const [filings, setFilings] = useState<Filing[]>([]);
    const [listings, setListings] = useState<Listing[]>([]);
    const [contacts, setContacts] = useState<Client[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [taskStatus, setTaskStatus] = useState("pending");
    const [newListingDate, setNewListingDate] = useState("");
    const [newListingDetails, setNewListingDetails] = useState("");
    const [causeListInfo, setCauseListInfo] = useState<CauseListInfo | null>(null);

    useEffect(() => {
        const fetchCaseData = async () => {
            try {
                setLoading(true);
                const response = await fetch(`/api/userdetails/cases?id=${id}`);
                const data = await response.json();
                console.log("📋 Case Data Fetched:", data.caseFound);
                console.log("📋 Listings/Hearings:", data.caseFound.listingDetails);
                console.log("📋 Cause List Info:", data.causeListInfo);
                setCaseData(data.caseFound);
                setCauseListInfo(data.causeListInfo || null);
                setNotes(data.caseFound.notes || []);
                setFilings(data.caseFound.filingDetails || []);
                setListings(data.caseFound.listingDetails || []);
                setContacts(data.caseFound.clients || []);
                setTasks(data.caseFound.tasks || []);
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
            if (data.success) {
                router.push('/case-tracking');
            }
        } catch (error) {
            console.error(error);
        }
    }

    const handleAddListing = async () => {
        if (!newListingDate || !newListingDetails) return;
        
        try {
            const newListing: Listing = {
                srlNo: (listings.length + 1).toString(),
                date: newListingDate,
                listingDetails: newListingDetails
            };
            
            // Update locally
            setListings([...listings, newListing]);
            setNewListingDate("");
            setNewListingDetails("");
            
            // Try to save to backend (optional)
            try {
                await fetch(`/api/userdetails/cases/${id}/add-listing`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(newListing)
                });
            } catch (err) {
                console.warn("Note: Listing added locally but backend save not yet implemented");
            }
        } catch (error) {
            console.error("Error adding listing:", error);
        }
    }

    return (
        <div>
            <div className='flex items-center justify-between text-sm mb-4'>
                <div className='space-y-3'>
                    <div className='flex gap-x-8'>
                        <div className='flex gap-x-2 items-end'>
                            <span className="font-semibold">File No.</span>
                            <span className='text-gray-700'>{caseData?.fileNo || 'N/A'}</span>
                        </div>
                        <div className='flex gap-x-2 items-end'>
                            <span className="font-semibold">Case No.</span>
                            <span className='text-gray-700'>{caseData?.caseNo}</span>
                        </div>
                    </div>
                    <div className='flex gap-x-8'>
                        {caseData?.courtName && (
                            <div className='flex gap-x-2 items-end'>
                                <span className="font-semibold">Court</span>
                                <span className='text-gray-700'>{caseData.courtName}</span>
                            </div>
                        )}
                        <div className='flex gap-x-2 items-end'>
                            <span className="font-semibold">Status</span>
                            <span className={`px-3 py-1 rounded-md text-white text-xs font-semibold ${
                                caseData?.status?.toLowerCase().includes('active') ? 'bg-green-500' :
                                caseData?.status?.toLowerCase().includes('pending') ? 'bg-yellow-500' :
                                caseData?.status?.toLowerCase().includes('disposed') || caseData?.status?.toLowerCase().includes('closed') ? 'bg-gray-500' :
                                'bg-blue-500'
                            }`}>
                                {caseData?.status || 'Active'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <hr className='my-4' />
            <div className='flex gap-x-6 w-full'>
                <div className='w-3/5'>
                    <h1 className='font-semibold text-lg'>{caseData?.caseTitle}</h1>
                    
                    {/* Upcoming Hearing Section - Cause List data takes priority */}
                    {causeListInfo?.list_date ? (
                        <div className='mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded shadow-md'>
                            <h3 className='font-semibold text-red-900 flex items-center gap-2 text-lg'>
                                🔴 NEXT HEARING DATE
                            </h3>
                            <div className='mt-3 space-y-2'>
                                <div className='p-3 bg-red-100 rounded border-2 border-red-300'>
                                    <div className="text-lg font-bold text-red-800">
                                        📅 {parseCauseListDate(causeListInfo.list_date)}
                                    </div>
                                    {causeListInfo.list_type && (
                                        <div className="text-xs text-red-600 mt-1">{causeListInfo.list_type}</div>
                                    )}
                                </div>
                                {causeListInfo.judge && (
                                    <div>
                                        <span className="text-gray-700 font-semibold text-sm">⚖️ Bench:</span>
                                        <div className="text-sm text-gray-900 mt-1 p-2 bg-white rounded border border-gray-200">{causeListInfo.judge}</div>
                                    </div>
                                )}
                                {causeListInfo.section && (
                                    <div>
                                        <span className="text-gray-700 font-semibold text-sm">📌 Section:</span>
                                        <div className="text-sm text-gray-900 mt-1">{causeListInfo.section}</div>
                                    </div>
                                )}
                                <div className="flex gap-4 text-sm">
                                    {causeListInfo.court_no && (
                                        <div>
                                            <span className="text-gray-600 text-xs">Court No:</span>
                                            <div className="font-semibold">{causeListInfo.court_no}</div>
                                        </div>
                                    )}
                                    {causeListInfo.item_no && (
                                        <div>
                                            <span className="text-gray-600 text-xs">Item No:</span>
                                            <div className="font-semibold">{causeListInfo.item_no}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (listings.length > 0 && listings[0]?.date) || caseData?.courtDate ? (
                        <div className='mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded shadow-md'>
                            <h3 className='font-semibold text-red-900 flex items-center gap-2 text-lg'>
                                🔴 UPCOMING HEARING
                            </h3>
                            <div className='mt-3 space-y-2'>
                                <div className='p-3 bg-red-100 rounded border-2 border-red-300'>
                                    <div className="text-lg font-bold text-red-800">
                                        📅 {listings[0]?.date || (caseData?.courtDate ? new Date(caseData.courtDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date TBD')}
                                    </div>
                                </div>
                                {listings[0]?.listingDetails ? (
                                    <div>
                                        <span className="text-gray-700 font-semibold text-sm">📌 Court Details:</span>
                                        <div className="text-base text-gray-900 mt-2 p-3 bg-white rounded border-2 border-gray-200">{listings[0]?.listingDetails}</div>
                                    </div>
                                ) : caseData?.remarks && (
                                    <div>
                                        <span className="text-gray-700 font-semibold text-sm">📝 Remarks:</span>
                                        <div className="text-base text-gray-900 mt-2 p-3 bg-white rounded border-2 border-gray-200">{caseData.remarks}</div>
                                    </div>
                                )}
                                {caseData?.courtRoom && (
                                    <div>
                                        <span className="text-gray-700 font-semibold text-sm">🏢 Court Room:</span>
                                        <div className="text-base text-gray-900 mt-1">{caseData.courtRoom}</div>
                                    </div>
                                )}
                                {caseData?.courtName && (
                                    <div>
                                        <span className="text-gray-700 font-semibold text-sm">⚖️ Court:</span>
                                        <div className="text-base text-gray-900 mt-1">{caseData.courtName}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className='mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded shadow-md'>
                            <h3 className='font-semibold text-yellow-900 flex items-center gap-2 text-lg'>
                                ⚠️ NO UPCOMING HEARING FOUND
                            </h3>
                            <p className='text-sm text-gray-700 mt-2'>Go to the "Listings" tab to add an upcoming hearing date and details.</p>
                        </div>
                    )}

                    {/* Case Details Grid */}
                    <div className='mt-6'>
                        <h3 className='font-semibold text-sm mb-3 text-gray-700'>Case Details</h3>
                        <div className='grid grid-cols-2 gap-4'>
                            {caseData?.caseStage && (
                                <div className='border rounded p-3'>
                                    <span className="text-xs text-gray-600">Stage</span>
                                    <div className="font-semibold text-sm">{caseData.caseStage}</div>
                                </div>
                            )}
                            {caseData?.registrationDate && (
                                <div className='border rounded p-3'>
                                    <span className="text-xs text-gray-600">Registration Date</span>
                                    <div className="font-semibold text-sm">{new Date(caseData.registrationDate).toLocaleDateString('en-IN')}</div>
                                </div>
                            )}
                            {caseData?.fillingDate && (
                                <div className='border rounded p-3'>
                                    <span className="text-xs text-gray-600">Filing Date</span>
                                    <div className="font-semibold text-sm">{new Date(caseData.fillingDate).toLocaleDateString('en-IN')}</div>
                                </div>
                            )}
                            {caseData?.advocate && (
                                <div className='border rounded p-3'>
                                    <span className="text-xs text-gray-600">Advocate</span>
                                    <div className="font-semibold text-sm">{caseData.advocate}</div>
                                </div>
                            )}
                            {caseData?.fillingAdvocate && (
                                <div className='border rounded p-3'>
                                    <span className="text-xs text-gray-600">Filing Advocate</span>
                                    <div className="font-semibold text-sm">{caseData.fillingAdvocate}</div>
                                </div>
                            )}
                            {caseData?.cnrNo && (
                                <div className='border rounded p-3'>
                                    <span className="text-xs text-gray-600">CNR No</span>
                                    <div className="font-semibold text-sm">{caseData.cnrNo}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Remarks if available */}
                    {caseData?.remarks && (
                        <div className='mt-4'>
                            <span className="text-sm font-semibold">Remarks</span>
                            <p className='text-sm text-gray-700 mt-1'>{caseData.remarks}</p>
                        </div>
                    )}
                </div>
                <div className='w-2/5'>
                    <div className='border-2 border-gray-200 rounded-md bg-blue-50 p-4'>
                        <h3 className='font-semibold text-sm mb-3'>Case Summary</h3>
                        <div className='space-y-3 text-sm'>
                            <div>
                                <span className="text-gray-600">Case No:</span>
                                <div className="font-semibold">{caseData?.caseNo}</div>
                            </div>
                            <div>
                                <span className="text-gray-600">Status:</span>
                                <div className="font-semibold">{caseData?.status || 'Active'}</div>
                            </div>
                            {caseData?.courtName && (
                                <div>
                                    <span className="text-gray-600">Court:</span>
                                    <div className="font-semibold">{caseData.courtName}</div>
                                </div>
                            )}
                            {caseData?.courtValue && (
                                <div>
                                    <span className="text-gray-600">Court Value:</span>
                                    <div className="font-semibold">{caseData.courtValue}</div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className='ms-auto w-full mt-4 flex flex-col gap-2'>
                        <Button variant="outline" onClick={() => router.push('/invoices')} className="w-full">Raise an Invoice</Button>
                        <DropdownMenu >
                            <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full">Actions <ChevronDown /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent onClick={(e) => {e.stopPropagation()}}>
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
                    <NoteEditor />
                    <DisplayNotes id={id} setTrigger={setTrigger} notes={notes} source="case" />
            </TabsContent>
            <TabsContent value="filings">
                <FilingsList filings={filings} />
            </TabsContent>
            <TabsContent value="listings">
                <div className="px-2">
                    <h1 className="font-semibold text-lg my-4">Hearing Listings</h1>
                    
                    {/* Add New Hearing Form */}
                    <div className='mb-6 p-4 bg-blue-50 border rounded-md'>
                        <h3 className='font-semibold text-sm mb-3'>📝 Add New Hearing Date</h3>
                        <div className='space-y-3'>
                            <div>
                                <label className='text-xs font-semibold text-gray-700'>Hearing Date</label>
                                <input 
                                    type="date"
                                    value={newListingDate}
                                    onChange={(e) => setNewListingDate(e.target.value)}
                                    className='w-full mt-1 px-3 py-2 border rounded-md text-sm'
                                />
                            </div>
                            <div>
                                <label className='text-xs font-semibold text-gray-700'>Hearing Details</label>
                                <textarea 
                                    value={newListingDetails}
                                    onChange={(e) => setNewListingDetails(e.target.value)}
                                    placeholder='e.g., Court Appearance, Regular Hearing, etc.'
                                    className='w-full mt-1 px-3 py-2 border rounded-md text-sm'
                                    rows={2}
                                />
                            </div>
                            <Button 
                                onClick={handleAddListing}
                                disabled={!newListingDate || !newListingDetails}
                                className='w-full bg-blue-600 hover:bg-blue-700'
                            >
                                Add Hearing
                            </Button>
                        </div>
                    </div>

                    {/* Display Listings */}
                    {listings.length > 0 ? (
                        <div className="space-y-3">
                            {/* Next Upcoming Hearing Highlight */}
                            <div className='p-4 bg-red-50 border-l-4 border-red-500 rounded-md font-semibold'>
                                <h3 className='text-red-900 mb-2'>🔴 NEXT HEARING: {listings[0]?.date || 'N/A'}</h3>
                                <p className='text-sm text-red-800'>{listings[0]?.listingDetails || 'No details'}</p>
                            </div>

                            {/* All Listings Table */}
                            <div className='mt-4'>
                                <h3 className='font-semibold text-sm mb-3 text-gray-700'>All Hearings</h3>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b-2 bg-gray-50">
                                            <th className="text-left py-3 px-3 font-semibold">#</th>
                                            <th className="text-left py-3 px-3 font-semibold">Date</th>
                                            <th className="text-left py-3 px-3 font-semibold">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {listings.map((listing, index) => (
                                            <tr key={index} className={`border-b ${index === 0 ? 'bg-red-50' : 'hover:bg-blue-50'} transition-colors`}>
                                                <td className="py-3 px-3 font-semibold">{index + 1}</td>
                                                <td className="py-3 px-3 font-bold text-red-700">{listing.date}</td>
                                                <td className="py-3 px-3 text-gray-700">{listing.listingDetails}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <p className="text-center py-8 text-gray-600 font-semibold">❌ No hearing listings yet. Add one above!</p>
                    )}
                </div>
            </TabsContent>
            <TabsContent value="contacts">
                <ContactsList contacts={contacts} loading={loading} setTrigger={setTrigger} id={id} />
            </TabsContent>
            <TabsContent value="invoices">
                <div className="text-center py-8">
                    <p className="text-muted-foreground">Invoice management for this case</p>
                    <Button variant="outline" className="mt-3" onClick={() => router.push('/invoices')}>Go to Invoices</Button>
                </div>
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
                <div className="text-center py-8">
                    <p className="text-muted-foreground">Documents linked to this case will appear here.</p>
                    {caseData?.documents && caseData.documents.length > 0 ? (
                        <div className="mt-4 space-y-2">
                            {caseData.documents.map((doc: string, i: number) => (
                                <div key={i} className="flex items-center gap-2 p-3 border rounded-md">
                                    <span className="text-sm">{doc}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </TabsContent>
            </Tabs>
        </div>
    )
}
export default CaseView