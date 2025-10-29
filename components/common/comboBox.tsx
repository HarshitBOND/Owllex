"use client"

import * as React from "react"
import { Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface DropdownItem {
  value: string
  label: string
}

export default function ComboBox({ className, dropdownItems, type, value, setValue }: { className?: string; dropdownItems: DropdownItem[]; type: string; value: string; setValue: (value: string) => void }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[200px] justify-between truncate", className)}
        >
          {value
            ? dropdownItems.find((Item: DropdownItem) => Item.value === value)?.label
            : "Select " + type + " ..."}
          {dropdownItems.length === 0 && <Loader2 className="h-4 w-4 animate-spin" />}
          {dropdownItems.length > 0 && (open ? <ChevronUp className="opacity-50" /> : <ChevronDown className="opacity-50" />)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[200px] p-0", className)}>
        <Command>
          <CommandInput placeholder={"Search " + type + "..."} className="h-9" />
          <CommandList>
            <CommandEmpty>No {type} found.</CommandEmpty>
            <CommandGroup>
              {dropdownItems.map((Item: DropdownItem) => (
                <CommandItem
                  key={Item.value}
                  value={`${Item.value}---${Item.label}`}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue.split('---')[0])
                    setOpen(false)
                  }}
                >
                  {Item.label}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === Item.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
