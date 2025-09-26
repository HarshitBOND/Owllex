"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type SidebarContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

type SidebarProviderProps = {
  children: ReactNode;
  defaultOpen?: boolean;
};

export function SidebarProvider({ children, defaultOpen = false }: SidebarProviderProps) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen}}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}

export default SidebarContext;


