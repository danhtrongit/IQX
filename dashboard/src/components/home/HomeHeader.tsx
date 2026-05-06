import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router';

const navLinks = [
    { label: 'Trang chủ', href: '#hero' },
    { label: 'Giá trị cốt lõi', href: '#core-values' },
    { label: 'Tác nhân AI', href: '#agents-overview' },
    { label: 'Bảng giá', href: '#pricing' },
    { label: 'Liên hệ', href: '#contact' },
    { label: 'Hỗ trợ', href: '#faq' },
];

export default function HomeHeader() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header
            id="site-header"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
                padding: '0 40px',
                height: '72px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.3s ease',
                background: scrolled
                    ? 'rgba(0, 0, 0, 0.85)'
                    : 'rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}
        >
            <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #00A8E8, #006994)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '18px',
                    color: '#0a0a0a',
                }}>
                    IQ
                </div>
                <span style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#fff',
                    letterSpacing: '-0.5px',
                }}>
                    IQX
                </span>
            </a>

            <nav style={{ display: 'flex', gap: '8px', alignItems: 'center' }} className="desktop-nav">
                {navLinks.map((link) => (
                    <a
                        key={link.href}
                        href={link.href}
                        style={{
                            color: 'rgba(255,255,255,0.7)',
                            textDecoration: 'none',
                            fontSize: '15px',
                            fontWeight: 500,
                            padding: '8px 16px',
                            borderRadius: '8px',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#fff';
                            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        {link.label}
                    </a>
                ))}
            </nav>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }} className="desktop-nav">
                <Link
                    to="/dashboard"
                    id="header-cta"
                    style={{
                        background: '#00A8E8',
                        color: '#0a0a0a',
                        padding: '10px 24px',
                        borderRadius: '8px',
                        fontSize: '15px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        transition: 'all 0.2s ease',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#33BFEF';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 168, 232, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#00A8E8';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    Truy cập Dashboard
                </Link>
            </div>

            <button
                className="mobile-menu-btn"
                onClick={() => setMobileOpen(!mobileOpen)}
                style={{
                    display: 'none',
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    padding: '8px',
                }}
            >
                {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {mobileOpen && (
                <div
                    className="mobile-nav"
                    style={{
                        position: 'fixed',
                        top: '72px',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.95)',
                        backdropFilter: 'blur(20px)',
                        padding: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}
                >
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            onClick={() => setMobileOpen(false)}
                            style={{
                                color: 'rgba(255,255,255,0.8)',
                                textDecoration: 'none',
                                fontSize: '18px',
                                fontWeight: 500,
                                padding: '16px',
                                borderRadius: '8px',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            {link.label}
                        </a>
                    ))}
                    <Link
                        to="/dashboard"
                        onClick={() => setMobileOpen(false)}
                        style={{
                            background: '#00A8E8',
                            color: '#0a0a0a',
                            padding: '16px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            textAlign: 'center',
                            marginTop: '16px',
                        }}
                    >
                        Truy cập Dashboard
                    </Link>
                </div>
            )}

            <style>{`
        @media (max-width: 1024px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
      `}</style>
        </header>
    );
}
