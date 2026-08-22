import type { ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface TermsSectionProps {
  title: string
  description: ReactNode
  className?: string
  children: ReactNode
}

export function TermsSection({ title, description, className, children }: TermsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={cn("prose prose-sm max-w-none", className)}>
        {children}
      </CardContent>
    </Card>
  )
}
