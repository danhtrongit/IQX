import { Bot, Scan, BarChart2, LineChart, Search, BrainCircuit } from 'lucide-react';

const agents = [
    {
        icon: <Scan size={24} />,
        title: 'Quét mẫu hình nến',
        desc: 'Tự động nhận diện các mẫu hình nến phổ biến và phát tín hiệu đảo chiều hoặc tiếp diễn xu hướng.',
        color: '#22c55e',
    },
    {
        icon: <BarChart2 size={24} />,
        title: 'Quét mẫu hình giá',
        desc: 'Phân tích mẫu hình giá (tam giác, cờ, vai đầu vai...) để dự báo xu hướng dài hạn.',
        color: '#3b82f6',
    },
    {
        icon: <LineChart size={24} />,
        title: 'Phân tích xu hướng',
        desc: 'Theo dõi xu hướng ngắn/trung/dài hạn, xác định các mốc hỗ trợ - kháng cự quan trọng.',
        color: '#f59e0b',
    },
    {
        icon: <Search size={24} />,
        title: 'Phân tích thanh khoản',
        desc: 'Đánh giá mức độ thanh khoản, khả năng vào/ra dễ dàng hay dễ bị kẹt lệnh.',
        color: '#10b981',
    },
    {
        icon: <BrainCircuit size={24} />,
        title: 'Dòng tiền thông minh',
        desc: 'Phân tích hành vi mua bán của khối ngoại, tự doanh và tổ chức lớn.',
        color: '#ec4899',
    },
    {
        icon: <Bot size={24} />,
        title: 'Kịch bản hành động',
        desc: 'Tổng hợp toàn bộ phân tích thành kịch bản cụ thể: mua, giữ, bán hay chỉ quan sát.',
        color: '#00A8E8',
    },
];

export default function AgentsSection() {
    return (
        <section
            id="agents"
            style={{
                position: 'relative',
                padding: '120px 40px',
                background: '#000',
            }}
        >
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '60px' }}>
                    <h2 style={{
                        fontSize: 'clamp(32px, 4vw, 48px)',
                        fontWeight: 700,
                        color: '#fff',
                        marginBottom: '16px',
                        letterSpacing: '-0.5px',
                    }}>
                        Tổng quan về các{' '}
                        <span style={{ color: '#00A8E8' }}>Agent</span>
                    </h2>
                    <p style={{
                        fontSize: '17px',
                        color: 'rgba(255,255,255,0.5)',
                        maxWidth: '600px',
                        margin: '0 auto',
                    }}>
                        Quét mẫu hình nến vs mẫu hình giá
                    </p>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '20px',
                }} className="agents-grid">
                    {agents.map((agent, i) => (
                        <div
                            key={i}
                            style={{
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '16px',
                                padding: '28px 24px',
                                transition: 'all 0.3s ease',
                                cursor: 'default',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                e.currentTarget.style.borderColor = `${agent.color}33`;
                                e.currentTarget.style.transform = 'translateY(-4px)';
                                e.currentTarget.style.boxShadow = `0 8px 30px ${agent.color}11`;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '12px',
                                background: `${agent.color}15`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: agent.color,
                                marginBottom: '16px',
                            }}>
                                {agent.icon}
                            </div>
                            <h3 style={{
                                fontSize: '17px',
                                fontWeight: 700,
                                color: '#fff',
                                marginBottom: '8px',
                            }}>
                                {agent.title}
                            </h3>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255,255,255,0.45)',
                                lineHeight: 1.6,
                            }}>
                                {agent.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
        @media (max-width: 768px) {
          .agents-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .agents-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
        </section>
    );
}
