import { useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useNavigate } from 'react-router';
import {
    ReactFlow,
    Background,
    type Node,
    type Edge,
    Position,
    Handle,
    type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TrendingUp, Droplets, ArrowLeftRight, Users, Newspaper, Sparkles } from 'lucide-react';

const LAYER_CFG: Record<string, { label: string; short: string; icon: typeof TrendingUp; color: string; summary: string }> = {
    trend: { label: 'Xu hướng', short: 'L1', icon: TrendingUp, color: '#3b82f6', summary: 'Tăng — MA20 đi lên, giá trên hỗ trợ' },
    liquidity: { label: 'Thanh khoản', short: 'L2', icon: Droplets, color: '#06b6d4', summary: 'Cải thiện, volume vượt TB30' },
    moneyFlow: { label: 'Dòng tiền lớn', short: 'L3', icon: ArrowLeftRight, color: '#10b981', summary: 'Khối ngoại mua ròng 3 phiên' },
    insider: { label: 'Sự kiện', short: 'L4', icon: Users, color: '#f59e0b', summary: 'Ban lãnh đạo mua vào' },
    news: { label: 'Tin tức', short: 'L5', icon: Newspaper, color: '#ec4899', summary: 'Doanh thu kỷ lục quý 4' },
};

function DemoLayerNode({ data }: NodeProps) {
    const cfg = LAYER_CFG[data.layerKey as string];
    if (!cfg) return null;
    const Icon = cfg.icon;
    return (
        <>
            <Handle type="source" position={Position.Right} className="!bg-transparent !border-0 !w-0 !h-0" />
            <Handle type="target" position={Position.Left} className="!bg-transparent !border-0 !w-0 !h-0" />
            <div style={{ width: 220, borderRadius: 14, border: `1px solid ${cfg.color}30`, background: `${cfg.color}08`, backdropFilter: 'blur(8px)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Icon size={16} color={cfg.color} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{cfg.label}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: cfg.color, marginLeft: 'auto', letterSpacing: 1 }}>{cfg.short}</span>
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4, margin: 0 }}>{cfg.summary}</p>
            </div>
        </>
    );
}

function DemoCenterNode({ }: NodeProps) {
    return (
        <>
            <Handle type="target" position={Position.Left} className="!bg-transparent !border-0 !w-0 !h-0" />
            <div style={{
                width: 280, borderRadius: 20, border: '2px solid rgba(0,168,232,0.4)',
                background: 'linear-gradient(135deg, rgba(0,168,232,0.12), rgba(0,0,0,0.85))',
                backdropFilter: 'blur(16px)', padding: '20px', textAlign: 'center',
                boxShadow: '0 0 32px rgba(0,168,232,0.15)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                    <Sparkles size={18} color="#00A8E8" />
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>IQX AI Insights</span>
                </div>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.5, margin: '0 0 12px' }}>Phân tích tổng hợp 6 Lớp</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#10b98120', color: '#10b981', border: '1px solid #10b98130' }}>Xu hướng Tăng</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#3b82f620', color: '#3b82f6', border: '1px solid #3b82f630' }}>Sức mạnh Tốt</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, margin: 0 }}>
                        ⚡ Giữ vị thế — Cấu trúc giá tăng vững chắc, thanh khoản tốt. Được dòng tiền thông minh hỗ trợ mạnh mẽ.
                    </p>
                </div>
            </div>
        </>
    );
}

const demoNodeTypes = { demoLayer: DemoLayerNode, demoCenter: DemoCenterNode };

export default function HeroSection() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { isAuthenticated, setShowAuthModal, setAuthModalTab } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let animationId: number;
        const stars: { x: number; y: number; r: number; speed: number; opacity: number }[] = [];
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize();
        window.addEventListener('resize', resize);
        for (let i = 0; i < 160; i++) {
            stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.2 + 0.3, speed: Math.random() * 0.2 + 0.05, opacity: Math.random() * 0.7 + 0.2 });
        }
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.forEach((s) => {
                s.opacity += (Math.random() - 0.5) * 0.015;
                s.opacity = Math.max(0.1, Math.min(0.9, s.opacity));
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${s.opacity * 0.5})`; ctx.fill();
                s.y -= s.speed * 0.2;
                if (s.y < -3) { s.y = canvas.height + 3; s.x = Math.random() * canvas.width; }
            });
            animationId = requestAnimationFrame(animate);
        };
        animate();
        return () => { cancelAnimationFrame(animationId); window.removeEventListener('resize', resize); };
    }, []);

    const handleLogin = () => {
        if (isAuthenticated) { navigate('/dashboard'); return; }
        setAuthModalTab('login'); setShowAuthModal(true);
    };
    const handleRegister = () => {
        if (isAuthenticated) { navigate('/dashboard'); return; }
        setAuthModalTab('register'); setShowAuthModal(true);
    };

    const { nodes, edges } = useMemo(() => {
        const keys = ['trend', 'liquidity', 'moneyFlow', 'insider', 'news'];
        const positions: Record<string, { x: number; y: number }> = {
            trend:     { x: 0, y: 10 },
            liquidity: { x: 0, y: 120 },
            moneyFlow: { x: 0, y: 230 },
            insider:   { x: 500, y: 30 },
            news:      { x: 500, y: 210 },
        };
        const n: Node[] = keys.map((key) => ({
            id: key, type: 'demoLayer', position: positions[key],
            data: { layerKey: key }, draggable: false,
        }));
        n.push({
            id: 'center', type: 'demoCenter', position: { x: 230, y: 95 },
            data: {}, draggable: false,
        });
        const e: Edge[] = keys.map((key) => ({
            id: `${key}-center`, source: key, target: 'center', animated: true, type: 'default',
            style: { stroke: LAYER_CFG[key].color, strokeWidth: 1.2, strokeOpacity: 0.3, strokeDasharray: '5 3' },
        }));
        return { nodes: n, edges: e };
    }, []);

    return (
        <section id="hero" style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#000' }}>
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }} />
            <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,168,232,0.2) 0%, transparent 70%)', filter: 'blur(60px)', zIndex: 2, left: '15%', top: '50%', transform: 'translate(-50%,-50%)' }} />

            <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%', maxWidth: 1300, margin: '0 auto', padding: '60px 40px 0', boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 40, alignItems: 'center' }} className="hero-grid">

                {/* LEFT — Text + Auth */}
                <div>
                    <div className="animate-fade-in-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 100, padding: '7px 18px', marginBottom: 20 }}>
                        <span style={{ background: '#00A8E8', color: '#0a0a0a', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mới</span>
                        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500 }}>AI thế hệ mới</span>
                    </div>

                    <h1 className="animate-fade-in-up animation-delay-200" style={{ fontSize: 'clamp(32px, 4.5vw, 58px)', fontWeight: 700, lineHeight: 1.08, marginBottom: 20, background: 'linear-gradient(135deg, #fff, rgba(255,255,255,0.8))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: -1.5 }}>
                        AI thế hệ mới<br />Phân tích chứng khoán toàn diện
                    </h1>

                    <p className="animate-fade-in-up animation-delay-400" style={{ fontSize: 'clamp(14px, 1.3vw, 17px)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 480, marginBottom: 24 }}>
                        Dữ liệu đa nguồn bảo chứng độ tin cậy – AI dựa trên dữ liệu để phân tích đa chiều và gợi ý hành động.
                    </p>

                    <div className="animate-fade-in-up animation-delay-600" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <button id="hero-btn-login" onClick={handleLogin} style={{ background: '#00A8E8', color: '#0a0a0a', padding: '13px 32px', borderRadius: 8, fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.3s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#33BFEF'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,168,232,0.35)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#00A8E8'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >{isAuthenticated ? 'Vào Dashboard' : 'Đăng nhập'}</button>
                        {!isAuthenticated && (
                            <button id="hero-btn-register" onClick={handleRegister} style={{ color: '#fff', padding: '13px 32px', borderRadius: 8, fontSize: 15, fontWeight: 500, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', transition: 'all 0.3s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'transparent'; }}
                            >Đăng ký</button>
                        )}
                    </div>
                </div>

                {/* RIGHT — ReactFlow AI Insight Demo */}
                <div className="animate-fade-in-up animation-delay-400" style={{ height: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.4)' }}>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            nodeTypes={demoNodeTypes}
                            fitView
                            fitViewOptions={{ padding: 0.3 }}
                            proOptions={{ hideAttribution: true }}
                            panOnDrag={false}
                            zoomOnScroll={false}
                            zoomOnPinch={false}
                            zoomOnDoubleClick={false}
                            preventScrolling={false}
                            nodesDraggable={false}
                            nodesConnectable={false}
                            minZoom={0.7}
                            maxZoom={1.3}
                        >
                            <Background gap={24} size={1} color="rgba(255,255,255,0.03)" />
                        </ReactFlow>
                    </div>

                    {/* Description below ReactFlow */}
                    <div style={{ padding: '24px 0 0', textAlign: 'center' }}>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 16px' }}>
                            Hệ thống AI tổng hợp mọi tín hiệu quan trọng thành 6 lớp phân tích:
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                            {[
                                { label: 'Xu hướng', icon: TrendingUp, color: '#3b82f6' },
                                { label: 'Thanh khoản', icon: Droplets, color: '#06b6d4' },
                                { label: 'Dòng tiền lớn', icon: ArrowLeftRight, color: '#10b981' },
                                { label: 'Sự kiện', icon: Users, color: '#f59e0b' },
                                { label: 'Tin tức', icon: Newspaper, color: '#ec4899' },
                                { label: 'Hành động & Kịch bản', icon: Sparkles, color: '#00A8E8' },
                            ].map((l) => {
                                const Icon = l.icon;
                                return (
                                <span key={l.label} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    fontSize: 11, fontWeight: 600, padding: '6px 14px', borderRadius: 100,
                                    background: `${l.color}15`,
                                    color: l.color,
                                    border: `1px solid ${l.color}30`,
                                }}>
                                    <Icon size={12} />
                                    {l.label}
                                </span>
                            )})}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @media (max-width: 900px) {
                    .hero-grid { grid-template-columns: 1fr !important; gap: 24px !important; padding: 80px 20px 20px !important; }
                }
            `}</style>
        </section>
    );
}
