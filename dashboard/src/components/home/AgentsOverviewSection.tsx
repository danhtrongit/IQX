import { CandlestickChart, TrendingUp, BarChart2, Zap, ArrowLeftRight, Target } from "lucide-react";

const agents = [
    { icon: CandlestickChart, title: 'Quét mẫu hình nến', desc: 'Tự động nhận diện các mẫu hình nến phổ biến và phát tín hiệu đảo chiều hoặc tiếp diễn xu hướng.' },
    { icon: TrendingUp, title: 'Quét mẫu hình giá', desc: 'Phân tích mẫu hình giá (tam giác, cờ, vai đầu vai...) để dự báo xu hướng dài hạn.' },
    { icon: BarChart2, title: 'Phân tích xu hướng', desc: 'Theo dõi xu hướng ngắn/trung/dài hạn, xác định các mốc hỗ trợ - kháng cự quan trọng.' },
    { icon: Zap, title: 'Phân tích thanh khoản', desc: 'Đánh giá mức độ thanh khoản, khả năng vào/ra dễ dàng hay dễ bị kẹt lệnh.' },
    { icon: ArrowLeftRight, title: 'Dòng tiền thông minh', desc: 'Phân tích hành vi mua bán của khối ngoại, tự doanh và tổ chức lớn.' },
    { icon: Target, title: 'Kịch bản hành động', desc: 'Tổng hợp toàn bộ phân tích thành kịch bản cụ thể: mua, giữ, bán hay chỉ quan sát.' },
];

export default function AgentsOverviewSection() {
    return (
        <section id="agents-overview" style={{ padding: '80px 20px', background: '#000', position: 'relative' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, marginBottom: '16px', color: '#fff', letterSpacing: '-0.5px' }}>
                        Tổng quan về các <span style={{ color: '#00A8E8' }}>Agent</span>
                    </h2>
                    <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', maxWidth: '600px', margin: '0 auto' }}>
                        Hệ thống các AI chuyên biệt xử lý từng khía cạnh của thị trường để mang lại góc nhìn sâu sắc nhất.
                    </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                    {agents.map((agent, i) => {
                        const Icon = agent.icon;
                        return (
                            <div key={i} style={{
                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '16px', padding: '32px 24px', transition: 'all 0.3s ease', cursor: 'default'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,168,232,0.3)'; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.2)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(0,168,232,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00A8E8' }}>
                                        <Icon size={24} />
                                    </div>
                                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', margin: 0 }}>{agent.title}</h3>
                                </div>
                                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0 }}>
                                    {agent.desc}
                                </p>
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    );
}
