import { Clock, Timer, ShieldCheck, Bell } from 'lucide-react';

const coreValues = [
    {
        icon: <Clock size={28} />,
        title: 'Phân tích theo thời gian thực',
        description: 'AI theo dõi thị trường liên tục, cập nhật xu hướng, mốc quan trọng và cảnh báo rủi ro ngay khi tín hiệu thay đổi.',
    },
    {
        icon: <Timer size={28} />,
        title: 'Tiết kiệm thời gian phân tích',
        description: 'Không cần ngồi lọc tin và soi biểu đồ hàng giờ. Nhận bản tóm tắt cô đọng, tập trung vào điều cần quyết định.',
    },
    {
        icon: <ShieldCheck size={28} />,
        title: 'Chuẩn hóa quyết định đầu tư',
        description: 'Tín hiệu dựa trên dữ liệu và tiêu chí nhất quán giúp bạn bám kế hoạch, hạn chế FOMO và ra quyết định kỷ luật hơn.',
    },
    {
        icon: <Bell size={28} />,
        title: 'Tín hiệu đầu tư',
        description: 'Khi có biến động đáng chú ý, hệ thống gửi cập nhật kịp thời để bạn nắm bắt xu hướng và chuẩn bị kịch bản phù hợp.',
    },
];

export default function CoreValuesSection() {
    return (
        <section id="core-values" style={{ position: 'relative', padding: '40px 20px', background: '#000', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: '-100px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '300px', background: 'radial-gradient(ellipse, rgba(0, 168, 232, 0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <h2 style={{ fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.5px' }}>
                        <span style={{ background: 'linear-gradient(135deg, #00A8E8 0%, #0081B7 50%, #006994 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ARIX AI</span>
                        <span style={{ color: '#fff' }}> - Giá trị cốt lõi</span>
                    </h2>
                    <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.55)', maxWidth: '700px', margin: '0 auto', lineHeight: 1.6 }}>
                        AI phân tích dữ liệu đa nguồn theo thời gian thực, chắt lọc tín hiệu quan trọng và chuyển thành kịch bản hành động rõ ràng.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }} className="core-values-grid">
                    {coreValues.map((item, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '24px 20px', transition: 'all 0.3s ease', cursor: 'default', position: 'relative', overflow: 'hidden' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(0, 168, 232, 0.2)'; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.3)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <div style={{ position: 'absolute', top: '-50%', right: '-50%', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0, 168, 232, 0.03) 0%, transparent 70%)', pointerEvents: 'none' }} />
                            <div style={{ color: '#00A8E8', marginBottom: '16px', opacity: 0.9 }}>{item.icon}</div>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>{item.title}</h3>
                            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{item.description}</p>
                        </div>
                    ))}
                </div>
            </div>
            <style>{`@media (max-width: 1024px) { .core-values-grid { grid-template-columns: repeat(2, 1fr) !important; } } @media (max-width: 640px) { .core-values-grid { grid-template-columns: 1fr !important; } }`}</style>
        </section>
    );
}
