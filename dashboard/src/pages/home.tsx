import { useSEO } from '@/hooks/use-seo'
import HomeHeader from '@/components/home/HomeHeader'
import HeroSection from '@/components/home/HeroSection'
import CoreValuesSection from '@/components/home/CoreValuesSection'
import AgentsOverviewSection from '@/components/home/AgentsOverviewSection'
import PricingSection from '@/components/home/PricingSection'
import ContactSection from '@/components/home/ContactSection'
import FAQSection from '@/components/home/FAQSection'
import HomeFooter from '@/components/home/HomeFooter'

export default function HomePage() {
    useSEO({
        title: 'IQX - Trợ lý AI Phân Tích Chứng Khoán Thời Gian Thực',
        description: 'Tối ưu hóa lợi nhuận với AI của IQX. Phân tích xu hướng, thanh khoản, dòng tiền lớn, hành vi chỉ trong một nhịp chạm.',
        url: 'https://beta.iqx.vn/',
    });

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
