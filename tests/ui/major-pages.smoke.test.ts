import React from "react"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

;(globalThis as any).React = React

const mockState = vi.hoisted(() => ({
  push: vi.fn(),
  redirect: vi.fn(),
  useUser: vi.fn(),
  useSidebar: vi.fn(),
}))

vi.mock("next/dynamic", () => ({
  default: () => () => "dynamic-component-mock",
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockState.push }),
  redirect: mockState.redirect,
}))

vi.mock("@clerk/nextjs", () => ({
  useUser: mockState.useUser,
}))

vi.mock("@/contexts/SidebarContext", () => ({
  useSidebar: mockState.useSidebar,
}))

vi.mock("@/components/dashboard/sidebar", () => ({
  default: () => "sidebar-mock",
}))

vi.mock("@/components/dashboard/navbar", () => ({
  default: () => "navbar-mock",
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: unknown }) => children ?? null,
}))

vi.mock("@/components/clientsec/ClientDashboard", () => ({
  default: () => "client-dashboard-mock",
}))

vi.mock("@/components/task/MergedTaskWorkspace", () => ({
  default: () => "merged-task-workspace-mock",
}))

vi.mock("@/components/Forms/addTaskForm", () => ({
  default: () => "add-task-form-mock",
}))

vi.mock("@/components/layout/header", () => ({
  Header: () => "header-mock",
}))

vi.mock("@/components/landingPage/hero-section", () => ({
  HeroSection: () => "hero-section-mock",
}))

vi.mock("@/components/landingPage/services-grid", () => ({
  ServicesGrid: () => "services-grid-mock",
}))

vi.mock("@/components/landingPage/why-choose-section", () => ({
  WhyChooseSection: () => "why-choose-mock",
}))

vi.mock("@/components/landingPage/how-it-works-section", () => ({
  HowItWorksSection: () => "how-it-works-mock",
}))

vi.mock("@/components/landingPage/waitlist-section", () => ({
  WaitlistSection: () => "waitlist-mock",
}))

vi.mock("@/components/layout/footer", () => ({
  Footer: () => "footer-mock",
}))

import HomePage from "@/app/page"
import DashboardPage from "@/app/dashboard/page"
import MyClientsPage from "@/app/my-clients/page"
import TasksPage from "@/app/tasks/page"

describe("major page smoke tests", () => {
  beforeEach(() => {
    mockState.push.mockReset()
    mockState.redirect.mockReset()
    mockState.useUser.mockReset()
    mockState.useSidebar.mockReset()

    mockState.useSidebar.mockReturnValue({ isOpen: true })
    mockState.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { firstName: "Harsh" },
    })
    mockState.redirect.mockImplementation(() => null)
  })

  it("renders landing page layout", () => {
    const markup = renderToString(React.createElement(HomePage))

    expect(markup).toContain("header-mock")
    expect(markup).toContain("hero-section-mock")
    expect(markup).toContain("footer-mock")
  })

  it("renders dashboard page shell", () => {
    const markup = renderToString(React.createElement(DashboardPage))

    expect(markup).toContain("Quick Actions")
    expect(markup).toContain("Pending Tasks")
  })

  it("renders clients page shell", () => {
    const markup = renderToString(React.createElement(MyClientsPage))

    expect(markup).toContain("dynamic-component-mock")
  })

  it("renders tasks page shell", () => {
    const markup = renderToString(React.createElement(TasksPage))

    expect(markup).toContain("merged-task-workspace-mock")
  })
})
