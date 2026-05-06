import { Lightbulb, GitCompareArrows, ShieldAlert } from 'lucide-react';

const axes = [
    {
        icon: <Lightbulb size={28} />,
        title: 'Biến dữ liệu rối thành quyết định rõ',
        angle: '1 mã, hàng trăm dữ liệu, nhưng bạn chỉ cần 1 kết luận.',
        points: [
            '"Đang tăng hay chỉ hồi kỹ thuật?"',
            '"Có dễ vào/ra không hay dễ kẹt lệnh?"',
            '"Nước ngoài/tự doanh đang đỡ hay xả?"',
        ],
        cta: 'Chọn mã → bấm phân tích → nhận ngay bức tranh đầy đủ.',
        color: '#00A8E8',
    },
    {
        icon: <GitCompareArrows size={28} />,
        title: "So sánh 'tự đọc chart' vs 'AI tổng hợp 5 lớp'",
        angle: 'Không cần tự nối từng mảnh dữ liệu.',
        leftLabel: 'Tự phân tích',
        leftItems: ['Chart rời rạc', 'Orderbook phức tạp', 'Khối ngoại tự tra', 'Tin rời không liên kết'],
        rightLabel: 'AI tổng hợp',
        rightItems: ['1 báo cáo gọn', 'Hành động cụ thể', 'Kịch bản rõ ràng', '5 lớp phân tích'],
        color: '#3b82f6',
    },
    {
        icon: <ShieldAlert size={28} />,
        title: 'Chống nhiễu, không FOMO',
        angle: 'Không phải thấy xanh là mua.',
        points: [
            'Giá tăng nhưng bị bán ròng mạnh',
            'Thanh khoản xấu dù chart đẹp',
            'Nội bộ bán liên tiếp thì cần thận trọng',
        ],
        color: '#ef4444',
    },
];

export default function AnalysisSection() {
    return (
        <section
            id="analysis"
            style={{
                position: 'relative',
                padding: '120px 40px',
                background: '#000',
            }}
        >
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '80px' }}>
                    <h2 style={{
                        fontSize: 'clamp(28px, 4vw, 44px)',
                        fontWeight: 700,
                        color: '#fff',
                        marginBottom: '16px',
                    }}>
                        Kết quả nhanh – khác biệt – độ tin cậy cao
                    </h2>
                    <p style={{
                        fontSize: '17px',
                        color: 'rgba(255,255,255,0.5)',
                        maxWidth: '700px',
                        margin: '0 auto',
                        lineHeight: 1.6,
                    }}>
                        AI giúp tôi ra quyết định nhanh hơn, đỡ rối hơn, và tránh sai lầm.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                    {axes.map((axis, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: i === 1 ? '1fr' : '1fr 1fr',
                                gap: '40px',
                                alignItems: 'center',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '20px',
                                padding: '48px 40px',
                                transition: 'all 0.3s ease',
                            }}
                            className="analysis-card"
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = `${axis.color}33`;
                                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                            }}
                        >
                            {i === 1 ? (
                                <>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                            <div style={{
                                                color: axis.color, width: '48px', height: '48px', borderRadius: '12px',
                                                background: `${axis.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>{axis.icon}</div>
                                            <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>{axis.title}</h3>
                                        </div>
                                        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px', fontStyle: 'italic' }}>
                                            "{axis.angle}"
                                        </p>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="comparison-grid">
                                            <div style={{
                                                background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)',
                                                borderRadius: '12px', padding: '24px',
                                            }}>
                                                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444', marginBottom: '16px' }}>
                                                    {axis.leftLabel}
                                                </h4>
                                                {axis.leftItems?.map((item, j) => (
                                                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', opacity: 0.6 }} />
                                                        <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{item}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{
                                                background: 'rgba(0, 168, 232, 0.05)', border: '1px solid rgba(0, 168, 232, 0.15)',
                                                borderRadius: '12px', padding: '24px',
                                            }}>
                                                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#00A8E8', marginBottom: '16px' }}>
                                                    {axis.rightLabel}
                                                </h4>
                                                {axis.rightItems?.map((item, j) => (
                                                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00A8E8' }} />
                                                        <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>{item}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ order: i % 2 === 0 ? 1 : 2 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                            <div style={{
                                                color: axis.color, width: '48px', height: '48px', borderRadius: '12px',
                                                background: `${axis.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>{axis.icon}</div>
                                            <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>{axis.title}</h3>
                                        </div>
                                        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', marginBottom: '24px', fontStyle: 'italic' }}>
                                            "{axis.angle}"
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {axis.points?.map((point, j) => (
                                                <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                    <div style={{
                                                        width: '8px', height: '8px', borderRadius: '50%',
                                                        background: axis.color, marginTop: '6px', flexShrink: 0,
                                                    }} />
                                                    <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                                                        {point}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        {axis.cta && (
                                            <p style={{
                                                marginTop: '24px', padding: '16px 20px', borderRadius: '10px',
                                                background: `${axis.color}10`, border: `1px solid ${axis.color}25`,
                                                fontSize: '14px', fontWeight: 600, color: axis.color, lineHeight: 1.5,
                                            }}>
                                                💡 {axis.cta}
                                            </p>
                                        )}
                                    </div>
                                    <div style={{
                                        order: i % 2 === 0 ? 2 : 1,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <div style={{
                                            width: '100%', aspectRatio: '4/3', borderRadius: '16px',
                                            background: `linear-gradient(135deg, ${axis.color}08, ${axis.color}03)`,
                                            border: `1px solid ${axis.color}15`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexDirection: 'column', gap: '16px',
                                        }}>
                                            <div style={{ color: axis.color, opacity: 0.5 }}>{axis.icon}</div>
                                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)', fontWeight: 500 }}>
                                                Minh họa phân tích
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
        @media (max-width: 768px) {
          .analysis-card {
            grid-template-columns: 1fr !important;
            padding: 32px 24px !important;
          }
          .comparison-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
        </section>
    );
}
