import { Check, Zap, Crown, Rocket } from 'lucide-react';

const features = [
    'Truy cập đầy đủ 6 lớp AI Insight',
    'Phân tích & kịch bản hành động chi tiết',
    'Tra cứu dữ liệu thị trường real-time',
    'Hệ thống cảnh báo điểm mua/bán sớm',
    'Lưu trữ danh mục theo dõi không giới hạn',
    'Hỗ trợ khách hàng ưu tiên 24/7'
];

function fmtPrice(amount: number) {
    return new Intl.NumberFormat('vi-VN').format(amount);
}

const plans = [
    {
        name: 'Gói 1 Tháng',
        icon: <Zap size={22} />,
        pricePerMonth: 100000,
        totalPrice: null,
        badge: '',
        description: 'Trải nghiệm linh hoạt theo tháng',
        popular: false,
    },
    {
        name: 'Gói 6 Tháng',
        icon: <Crown size={22} />,
        pricePerMonth: 90000,
        totalPrice: 540000,
        badge: 'Tiết kiệm 10%',
        description: 'Lựa chọn tiêu chuẩn, tối ưu chi phí',
        popular: true,
    },
    {
        name: 'Gói 1 Năm',
        icon: <Rocket size={22} />,
        pricePerMonth: 80000,
        totalPrice: 960000,
        badge: 'Tiết kiệm 20%',
        description: 'Đầu tư dài hạn, tiết kiệm tối đa',
        popular: false,
    },
];

export default function PricingSection() {
    return (
        <section id="pricing" style={{ position: 'relative', padding: '60px 40px', background: '#000' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, color: '#fff', marginBottom: '16px', letterSpacing: '-0.5px' }}>
                        Đầu tư thông minh,
                        <br />chi phí hợp lý
                    </h2>
                    <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.5)', maxWidth: '600px', margin: '0 auto', lineHeight: 1.7 }}>
                        Sử dụng trọn bộ công cụ AI phân tích chuyên sâu mà không bị giới hạn tính năng ở bất kỳ gói nào. Tùy chọn thời hạn phù hợp với bạn.
                    </p>
                </div>

                {/* Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', maxWidth: '1060px', margin: '0 auto' }} className="pricing-grid">
                    {plans.map((plan, i) => (
                        <div key={i} style={{
                            background: plan.popular ? 'rgba(0, 168, 232, 0.04)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${plan.popular ? 'rgba(0, 168, 232, 0.25)' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '20px', padding: '24px 20px', position: 'relative', transition: 'all 0.3s ease',
                        }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-6px)';
                                e.currentTarget.style.boxShadow = plan.popular ? '0 16px 60px rgba(0, 168, 232, 0.15)' : '0 12px 40px rgba(0,0,0,0.3)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            {plan.badge && (
                                <span style={{ position: 'absolute', top: '-14px', right: '24px', background: 'linear-gradient(135deg, #00A8E8, #0081B7)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '5px 14px', borderRadius: '100px' }}>
                                    {plan.badge}
                                </span>
                            )}
                            
                            {plan.popular && (
                                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '80%', height: '1px', background: 'linear-gradient(90deg, transparent, #00A8E8, transparent)' }} />
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <div style={{ color: '#00A8E8' }}>{plan.icon}</div>
                                <span style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{plan.name}</span>
                            </div>
                            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>{plan.description}</p>

                            <div style={{ marginBottom: '6px' }}>
                                <span style={{ fontSize: '40px', fontWeight: 800, color: '#fff', letterSpacing: '-1px' }}>{fmtPrice(plan.pricePerMonth)}</span>
                                <span style={{ fontSize: '16px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginLeft: '4px' }}>VND</span>
                            </div>
                            
                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '24px', minHeight: '16px' }}>
                                /tháng {plan.totalPrice && `· Thanh toán ${fmtPrice(plan.totalPrice)} VND`}
                            </p>

                            <a href="#" style={{
                                display: 'block', textAlign: 'center', padding: '12px', borderRadius: '10px', fontWeight: 600, fontSize: '15px', textDecoration: 'none', marginBottom: '16px', transition: 'all 0.2s ease',
                                background: plan.popular ? '#00A8E8' : 'transparent',
                                color: plan.popular ? '#0a0a0a' : '#fff',
                                border: plan.popular ? 'none' : '1px solid rgba(255,255,255,0.2)',
                            }}>Chọn gói này</a>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                {features.map((f) => (
                                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                        <Check size={16} color={plan.popular ? '#00A8E8' : 'rgba(255,255,255,0.2)'} style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>{f}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <style>{`@media (max-width: 768px) { .pricing-grid { grid-template-columns: 1fr !important; max-width: 400px !important; } }`}</style>
        </section>
    );
}
