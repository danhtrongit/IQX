import { useEffect, useState } from "react"
import { Link } from "react-router"
import { useAuth } from "@/features/auth"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { NAV_LINKS } from "./data"

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

export function LandingNav({ onRegister, onLogin }: { onRegister: () => void; onLogin: () => void }) {
  const { theme, toggleTheme } = useTheme()
  const { isAuthenticated } = useAuth()
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const close = () => setOpen(false)

  return (
    <nav className={`lp-nav${stuck ? " is-stuck" : ""}`}>
      <div className="lp-wrap lp-nav__in">
        <a href="#top" className="lp-logo" onClick={close}>
          <span className="lp-logo__mark">IQ</span>
          IQX
        </a>

        <div className="lp-nav__links">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="lp-nav__link">
              {l.label}
            </a>
          ))}
        </div>

        <div className="lp-nav__actions">
          <button
            className="lp-iconbtn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
            title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {isAuthenticated ? (
            <Link to="/dashboard" className="lp-btn lp-btn--primary lp-btn--sm">
              Vào terminal →
            </Link>
          ) : (
            <>
              <button className="lp-btn lp-btn--ghost lp-btn--sm lp-nav__login" onClick={onLogin}>
                Đăng nhập
              </button>
              <button className="lp-btn lp-btn--primary lp-btn--sm" onClick={onRegister}>
                Đăng ký miễn phí
              </button>
            </>
          )}

          <button
            className="lp-iconbtn lp-nav__burger"
            onClick={() => setOpen((v) => !v)}
            aria-label="Mở menu"
            aria-expanded={open}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="lp-nav__sheet">
          <div className="lp-wrap">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="lp-nav__sheet-link" onClick={close}>
                {l.label}
              </a>
            ))}
            {!isAuthenticated && (
              <button
                className="lp-btn lp-btn--ghost lp-btn--block"
                style={{ marginTop: 10 }}
                onClick={() => {
                  close()
                  onLogin()
                }}
              >
                Đăng nhập
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        .lp-nav__burger { display: inline-grid; }
        .lp-nav__sheet {
          border-top: 1px solid var(--lp-border);
          border-bottom: 1px solid var(--lp-border);
          background: var(--lp-bg);
          padding-block: 12px;
        }
        .lp-nav__sheet-link {
          display: block;
          font-size: 15px;
          font-weight: 600;
          color: var(--lp-t2);
          padding: 11px 4px;
          border-bottom: 1px solid var(--lp-border-soft);
        }
        @media (min-width: 980px) {
          .lp-nav__burger { display: none; }
          .lp-nav__sheet { display: none; }
        }
      `}</style>
    </nav>
  )
}
