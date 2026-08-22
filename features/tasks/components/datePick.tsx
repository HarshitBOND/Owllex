"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarDays } from "lucide-react"
import { startOfToday } from "date-fns"

export function Calendar22({ date, setDate, buttonVariant="link" }: { date: Date | undefined, setDate: React.Dispatch<React.SetStateAction<Date | undefined>>, buttonVariant?: "link" | "outline" }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-3">
      <Label hidden htmlFor="date" className="px-1">
        Date
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={buttonVariant}
            id="date"
            className={buttonVariant === "link" ? "w-fit justify-between font-normal border-none shadow-none hover:none" : ""}
          >
            {date ? date.toLocaleDateString("en-GB") : "Select date"}
            {buttonVariant === "outline" && <CalendarDays className="ms-auto" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          captionLayout="dropdown"
          onSelect={(date) => {
            setDate(date)
            setOpen(false)
          }}
          disabled={buttonVariant === "outline" ? { before: startOfToday() } : undefined}
        />
        </PopoverContent>
      </Popover>
    </div>
  )
}
