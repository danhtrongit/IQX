import { Mail, MessageCircle, MapPin, Phone } from 'lucide-react';

export default function ContactSection() {
    return (
        <section id="contact" style={{ position: 'relative', padding: '60px 40px', background: '#000', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-150px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '300px', background: 'radial-gradient(ellipse, rgba(0, 168, 232, 0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, color: '#fff', marginBottom: '16px', letterSpacing: '-0.5px' }}>
                        Liên hệ với chúng tôi
                    </h2>
                    <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.5)', maxWidth: '600px', margin: '0 auto', lineHeight: 1.7 }}>
                        Bạn cần hỗ trợ hoặc muốn tìm hiểu thêm? Đội ngũ của chúng tôi luôn sẵn sàng.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'start' }} className="contact-grid">
                    {/* Info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {[
                            { icon: <Mail size={20} />, label: 'Email', value: 'support@iqx.vn', href: 'mailto:support@iqx.vn' },
                            { icon: <Phone size={20} />, label: 'Hotline', value: '0901 234 567', href: 'tel:0901234567' },
                            { icon: <MessageCircle size={20} />, label: 'Zalo', value: 'IQX Official', href: '#' },
                            { icon: <MapPin size={20} />, label: 'Địa chỉ', value: 'TP. Hồ Chí Minh, Việt Nam' },
                        ].map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px', borderRadius: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.3s ease' }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,168,232,0.2)'; e.currentTarget.style.background = 'rgba(0,168,232,0.03)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                            >
                                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(0,168,232,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00A8E8', flexShrink: 0 }}>
                                    {item.icon}
                                </div>
                                <div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px', fontWeight: 500 }}>{item.label}</div>
                                    {item.href ? (
                                        <a href={item.href} style={{ fontSize: '15px', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>{item.value}</a>
                                    ) : (
                                        <span style={{ fontSize: '15px', color: '#fff', fontWeight: 600 }}>{item.value}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Form */}
                    <form style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', padding: '32px' }} onSubmit={(e) => e.preventDefault()}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', display: 'block', fontWeight: 500 }}>Họ và tên</label>
                                <input type="text" placeholder="Nguyễn Văn A" style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', display: 'block', fontWeight: 500 }}>Email</label>
                                <input type="email" placeholder="email@example.com" style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', display: 'block', fontWeight: 500 }}>Nội dung</label>
                                <textarea rows={4} placeholder="Nhập nội dung..." style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                            </div>
                            <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '10px', background: '#00A8E8', color: '#0a0a0a', fontSize: '15px', fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.3s ease' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#33BFEF'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#00A8E8'; e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                                Gửi tin nhắn
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            <style>{`@media (max-width: 768px) { .contact-grid { grid-template-columns: 1fr !important; } }`}</style>
        </section>
    );
}
