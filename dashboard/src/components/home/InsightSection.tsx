import { TrendingUp, BarChart3, Activity } from 'lucide-react';
import { Link } from 'react-router';

export default function InsightSection() {
    return (
        <section
            id="insight"
            style={{
                position: 'relative',
                padding: '60px 40px',
                background: '#000',
                overflow: 'hidden',
            }}
        >
            <div style={{
                position: 'absolute',
                top: '-200px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '800px',
                height: '400px',
                background: 'radial-gradient(ellipse, rgba(0, 168, 232, 0.06) 0%, transparent 70%)',
                pointerEvents: 'none',
            }} />

            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {/* Heading removed */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '40px',
                    alignItems: 'center',
                }} className="insight-grid">
                    <div style={{
                        background: '#111',
                        borderRadius: '20px',
                        padding: '32px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        position: 'relative',
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '24px',
                        }}>
                            <span style={{ fontSize: '16px', fontWeight: 600, color: '#fff' }}>Tín hiệu AI</span>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                border: '2px solid #00A8E8',
                                borderTop: '2px solid transparent',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }} />
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                            {['Cổ phiếu', 'Xu hướng', 'Rủi ro'].map((tag, i) => (
                                <span key={tag} style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    background: i === 0 ? '#00A8E8' : 'rgba(255,255,255,0.06)',
                                    color: i === 0 ? '#0a0a0a' : 'rgba(255,255,255,0.7)',
                                    border: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                }}>
                                    {tag}
                                </span>
                            ))}
                        </div>

                        {[
                            { symbol: 'ACB', status: 'Tín hiệu mua', statusColor: '#22c55e', icon: <TrendingUp size={18} />, price: '23,300' },
                            { symbol: 'VIC', status: 'Đang theo dõi', statusColor: '#f59e0b', icon: <Activity size={18} />, price: '45,000' },
                            { symbol: 'FPT', status: 'Cảnh báo rủi ro', statusColor: '#ef4444', icon: <BarChart3 size={18} />, price: '128,500' },
                        ].map((item, i) => (
                            <Link key={item.symbol} to={`/co-phieu/${item.symbol}`} style={{
                                textDecoration: 'none',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '12px',
                                padding: '16px',
                                marginBottom: i < 2 ? '12px' : '0',
                                border: '1px solid rgba(255,255,255,0.06)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.3s ease',
                                cursor: 'pointer',
                            }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = 'rgba(0, 168, 232, 0.3)';
                                    e.currentTarget.style.background = 'rgba(0, 168, 232, 0.05)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '8px',
                                        background: 'rgba(0, 168, 232, 0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#00A8E8',
                                    }}>
                                        {item.icon}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '15px', color: '#fff' }}>{item.symbol}</div>
                                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Giá: {item.price}</div>
                                    </div>
                                </div>
                                <span style={{
                                    padding: '4px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    background: `${item.statusColor}22`,
                                    color: item.statusColor,
                                }}>
                                    {item.status}
                                </span>
                            </Link>
                        ))}

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0',
                            marginTop: '24px',
                        }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00A8E8' }} />
                            <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
                                <div style={{ width: '60%', height: '100%', background: '#00A8E8', borderRadius: '1px' }} />
                            </div>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                            <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.1)' }} />
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                        </div>
                    </div>

                    <div>
                        <h3 style={{
                            fontSize: 'clamp(28px, 3vw, 40px)',
                            fontWeight: 700,
                            marginBottom: '20px',
                            lineHeight: 1.2,
                        }}>
                            <span style={{ color: '#00A8E8', fontStyle: 'italic' }}>AI</span>
                            <span style={{ color: '#fff' }}> — Chiến lược đầu tư</span>
                        </h3>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255,255,255,0.6)',
                            lineHeight: 1.7,
                            marginBottom: '32px',
                        }}>
                            AI liên tục cập nhật tín hiệu, ngưỡng quan trọng và kịch bản (tốt/xấu/đi ngang) để bạn ra quyết định có cơ sở và quản trị rủi ro tốt hơn.
                        </p>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {['Chuyên nghiệp', 'Rõ ràng', 'Tin cậy'].map((tag) => (
                                <span key={tag} style={{
                                    padding: '10px 24px',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'rgba(255,255,255,0.8)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    background: 'rgba(255,255,255,0.03)',
                                }}>
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .insight-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
        </section>
    );
}
