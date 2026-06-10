import { useEffect } from "react"
import HomeHeader from "./components/HomeHeader"
import HeroSection from "./components/HeroSection"
import CoreValuesSection from "./components/CoreValuesSection"
import AgentsOverviewSection from "./components/AgentsOverviewSection"
import PricingSection from "./components/PricingSection"
import ContactSection from "./components/ContactSection"
import FAQSection from "./components/FAQSection"
import HomeFooter from "./components/HomeFooter"

const SEO = {
  title: "IQX - Trợ lý AI Phân Tích Chứng Khoán Thời Gian Thực",
  description:
    "Tối ưu hóa lợi nhuận với AI của IQX. Phân tích xu hướng, thanh khoản, dòng tiền lớn, hành vi chỉ trong một nhịp chạm.",
}

export default function MarketingPage() {
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

  return (
    <div className="home-container">
      <HomeHeader />
      <main className="home-main">
        <HeroSection />
        <CoreValuesSection />
        <AgentsOverviewSection />
        <PricingSection />
        <ContactSection />
        <FAQSection />
      </main>
      <HomeFooter />

      <style>{`
        html {
          scroll-behavior: smooth;
        }
        .home-container {
          background: #000;
          min-height: 100vh;
          width: 100%;
        }
        .home-main {
          width: 100%;
        }
        .home-main > section {
          min-height: auto;
          display: block;
          padding: 80px 0;
        }
        #hero {
          min-height: 100vh;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 900px) {
          .home-main > section {
            padding: 60px 0;
          }
          #hero {
            min-height: auto;
            padding: 100px 0 60px;
          }
        }
      `}</style>
    </div>
  )
}
