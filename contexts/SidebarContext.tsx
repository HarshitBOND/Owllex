"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 192;
export const SIDEBAR_COLLAPSED_WIDTH = 48;
const WIDTH_STORAGE_KEY = "sidebar-width";

type SidebarContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

type SidebarProviderProps = {
  children: ReactNode;
  defaultOpen?: boolean;
};

export function SidebarProvider({ children, defaultOpen = true }: SidebarProviderProps) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);
  const [width, setWidthState] = useState<number>(SIDEBAR_DEFAULT_WIDTH);

  useEffect(() => {
    const stored = window.localStorage.getItem(WIDTH_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (!Number.isNaN(parsed)) {
      setWidthState(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed)));
    }
  }, []);

  const setWidth = (next: number) => {
    const clamped = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next));
    setWidthState(clamped);
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(clamped));
  };

  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen, width, setWidth }}>
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


