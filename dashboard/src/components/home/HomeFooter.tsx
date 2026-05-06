import { Mail, Phone, MapPin } from 'lucide-react';

export default function HomeFooter() {
    return (
        <footer
            id="contact"
            style={{
                background: '#000',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: '60px 40px 24px',
            }}
        >
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    gap: '40px',
                    marginBottom: '48px',
                }} className="footer-grid">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                background: 'linear-gradient(135deg, #00A8E8, #006994)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '14px',
                                color: '#0a0a0a',
                            }}>
                                IQ
                            </div>
                            <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>IQX</span>
                        </div>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255,255,255,0.4)',
                            lineHeight: 1.7,
                            maxWidth: '280px',
                        }}>
                            AI thế hệ mới – Phân tích chứng khoán toàn diện. Dữ liệu đa nguồn, phân tích đa chiều và gợi ý hành động.
                        </p>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Sản phẩm
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[
                                { name: 'Trang chủ', href: '#hero' },
                                { name: 'Tổng quan', href: '#insight' },
                                { name: 'Giá trị cốt lõi', href: '#core-values' },
                                { name: 'Bảng giá', href: '#pricing' }
                            ].map((link) => (
                                <a key={link.name} href={link.href} style={{
                                    color: 'rgba(255,255,255,0.4)',
                                    textDecoration: 'none',
                                    fontSize: '14px',
                                    transition: 'color 0.2s ease',
                                }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#00A8E8'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                                >
                                    {link.name}
                                </a>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Hỗ trợ
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {['Câu hỏi thường gặp', 'Hướng dẫn sử dụng', 'Điều khoản dịch vụ', 'Chính sách bảo mật'].map((link) => (
                                <a key={link} href="#" style={{
                                    color: 'rgba(255,255,255,0.4)',
                                    textDecoration: 'none',
                                    fontSize: '14px',
                                    transition: 'color 0.2s ease',
                                }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#00A8E8'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                                >
                                    {link}
                                </a>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Liên hệ
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Mail size={14} color="rgba(255,255,255,0.3)" />
                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>support@iqx.ai</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Phone size={14} color="rgba(255,255,255,0.3)" />
                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>0901 234 567</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <MapPin size={14} color="rgba(255,255,255,0.3)" style={{ marginTop: '2px', flexShrink: 0 }} />
                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>TP. Hồ Chí Minh, Việt Nam</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    paddingTop: '24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px',
                }}>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>
                        © 2025 IQX. All rights reserved.
                    </p>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        {['Facebook', 'Telegram', 'Zalo'].map((social) => (
                            <a key={social} href="#" style={{
                                color: 'rgba(255,255,255,0.3)',
                                textDecoration: 'none',
                                fontSize: '13px',
                                transition: 'color 0.2s ease',
                            }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#00A8E8'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
                            >
                                {social}
                            </a>
                        ))}
                    </div>
                </div>
            </div>

            <style>{`
        @media (max-width: 768px) {
          .footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 480px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
        </footer>
    );
}
