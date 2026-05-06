import { Link } from 'react-router';

export default function CTASection() {
    return (
        <section
            id="cta"
            style={{
                position: 'relative',
                padding: '80px 40px',
                background: '#000',
            }}
        >
            <div style={{
                maxWidth: '900px',
                margin: '0 auto',
                background: 'linear-gradient(135deg, rgba(0, 168, 232, 0.08) 0%, rgba(0, 168, 232, 0.02) 100%)',
                border: '1px solid rgba(0, 168, 232, 0.12)',
                borderRadius: '24px',
                padding: '80px 40px',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute',
                    bottom: '-100px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '600px',
                    height: '300px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(0, 168, 232, 0.1) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }} />

                <h2 style={{
                    fontSize: 'clamp(28px, 4vw, 44px)',
                    fontWeight: 700,
                    color: '#fff',
                    marginBottom: '20px',
                    lineHeight: 1.3,
                    position: 'relative',
                    zIndex: 2,
                }}>
                    Trải nghiệm phân tích cùng IQX AI
                    <br />
                    hoàn toàn <span style={{ color: '#00A8E8' }}>MIỄN PHÍ</span>
                </h2>

                <p style={{
                    fontSize: '17px',
                    color: 'rgba(255,255,255,0.5)',
                    marginBottom: '40px',
                    position: 'relative',
                    zIndex: 2,
                }}>
                    Truy cập Dashboard ngay để bắt đầu phân tích cổ phiếu thông minh hơn.
                </p>

                <Link
                    to="/dashboard"
                    id="cta-register"
                    style={{
                        display: 'inline-block',
                        background: '#00A8E8',
                        color: '#0a0a0a',
                        padding: '16px 48px',
                        borderRadius: '10px',
                        fontSize: '17px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        transition: 'all 0.3s ease',
                        position: 'relative',
                        zIndex: 2,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#33BFEF';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 168, 232, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#00A8E8';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    Truy cập Dashboard
                </Link>
            </div>
        </section>
    );
}
