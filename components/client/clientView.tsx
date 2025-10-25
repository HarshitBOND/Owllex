"use client"

import { Client } from '@/app/my-clients/page';
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from 'lucide-react';
import { AlertPopup } from '../common/AlertPopup';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import RichTextEditor from '../common/richTextEditor';
import DisplayNotes from '../common/displayNotes';
import { Case } from '@/app/case-tracking/page';
import CasesListView from '../case/casesListView';

export interface Note {
    _id: string;
    title: string;
    content: string;
    contentJson: any;
    createdAt: Date;
    updatedAt: Date;
    visibility: string;
}

const ClientView = ({id}: {id: string}) => {
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [trigger, setTrigger] = useState<number>(0)
    const [notes, setNotes] = useState<Note[]>([])
    const [cases, setCases] = useState<Case[]>([])
    const router = useRouter()

    useEffect(() => {
        const fetchClient = async () => {
            setLoading(true);
            try {
                const response = await fetch(`/api/userdetails/clients?id=${id}`);
                const data = await response.json();
                setClient(data.client);
                setNotes(data.client.notes);
                setCases(data.client.cases);
                setLoading(false);
            } catch (error) {
                console.error(error);
                setError("Failed to fetch client details");
                setLoading(false);
            }
        };
        fetchClient();
    }, [id, trigger]);

    const handleDeleteClient = (clientId: string) => {
        const deleteClient = async () => {
            const response = await fetch(`/api/userdetails/clients?id=${clientId}`, {
                method: "DELETE"
            })
            if (!response.ok) {
                throw new Error("Failed to delete client")
            }
            alert("Client deleted successfully")
        }
        try {
            deleteClient()
        } catch (error) {
            console.error(error)
            alert("Failed to delete client")
        }
    }

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error}</div>;
    }

    return (
    <div>
        <div className='flex gap-x-35 px-2'>
          <div className='flex flex-col gap-y-3'>
            <div className='flex flex-col'>
              <span className='text-sm font-semibold'>Name</span>
              <p>{client?.name}</p>
            </div>
            <div className='flex flex-col'>
              <span className='text-sm font-semibold'>Group</span>
              <p>{client?.group || "No Group"}</p>
            </div>
            <div className='flex flex-col'>
              <span className='text-sm font-semibold'>Email</span>
              <p>{client?.email || "No Email"}</p>
            </div>
            <div className='flex flex-col'>
              <span className='text-sm font-semibold'>GSTIN</span>
              <p>{client?.gstin || "No GSTIN"}</p>
            </div>
          </div>

          <div className='flex flex-col gap-y-3'>
            <div className='flex flex-col'>
              <span className='text-sm font-semibold'>Phone</span>
              <p>{client?.contact || "No Phone"}</p>
            </div>
            <div className='flex flex-col'>
              <span className='text-sm font-semibold'>Address</span>
              <p className='max-w-[400px] break-words whitespace-pre-wrap'>{client?.address?.building}, {client?.address?.street}, {client?.address?.city}, {client?.address?.state}, {client?.address?.pincode}</p>
            </div>
            <div className='flex flex-col'>
              <span className='text-sm font-semibold'>Custom Fields</span>
              <p className='max-w-[400px] break-words whitespace-pre-wrap'>{client?.customFields?.map((field) => field.name && `${field.name}: ${field.value}`).join(", ") || "No Custom Fields"}</p>
            </div>
          </div>

          <div className='flex flex-col gap-y-3'>
            <div className='flex flex-col'>
              <span>Created On:</span>
              <p>{client?.createdAt ? new Date(client?.createdAt).toLocaleString() : "No Created On"}</p>
            </div>
            <DropdownMenu >
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className='w-fit'>Actions <ChevronDown /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent onClick={(e) => {e.stopPropagation()}}>
                <DropdownMenuItem onClick={() => {router.push(`/my-clients/edit/${id}`)}}>Edit</DropdownMenuItem>
                <AlertPopup  handleDeleteClient={() => handleDeleteClient(id)}>
                  <DropdownMenuItem onClick={(e) => {e.stopPropagation()}} onSelect={(e) => e.preventDefault()}>Delete</DropdownMenuItem>
                </AlertPopup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <hr className="my-4" />

        <Tabs defaultValue="notes" className="w-full">
          <TabsList className='gap-x-2'>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="cases">Cases</TabsTrigger>
          </TabsList>
          <TabsContent value="notes">
            <RichTextEditor id={id} setTrigger={setTrigger} source="client" />
            <DisplayNotes id={id} setTrigger={setTrigger} notes={notes} source="client" />
          </TabsContent>
          <TabsContent value="cases">
            <CasesListView cases={cases} loading={loading} clientView clientId={id} setTrigger={setTrigger} />
          </TabsContent>
        </Tabs>
    </div>
  )
}
export default ClientView