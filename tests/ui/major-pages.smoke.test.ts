import React from "react"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

;(globalThis as any).React = React

const mockState = vi.hoisted(() => ({
  push: vi.fn(),
  redirect: vi.fn(),
  useUser: vi.fn(),
  useAuth: vi.fn(),
  useSidebar: vi.fn(),
  useAiChat: vi.fn(),
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
  useAuth: mockState.useAuth,
  UserButton: () => "user-button-mock",
}))

vi.mock("@/contexts/SidebarContext", () => ({
  useSidebar: mockState.useSidebar,
}))

vi.mock("@/contexts/AiChatContext", () => ({
  useAiChat: mockState.useAiChat,
}))

vi.mock("@/components/layout/sidebar", () => ({
  default: () => "sidebar-mock",
}))

vi.mock("@/components/layout/navbar", () => ({
  default: () => "navbar-mock",
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: unknown }) => children ?? null,
}))

vi.mock("@/features/clients/components/ClientDashboard", () => ({
  default: () => "client-dashboard-mock",
}))

vi.mock("@/features/tasks/components/MergedTaskWorkspace", () => ({
  default: () => "merged-task-workspace-mock",
}))

vi.mock("@/features/tasks/components/addTaskForm", () => ({
  default: () => "add-task-form-mock",
}))

vi.mock("@/components/layout/header", () => ({
  Header: () => "header-mock",
}))

vi.mock("@/features/landing/hero-section", () => ({
  HeroSection: () => "hero-section-mock",
}))

vi.mock("@/features/landing/services-grid", () => ({
  ServicesGrid: () => "services-grid-mock",
}))

vi.mock("@/features/landing/why-choose-section", () => ({
  WhyChooseSection: () => "why-choose-mock",
}))

vi.mock("@/features/landing/how-it-works-section", () => ({
  HowItWorksSection: () => "how-it-works-mock",
}))

vi.mock("@/features/landing/waitlist-section", () => ({
  WaitlistSection: () => "waitlist-mock",
}))

vi.mock("@/components/layout/footer", () => ({
  Footer: () => "footer-mock",
}))

import HomePage from "@/app/page"
import DashboardPage from "@/app/dashboard/page"
import DashboardOverviewPage from "@/app/dashboard/overview/page"
import MyClientsPage from "@/app/my-clients/page"
import TasksPage from "@/app/tasks/page"
import { SettingsModal, resolveSection } from "@/features/settings/SettingsModal"
import ReportFraudPage from "@/app/report-fraud/page"
import ContactUsPage from "@/app/contact-us/page"
import TermsOfUsePage from "@/app/terms-of-use/page"
import AdminDashboardPage from "@/app/admin/dashboard/page"
import SupportDashboardPage from "@/app/support/dashboard/page"
import CorpusPage from "@/app/corpus/page"
import AiWorkflowPage from "@/app/ai-workflow/page"

describe("major page smoke tests", () => {
  beforeEach(() => {
    mockState.push.mockReset()
    mockState.redirect.mockReset()
    mockState.useUser.mockReset()
    mockState.useSidebar.mockReset()
    mockState.useAiChat.mockReset()

    mockState.useSidebar.mockReturnValue({ isOpen: true })
    mockState.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { firstName: "Harsh" },
    })
    mockState.useAiChat.mockReturnValue({
      conversations: [],
      activeId: "test-chat-id",
      loaded: true,
      isHistoryOpen: false,
      refresh: vi.fn(),
      startNewConversation: vi.fn(),
      selectConversation: vi.fn(),
      deleteConversation: vi.fn(),
      renameConversation: vi.fn(),
      openHistory: vi.fn(),
      closeHistory: vi.fn(),
      corpora: [],
      refreshCorpora: vi.fn(),
      activeCorpus: null,
      activeCorpusId: null,
      setActiveCorpusId: vi.fn(),
    })
    mockState.redirect.mockImplementation(() => null)
    mockState.useAuth.mockReturnValue({ getToken: vi.fn().mockResolvedValue("test-token") })
  })

  it("renders landing page layout", () => {
    const markup = renderToString(React.createElement(HomePage))

    expect(markup).toContain("header-mock")
    expect(markup).toContain("hero-section-mock")
    expect(markup).toContain("footer-mock")
  })

  it("renders dashboard page shell", () => {
    const markup = renderToString(React.createElement(DashboardPage))

    expect(markup).toContain("Draft an affidavit")
    expect(markup).toContain("Ask your legal assistant anything...")
  })

  it("renders dashboard overview page shell", () => {
    const markup = renderToString(React.createElement(DashboardOverviewPage))

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

  it("renders settings modal shell", () => {
    const markup = renderToString(
      React.createElement(SettingsModal, {
        section: "general",
        onSectionChange: vi.fn(),
        onClose: vi.fn(),
      }),
    )

    // Both nav groups, and the close affordance that dismisses the overlay.
    expect(markup).toContain("General")
    expect(markup).toContain("Billing")
    expect(markup).toContain("Usage")
    expect(markup).toContain("Behaviour")
    expect(markup).toContain("Close settings")
  })

  it("resolves settings deep links, falling back to General when unknown", () => {
    expect(resolveSection("billing")).toBe("billing")
    expect(resolveSection("model")).toBe("model")
    expect(resolveSection("does-not-exist")).toBe("general")
  })

  it("renders report-fraud page shell", () => {
    const markup = renderToString(React.createElement(ReportFraudPage))

    expect(markup).toContain("Fraud Incident Report")
  })

  it("renders contact-us page shell", () => {
    const markup = renderToString(React.createElement(ContactUsPage))

    expect(markup).toContain("Send us a message")
  })

  it("renders terms-of-use page shell", () => {
    const markup = renderToString(React.createElement(TermsOfUsePage))

    expect(markup).toContain("header-mock")
    expect(markup).toContain("11. Contact Us")
    expect(markup).toContain("footer-mock")
  })

  it("renders admin dashboard page shell", () => {
    const markup = renderToString(React.createElement(AdminDashboardPage))

    expect(markup).toContain("Verifying admin access...")
  })

  it("renders support dashboard page shell", () => {
    const markup = renderToString(React.createElement(SupportDashboardPage))

    expect(markup).toContain("navbar-mock")
    expect(markup).toContain("sidebar-mock")
  })

  it("renders corpus page shell with an empty state", () => {
    const markup = renderToString(React.createElement(CorpusPage))

    expect(markup).toContain("navbar-mock")
    expect(markup).toContain("New corpus")
    expect(markup).toContain("No corpus yet")
  })

  it("renders corpus page with the user's corpora listed", () => {
    mockState.useAiChat.mockReturnValue({
      ...mockState.useAiChat(),
      corpora: [
        {
          id: "abc123",
          name: "Sharma v DDA",
          description: "Second appeal on a property dispute",
          accent: "teal",
          archived: false,
          caseCount: 2,
          clientCount: 1,
          documentCount: 5,
          chatCount: 3,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    })

    const markup = renderToString(React.createElement(CorpusPage))

    expect(markup).toContain("Sharma v DDA")
    expect(markup).toContain("Second appeal on a property dispute")
    expect(markup).not.toContain("No corpus yet")
  })

  it("renders ai-workflow page shell with the corpus picker", () => {
    const markup = renderToString(React.createElement(AiWorkflowPage))

    expect(markup).toContain("AI Workflow")
    expect(markup).toContain("Run against a corpus")
  })
})
