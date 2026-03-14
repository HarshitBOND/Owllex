"use client"

import { useState, useEffect, useCallback } from "react"

export interface ClientAddress {
  building?: string;
  street?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface ClientType {
  _id: string;
  salutation: string;
  name: string;
  company: string;
  group: string;
  email: string;
  contact: string;
  contactAlt: string;
  gstin: string;
  address: ClientAddress;
  customFields: { name: string; value: string }[];
  cases: any[];
  notes: any[];
  createdAt: string;
  updatedAt: string;
}

export function useClients() {
  const [clients, setClients] = useState<ClientType[]>([])
  const [loading, setLoading] = useState(true)

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/userdetails/clients")
      const data = await res.json()
      setClients(data?.userClients?.clients ?? [])
    } catch {
      console.error("Failed to fetch clients")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const deleteClient = useCallback(async (clientId: string) => {
    const res = await fetch(`/api/userdetails/clients?id=${clientId}`, { method: "DELETE" })
    if (!res.ok) throw new Error("Failed to delete client")
    setClients(prev => prev.filter(c => c._id !== clientId))
  }, [])

  return { clients, loading, refetch: fetchClients, deleteClient }
}
