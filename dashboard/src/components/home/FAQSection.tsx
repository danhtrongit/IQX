import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

const faqs = [
    {
        q: 'AI phân tích chứng khoán hoạt động như thế nào?',
        a: 'Hệ thống AI của chúng tôi tổng hợp dữ liệu từ nhiều nguồn khác nhau (giá cả, khối lượng, dòng tiền, tin tức, sự kiện...) và phân tích qua 5 lớp: Xu hướng – Thanh khoản – Dòng tiền lớn – Sự kiện – Hành động & Kịch bản. Kết quả được trình bày gọn gàng để bạn ra quyết định nhanh hơn.',
    },
    {
        q: 'Tôi không có kinh nghiệm đầu tư, có sử dụng được không?',
        a: 'Hoàn toàn được! AI sẽ phân tích và đưa ra kịch bản hành động cụ thể (mua, giữ, bán, hoặc chỉ quan sát). Bạn chỉ cần chọn mã và bấm phân tích. Các chỉ báo được giải thích dễ hiểu, phù hợp cho cả người mới.',
    },
    {
        q: 'AI sử dụng dữ liệu nào để phân tích?',
        a: 'Chúng tôi sử dụng dữ liệu đa nguồn bao gồm: giá cổ phiếu real-time, khối lượng giao dịch, dòng tiền khối ngoại & tự doanh, mẫu hình kỹ thuật (nến, giá), tin tức thị trường, sự kiện doanh nghiệp, và lịch sử giao dịch nội bộ.',
    },
    {
        q: 'Tín hiệu AI có chính xác không?',
        a: 'Tín hiệu AI dựa trên dữ liệu và tiêu chí nhất quán, không bị ảnh hưởng bởi cảm xúc. Tuy nhiên, không có hệ thống nào đảm bảo 100%. AI cung cấp thông tin tham khảo giúp bạn ra quyết định có cơ sở hơn, không phải lời khuyên đầu tư.',
    },
    {
        q: 'Tôi có thể dùng thử miễn phí không?',
        a: 'Có! Chúng tôi cung cấp gói dùng thử để bạn trải nghiệm các tính năng cơ bản trước khi quyết định nâng cấp lên gói Pro hoặc Doanh nghiệp.',
    },
];

export default function FAQSection() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <section
            id="faq"
            style={{
                position: 'relative',
                padding: '60px 40px',
                background: '#000',
            }}
        >
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <h2 style={{
                        fontSize: 'clamp(28px, 4vw, 40px)',
                        fontWeight: 700,
                        color: '#fff',
                        marginBottom: '16px',
                    }}>
                        Câu hỏi thường gặp
                    </h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {faqs.map((faq, i) => (
                        <div
                            key={i}
                            style={{
                                background: openIndex === i ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                transition: 'all 0.3s ease',
                            }}
                        >
                            <button
                                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '20px 24px',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#fff',
                                    fontSize: '16px',
                                    fontWeight: 500,
                                    textAlign: 'left',
                                    gap: '16px',
                                }}
                            >
                                <span>{faq.q}</span>
                                <ChevronDown
                                    size={20}
                                    style={{
                                        color: 'rgba(255,255,255,0.4)',
                                        transition: 'transform 0.3s ease',
                                        transform: openIndex === i ? 'rotate(180deg)' : 'rotate(0)',
                                        flexShrink: 0,
                                    }}
                                />
                            </button>
                            <div style={{
                                maxHeight: openIndex === i ? '200px' : '0',
                                overflow: 'hidden',
                                transition: 'max-height 0.3s ease',
                            }}>
                                <p style={{
                                    padding: '0 24px 20px',
                                    fontSize: '15px',
                                    color: 'rgba(255,255,255,0.5)',
                                    lineHeight: 1.7,
                                }}>
                                    {faq.a}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
