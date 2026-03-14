"use client"

import { useState } from "react"
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  WandSparkles, Search, Lightbulb, TrendingUp, Clock,
  ArrowRight, BookOpen, Scale, FileText, Shield, Star,
  ExternalLink
} from "lucide-react"

const legalSuggestions = [
  {
    id: 1,
    title: "Review Limitation Periods",
    category: "Case Strategy",
    description: "Check if the limitation period applies to your pending cases. Cases approaching the deadline should be prioritized for filing.",
    icon: Clock,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    priority: "high",
    tags: ["Deadline", "Filing"],
  },
  {
    id: 2,
    title: "Update Client Communication",
    category: "Client Management",
    description: "Send regular status updates to clients about their cases. Maintain transparency and build trust with timely notifications.",
    icon: TrendingUp,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    priority: "medium",
    tags: ["Communication", "Best Practice"],
  },
  {
    id: 3,
    title: "Document Organization",
    category: "Practice Management",
    description: "Organize case files systematically. Ensure all evidence, pleadings, and correspondence are properly categorized and easily accessible.",
    icon: FileText,
    color: "text-green-600",
    bgColor: "bg-green-50",
    priority: "medium",
    tags: ["Organization", "Efficiency"],
  },
  {
    id: 4,
    title: "Stay Updated on Recent Judgments",
    category: "Legal Research",
    description: "Review recent Supreme Court and High Court judgments relevant to your practice areas. New precedents can strengthen your arguments.",
    icon: BookOpen,
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    priority: "high",
    tags: ["Research", "Precedent"],
  },
  {
    id: 5,
    title: "Compliance Check for Corporate Clients",
    category: "Compliance",
    description: "Ensure your corporate clients are up-to-date with regulatory filings, annual returns, and statutory compliance requirements.",
    icon: Shield,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    priority: "medium",
    tags: ["Corporate", "Regulatory"],
  },
  {
    id: 6,
    title: "Alternative Dispute Resolution",
    category: "Case Strategy",
    description: "Consider mediation or arbitration for suitable cases. ADR can save time, reduce costs, and often leads to better outcomes for clients.",
    icon: Scale,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    priority: "low",
    tags: ["ADR", "Strategy"],
  },
]

const categories = ["All", "Case Strategy", "Client Management", "Practice Management", "Legal Research", "Compliance"]

const Suggestions = () => {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn } = useUser()
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9]">
        <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }
  if (!isSignedIn) {
    return redirect("/")
  }

  const filteredSuggestions = legalSuggestions.filter((s) => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory === "All" || s.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Suggestions" />
            <div className="mb-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-amber-50 rounded-lg">
                  <WandSparkles className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Smart Suggestions</h2>
                  <p className="text-sm text-gray-500">AI-powered recommendations to improve your legal practice</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6">
          {/* Search & Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search suggestions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white h-11"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                    selectedCategory === cat
                      ? "bg-sidebar-primary text-white"
                      : "bg-white text-gray-600 border-2 border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Pro Tip Banner */}
          <div className="bg-gradient-to-r from-sidebar-primary/5 to-amber-50 border border-sidebar-primary/20 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">Pro Tip of the Day</p>
                <p className="text-sm text-gray-600 mt-1">
                  Regularly review your case deadlines and set automated reminders. Missing a limitation date can have serious consequences for your practice and client trust.
                </p>
              </div>
            </div>
          </div>

          {/* Suggestions Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 p-5 group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("p-2 rounded-lg", suggestion.bgColor)}>
                    <suggestion.icon className={cn("h-5 w-5", suggestion.color)} />
                  </div>
                  <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full",
                    suggestion.priority === "high" ? "bg-red-50 text-red-600" :
                    suggestion.priority === "medium" ? "bg-orange-50 text-orange-600" :
                    "bg-green-50 text-green-600"
                  )}>
                    {suggestion.priority}
                  </span>
                </div>

                <h3 className="font-semibold text-gray-900 mb-1">{suggestion.title}</h3>
                <p className="text-xs text-gray-400 mb-2">{suggestion.category}</p>
                <p className="text-sm text-gray-600 mb-4 line-clamp-3">{suggestion.description}</p>

                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {suggestion.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-sidebar-primary group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            ))}
          </div>

          {filteredSuggestions.length === 0 && (
            <div className="text-center py-16">
              <WandSparkles className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600">No suggestions found</h3>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filter</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default Suggestions