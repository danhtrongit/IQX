import { useEffect, useId, useState, type ReactNode } from "react"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CircleHelp,
  Gamepad2,
  GraduationCap,
  Search,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from "lucide-react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/hooks/use-auth"
import { EggArtwork } from "../demo-trading/journey/artwork/EggArtwork"
import { LEVELS } from "../demo-trading/journey/journey-state"
import "./landing.css"

const JOURNEY_URL = "/demo-trading?view=journey"
const MASCOT_ROOT = "/assets/mascots-2d/v2/thanh-long"
const SEO = {
  title: "IQX · Tập đầu tư có hệ thống, bắt đầu từ tư duy",
  description:
    "Học qua thực hành, rèn kỹ năng qua Cấp 0 đến Cấp 6 và khám phá linh thú đồng hành. Xây dựng tư duy đầu tư với vốn mô phỏng.",
}
const VALUES = [
  { icon: BookOpen, title: "Kiến thức", detail: "thực tế" },
  { icon: Gamepad2, title: "Thực hành", detail: "an toàn" },
  { icon: TrendingUp, title: "Phát triển", detail: "tư duy đầu tư" },
  { icon: UsersRound, title: "Linh thú", detail: "đồng hành" },
]
const METRICS = [
  { value: "3 sàn", label: "HOSE · HNX · UPCOM" },
  { value: "38", label: "chỉ báo kỹ thuật" },
  { value: "6", label: "cấp rèn luyện sau Cấp 0" },
  { value: "100tr", label: "vốn mô phỏng mặc định" },
]
const PREVIEWS = [
  {
    level: 0,
    title: "Làm quen đầu tư",
    detail: "Bắt đầu từ kiến thức nền và vòng mua bán đầu tiên.",
    label: "Khởi đầu",
  },
  {
    level: 2,
    title: "Xây dựng kỷ luật",
    detail: "Lập kế hoạch cắt lỗ, chốt lời trước mỗi quyết định.",
    label: "Rèn kỹ năng",
  },
  {
    level: 4,
    title: "Đọc sâu thị trường",
    detail: "Kết nối năm lớp thông tin để hình thành góc nhìn riêng.",
    label: "Nâng tư duy",
  },
] as const
const CAPABILITIES = [
  {
    icon: Search,
    title: "Tìm cơ hội",
    detail: "Theo dõi những mã phù hợp với cách bạn đọc thị trường.",
    to: "/demo-trading?view=hunt",
  },
  {
    icon: Gamepad2,
    title: "Giao dịch mô phỏng",
    detail: "Quan sát Bot thực hành với vốn ảo và nguyên tắc rõ ràng.",
    to: "/demo-trading?view=bot",
  },
  {
    icon: BarChart3,
    title: "Theo dõi kết quả",
    detail: "Nhìn lại quyết định, danh mục và tiến bộ của bạn.",
    to: "/demo-trading?view=portfolio",
  },
  {
    icon: BookOpen,
    title: "Cùng bạn học tiếp",
    detail: "Bổ sung kiến thức và tiếp tục rèn luyện mỗi ngày.",
    to: "/bai-hoc",
  },
]

function JourneyLink({ children }: { children: ReactNode }) {
  return (
    <Button asChild size="lg" className="h-10 rounded-sm px-5 text-sm">
      <Link to={JOURNEY_URL}>
        {children}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </Button>
  )
}

/** Reuse the live journey artwork without recording any presentation milestones. */
function Egg({ level, className = "" }: { level: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  return (
    <svg
      viewBox="40 65 400 400"
      className={"intro-egg " + className}
      role="img"
      aria-label={"Trứng Cấp " + level}
    >
      <EggArtwork
        level={level}
        accent="var(--accent)"
        idPrefix={"intro-" + id}
      />
    </svg>
  )
}

export function IntroductionPage() {
  const { isAuthenticated } = useAuth()
  const [preview, setPreview] = useState<0 | 2 | 4>(0)
  useEffect(() => {
    const previousTitle = document.title
    const previousMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    )
    const previousDescription = previousMeta?.getAttribute("content") ?? null
    const meta = previousMeta ?? document.createElement("meta")
    if (!previousMeta) {
      meta.name = "description"
      document.head.appendChild(meta)
    }
    document.title = SEO.title
    meta.content = SEO.description
    return () => {
      document.title = previousTitle
      if (!previousMeta) meta.remove()
      else if (previousDescription === null) meta.removeAttribute("content")
      else meta.content = previousDescription
    }
  }, [])

  return (
    <main
      aria-label="Giới thiệu IQX"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <ScrollArea className="min-h-0 flex-1" viewportClassName="intro-scroll">
        <div className="intro-page">
          <section className="intro-hero" aria-labelledby="intro-title">
            <div className="intro-hero-scenery" aria-hidden="true">
              <img
                src="/assets/introduction/journey-day-v1.webp"
                alt=""
                width={1672}
                height={941}
                fetchPriority="high"
                className="intro-day"
              />
              <img
                src="/assets/introduction/journey-night-v1.webp"
                alt=""
                width={1672}
                height={941}
                className="intro-night"
              />
            </div>
            <div className="intro-container intro-hero-inner">
              <div className="intro-hero-copy">
                <p className="intro-eyebrow">IQX DEMO TRADING</p>
                <h1 id="intro-title">
                  Tập đầu tư có hệ thống,<span> bắt đầu từ tư duy.</span>
                </h1>
                <p className="intro-lead">
                  Học qua trải nghiệm thực hành, rèn kỹ năng từng bước, với
                  người bạn đồng hành: Linh thú IQX.
                </p>
                <div className="intro-hero-actions">
                  <JourneyLink>
                    {isAuthenticated
                      ? "Tiếp tục hành trình"
                      : "Bắt đầu hành trình"}
                  </JourneyLink>
                  <a href="#lo-trinh" className="intro-text-link">
                    Khám phá lộ trình
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </a>
                </div>
                <p className="intro-safe-note">
                  <ShieldCheck aria-hidden="true" className="size-3.5" />
                  Thực hành bằng vốn ảo. Không sử dụng tiền thật.
                </p>
                <ul
                  className="intro-values"
                  aria-label="Giá trị của hành trình"
                >
                  {VALUES.map(({ icon: Icon, title, detail }) => (
                    <li key={title}>
                      <Icon aria-hidden="true" />
                      <span>
                        {title}
                        <br />
                        {detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="intro-mascot-scene">
                <p className="intro-hand-note">
                  Hành trình nhỏ.
                  <br />
                  <span>Tư duy lớn.</span>
                </p>
                <img
                  src={MASCOT_ROOT + "/hero-sharp-v1.webp"}
                  alt="Thanh Long, linh thú đồng hành của IQX"
                  width={1254}
                  height={1254}
                  fetchPriority="high"
                  className="intro-mascot"
                />
              </div>
            </div>
          </section>

          <section
            aria-label="Công cụ để bắt đầu"
            className="intro-container intro-stats-wrap"
          >
            <dl className="intro-stats">
              {METRICS.map((metric) => (
                <div key={metric.value}>
                  <dd>{metric.value}</dd>
                  <dt>{metric.label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <section
            className="intro-container intro-section"
            aria-labelledby="intro-preview-title"
          >
            <div className="intro-section-heading">
              <h2 id="intro-preview-title">Chọn điểm khám phá của bạn</h2>
              <p>Từ những bước đầu tiên đến một tư duy đầu tư vững vàng.</p>
            </div>
            <div
              className="intro-previews"
              role="group"
              aria-label="Xem trước các cấp học"
            >
              {PREVIEWS.map((item) => (
                <button
                  type="button"
                  key={item.level}
                  onClick={() => setPreview(item.level)}
                  aria-pressed={preview === item.level}
                  aria-controls="intro-preview-detail"
                  className="intro-preview"
                >
                  <div className="intro-preview-top">
                    <span>Cấp {item.level}</span>
                    <span className="intro-preview-tag">{item.label}</span>
                  </div>
                  <Egg level={item.level} className="intro-preview-egg" />
                  <div className="intro-preview-copy">
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                  <span className="intro-preview-selected">
                    {preview === item.level ? (
                      <>
                        <Check aria-hidden="true" className="size-3.5" />
                        Đang xem
                      </>
                    ) : (
                      <>
                        Khám phá
                        <ArrowRight aria-hidden="true" className="size-3.5" />
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div
              id="intro-preview-detail"
              className="intro-preview-detail"
              aria-live="polite"
              aria-atomic="true"
            >
              <p>
                <strong>
                  Cấp {preview} · {LEVELS[preview].name}.
                </strong>{" "}
                {LEVELS[preview].skill}
              </p>
              <Link to={JOURNEY_URL} className="intro-text-link">
                Vào hành trình
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <p className="intro-preview-disclaimer">
              Đây là phần xem trước. Điểm bắt đầu được xác định trong Demo
              Trading; các cấp tiếp theo mở bằng quá trình thực hành.
            </p>
          </section>

          <section
            id="lo-trinh"
            className="intro-container intro-roadmap intro-section"
            aria-labelledby="intro-roadmap-title"
          >
            <div className="intro-section-heading">
              <h2 id="intro-roadmap-title">Hành trình 6 cấp học</h2>
              <p>
                Khởi đầu ở Cấp 0. Từng bước rèn luyện, trưởng thành đến Cấp 6.
              </p>
            </div>
            <ol
              className="intro-levels"
              aria-label="Trứng linh thú từ Cấp 0 đến Cấp 6"
            >
              {LEVELS.map((level, index) => (
                <li key={level.name}>
                  <Egg level={index} />
                  <span className="intro-level-number">Cấp {index}</span>
                  <span className="intro-level-name">{level.name}</span>
                </li>
              ))}
            </ol>
          </section>

          <section
            className="intro-container intro-unlock-wrap"
            aria-labelledby="intro-unlock-title"
          >
            <div className="intro-unlock">
              <img
                src="/assets/introduction/journey-night-v1.webp"
                alt=""
                width={1672}
                height={941}
                loading="lazy"
                className="intro-unlock-scenery"
              />
              <div className="intro-unlock-copy">
                <p className="intro-unlock-label">
                  <GraduationCap aria-hidden="true" className="size-4" />
                  Sau tốt nghiệp Cấp 6
                </p>
                <h2 id="intro-unlock-title">
                  Học xong Cấp 6,
                  <br />
                  <span>mở khóa Linh thú</span>
                  <br />
                  của riêng bạn.
                </h2>
                <p>
                  Một người bạn đồng hành, phản ánh cách bạn đọc thị trường và
                  ra quyết định.
                </p>
                <JourneyLink>
                  {isAuthenticated
                    ? "Tiếp tục luyện tập"
                    : "Khám phá hành trình"}
                </JourneyLink>
              </div>
              <div className="intro-unlock-art">
                <img
                  src={MASCOT_ROOT + "/reveal-silhouette.webp"}
                  alt="Bóng dáng Thanh Long, minh họa linh thú được khám phá sau hành trình"
                  width={1024}
                  height={1024}
                  loading="lazy"
                />
                <CircleHelp className="intro-mystery" aria-hidden="true" />
                <p>
                  Cùng bạn
                  <br />
                  lớn lên mỗi ngày.
                </p>
              </div>
            </div>
            <p className="intro-preview-disclaimer">
              Thanh Long là một trong các linh thú của IQX. Linh thú của bạn
              được xác định từ hành trình thực tế, không phải lựa chọn ở trang
              giới thiệu.
            </p>
          </section>

          <section
            className="intro-container intro-section intro-capabilities"
            aria-labelledby="intro-capabilities-title"
          >
            <div className="intro-section-heading">
              <h2 id="intro-capabilities-title">Linh thú sẽ làm gì?</h2>
              <p>Đồng hành cùng bạn, từ quan sát đến thực hành.</p>
            </div>
            <div className="intro-capability-grid">
              {CAPABILITIES.map(({ icon: Icon, title, detail, to }) => (
                <Link to={to} key={title} className="intro-capability">
                  <Icon aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{detail}</p>
                  <ArrowRight
                    aria-hidden="true"
                    className="intro-capability-arrow"
                  />
                </Link>
              ))}
            </div>
          </section>

          <footer className="intro-footer intro-container">
            <Link to="/" className="font-heading text-xl font-bold">
              IQX<span className="text-primary">.</span>
            </Link>
            <p>
              IQX cung cấp công cụ phân tích và giáo dục, không phải khuyến nghị
              đầu tư. Kết quả giao dịch mô phỏng không đảm bảo kết quả thực tế.
            </p>
            <Link to="/bai-hoc" className="intro-text-link">
              Bắt đầu học
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </footer>
        </div>
      </ScrollArea>
    </main>
  )
}
