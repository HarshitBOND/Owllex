"use client"

import { useEffect, useState } from "react"
import { Button } from "../ui/button"
import { Loader2, Trash2 } from "lucide-react"
import { Note } from "../client/clientView"

const DisplayNotes = ({id, setTrigger, notes}: {id: string, setTrigger: React.Dispatch<React.SetStateAction<number>>, notes: Note[]}) => {
    const [deleting, setDeleting] = useState<boolean>(false)
    const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)

    const handleDeleteNote = (noteId: string) => {
        setDeleting(true)
        setDeletingNoteId(noteId)
        const deleteNote = async () => {
            const response = await fetch(`/api/userdetails/clients/add-notes?id=${noteId}&clientId=${id}`, {
                method: "DELETE"
            })
            if (!response.ok) {
                throw new Error("Failed to delete note")
            }
            alert("Note deleted successfully")
            setTrigger((prev) => prev + 1)
            setDeleting(false)
            setDeletingNoteId(null)
        }
        try {
            deleteNote()
        } catch (error) {
            console.error(error)
            alert("Failed to delete note")
            setDeleting(false)
            setDeletingNoteId(null)
        }
    }

    return (
    <div className="mt-4">
        <h2 className="text-lg font-semibold mb-2 ms-2">All Reference Notes</h2>
        <hr className="my-2" />
        {notes.length === 0 ? (
            <p className="p-4 mx-auto text-center">No notes found</p>
        ) : (
            notes.map((note: any) => (
                <div className="hover:bg-gray-200 cursor-pointer p-2 rounded mb-2 min-h-25 flex items-center" key={note._id}>
                    <div className="w-3/4 flex flex-col gap-y-2">
                        {note.visibility === "private" && <div className="text-xs text-gray-500">This note is private to you</div>}
                        <div dangerouslySetInnerHTML={{ __html: note.content }} />
                    </div>
                    <Button className="ms-auto" variant="outline" onClick={() => handleDeleteNote(note._id)}>
                        {deleting && note._id === deletingNoteId ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                </div>
            ))
        )}
    </div>
  )
}
export default DisplayNotes