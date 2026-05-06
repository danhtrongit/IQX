import { TrendingUp, Droplets, DollarSign, CalendarClock, Target, ArrowRight, CheckCircle2 } from 'lucide-react';

const layers = [
    { icon: <TrendingUp size={20} />, label: 'Xu hướng', color: '#22c55e' },
    { icon: <Droplets size={20} />, label: 'Thanh khoản', color: '#3b82f6' },
    { icon: <DollarSign size={20} />, label: 'Dòng tiền lớn', color: '#f59e0b' },
    { icon: <CalendarClock size={20} />, label: 'Sự kiện', color: '#10b981' },
    { icon: <Target size={20} />, label: 'Hành động & Kịch bản', color: '#00A8E8' },
];

const results = [
    'Mã đang ở pha nào',
    'Có dễ vào/ra không',
    'Dòng tiền lớn đang ủng hộ hay cảnh báo',
    'Nên mua, giữ hay chỉ quan sát',
];

export default function ScenarioSection() {
    return (
        <section
            id="scenario"
            style={{
                position: 'relative',
                padding: '120px 40px',
                background: '#000',
            }}
        >
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '800px',
                height: '800px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(0, 168, 232, 0.04) 0%, transparent 70%)',
                pointerEvents: 'none',
            }} />

            <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
                <div style={{ textAlign: 'center', marginBottom: '60px' }}>
                    <h2 style={{
                        fontSize: 'clamp(28px, 4vw, 44px)',
                        fontWeight: 700,
                        color: '#fff',
                        marginBottom: '24px',
                        lineHeight: 1.3,
                    }}>
                        Thị trường không thiếu dữ liệu.
                        <br />
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85em' }}>
                            Điều khó là ghép đúng dữ liệu để ra quyết định.
                        </span>
                    </h2>
                </div>

                <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '20px',
                    padding: '48px 40px',
                    marginBottom: '40px',
                }}>
                    <p style={{
                        fontSize: '17px',
                        color: 'rgba(255,255,255,0.6)',
                        lineHeight: 1.8,
                        marginBottom: '32px',
                    }}>
                        Một mã cổ phiếu có thể đang xanh, nhưng:
                    </p>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '16px',
                        marginBottom: '40px',
                    }} className="problems-grid">
                        {[
                            'Xu hướng chưa đủ chắc',
                            'Thanh khoản chưa đẹp',
                            'Dòng tiền lớn đang đi ngược',
                            'Sắp có sự kiện dễ gây nhiễu',
                        ].map((problem, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '14px 20px',
                                borderRadius: '10px',
                                background: 'rgba(239, 68, 68, 0.05)',
                                border: '1px solid rgba(239, 68, 68, 0.1)',
                            }}>
                                <div style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: '#ef4444', flexShrink: 0,
                                }} />
                                <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)' }}>{problem}</span>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginBottom: '40px' }}>
                        <p style={{
                            fontSize: '17px',
                            fontWeight: 600,
                            color: '#fff',
                            marginBottom: '24px',
                        }}>
                            Hệ thống AI tổng hợp mọi tín hiệu quan trọng thành <span style={{ color: '#00A8E8' }}>5 lớp phân tích</span> rõ ràng:
                        </p>
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                        }}>
                            {layers.map((layer, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 18px',
                                        borderRadius: '10px',
                                        background: `${layer.color}10`,
                                        border: `1px solid ${layer.color}25`,
                                        color: layer.color,
                                        fontSize: '14px',
                                        fontWeight: 600,
                                    }}>
                                        {layer.icon}
                                        {layer.label}
                                    </div>
                                    {i < layers.length - 1 && (
                                        <ArrowRight size={16} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{
                        padding: '24px',
                        borderRadius: '12px',
                        background: 'rgba(0, 168, 232, 0.04)',
                        border: '1px solid rgba(0, 168, 232, 0.1)',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            fontWeight: 500,
                            color: 'rgba(255,255,255,0.6)',
                            marginBottom: '20px',
                        }}>
                            Bạn không cần tự nối từng mảnh thông tin rời rạc.
                            <br />
                            <strong style={{ color: '#fff' }}>Chỉ cần chọn mã và bấm phân tích để thấy ngay:</strong>
                        </p>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '12px',
                        }} className="results-grid">
                            {results.map((result, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <CheckCircle2 size={18} color="#00A8E8" />
                                    <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                                        {result}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'center', padding: '32px' }}>
                    <p style={{
                        fontSize: '20px',
                        fontWeight: 600,
                        color: '#fff',
                        letterSpacing: '-0.3px',
                    }}>
                        Ít rối hơn. <span style={{ color: '#00A8E8' }}>Nhanh hơn.</span> Kỷ luật hơn.
                    </p>
                </div>
            </div>

            <style>{`
        @media (max-width: 768px) {
          .problems-grid, .results-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
        </section>
    );
}
