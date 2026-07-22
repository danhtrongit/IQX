import { useCallback, useEffect, useRef } from "react"
import { useAuth } from "@/features/auth"
import "./landing.css"
import { useLandingGsap } from "./useLandingGsap"
import { LandingNav } from "./LandingNav"
import { Hero } from "./Hero"
import { DemoGate } from "./DemoGate"
import { MarketBriefing } from "./MarketBriefing"
import { FeaturesBento } from "./FeaturesBento"
import { HowItWorks } from "./HowItWorks"
import { StrategyAlerts } from "./StrategyAlerts"
import { ResearchDepth } from "./ResearchDepth"
import { StatsWall } from "./StatsWall"
import { Pricing } from "./Pricing"
import { Closing } from "./Closing"

const SEO = {
  title: "IQX — Trợ lý phân tích chứng khoán Việt Nam",
  description:
    "Gõ một mã, nhận phân tích AI 6 lớp trong vài giây. Nhận định thị trường mỗi phiên, backtest chiến lược, cảnh báo Telegram, BCTC và định giá — trên dữ liệu thật của ~2,048 mã.",
}

function useSeo() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = SEO.title
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const prevDesc = meta?.getAttribute("content") ?? null
    let created = false
    let el = meta
    if (!el) {
      el = document.createElement("meta")
      el.setAttribute("name", "description")
      document.head.appendChild(el)
      created = true
    }
    el.setAttribute("content", SEO.description)
    return () => {
      document.title = prevTitle
      if (created) el?.remove()
      else if (prevDesc !== null) el?.setAttribute("content", prevDesc)
    }
  }, [])
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const { setShowAuthModal, setAuthModalTab } = useAuth()
  useSeo()
  useLandingGsap(rootRef)

  const openRegister = useCallback(() => {
    setAuthModalTab("register")
    setShowAuthModal(true)
  }, [setAuthModalTab, setShowAuthModal])

  const openLogin = useCallback(() => {
    setAuthModalTab("login")
    setShowAuthModal(true)
  }, [setAuthModalTab, setShowAuthModal])

  const focusDemo = useCallback(() => {
    const section = document.getElementById("demo")
    section?.scrollIntoView({ behavior: "smooth", block: "start" })
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>("#demo input")?.focus({ preventScroll: true })
    }, 600)
  }, [])

  return (
    <div className="iqx-landing" ref={rootRef}>
      <LandingNav onRegister={openRegister} onLogin={openLogin} />
      <main>
        <Hero onPrimary={focusDemo} />
        <DemoGate onRegister={openRegister} />
        <MarketBriefing />
        <FeaturesBento onRegister={openRegister} />
        <HowItWorks />
        <StrategyAlerts onRegister={openRegister} />
        <ResearchDepth />
        <StatsWall />
        <Pricing onRegister={openRegister} />
        <Closing onRegister={openRegister} />
      </main>
    </div>
  )
}
