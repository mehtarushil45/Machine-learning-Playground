import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuthContext } from '../../providers/AuthContext';

export interface LoginPageProps {
  onSuccess?: () => void;
  onNavigate?: (tab: string) => void;
  defaultMode?: 'login' | 'register';
}

export function LoginPage({ onSuccess, onNavigate, defaultMode = 'login' }: LoginPageProps) {
  const { login, loginWithOAuth, isAuthenticated } = useAuthContext();
  const hasJustAuthenticated = useRef(false);

  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // OAuth Account Chooser Modal state
  const [oauthModalProvider, setOauthModalProvider] = useState<'google' | 'microsoft' | null>(null);
  const [oauthStep, setOauthStep] = useState<'select' | 'custom_email' | 'enter_password'>('select');
  const [selectedOAuthAccount, setSelectedOAuthAccount] = useState<{ name: string; email: string } | null>(null);
  const [customOAuthEmail, setCustomOAuthEmail] = useState('');
  const [oauthPassword, setOauthPassword] = useState('');
  const [showOAuthPassword, setShowOAuthPassword] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const googleAccounts = [
    { name: 'Rushil Mehta', email: 'mehtarushil45@gmail.com', avatarLetter: 'R', color: '#4285F4' },
    { name: 'ML Demo User', email: 'demo.engineer@gmail.com', avatarLetter: 'D', color: '#0F9D58' },
  ];

  const microsoftAccounts = [
    { name: 'Rushil Mehta', email: 'mehtarushil45@outlook.com', avatarLetter: 'R', color: '#0078D4' },
    { name: 'University Faculty Lab', email: 'faculty_test@university.edu', avatarLetter: 'F', color: '#5C2D91' },
  ];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Redirect to workspace only when an authentication action was completed
  useEffect(() => {
    if (isAuthenticated && hasJustAuthenticated.current) {
      if (onSuccess) onSuccess();
      else if (onNavigate) onNavigate('workspace');
    }
  }, [isAuthenticated, onSuccess, onNavigate]);

  /* ── Interactive Plexus + Low-Poly + Energy Ring Background Canvas ──── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      buildGeometry();
    };
    window.addEventListener('resize', handleResize);

    // ── Low-poly triangular mesh vertices ──
    interface Tri { ax: number; ay: number; bx: number; by: number; cx: number; cy: number; shade: number; }
    let tris: Tri[] = [];
    const buildGeometry = () => {
      tris = [];
      const cols = 14;
      const rows = 9;
      const cw = width / cols;
      const rh = height / rows;
      const jitter = () => (Math.random() - 0.5) * 0.55;
      const pts: { x: number; y: number }[][] = Array.from({ length: rows + 1 }, (_, r) =>
        Array.from({ length: cols + 1 }, (_, c) => ({
          x: c * cw + (c > 0 && c < cols ? cw * jitter() : 0),
          y: r * rh + (r > 0 && r < rows ? rh * jitter() : 0),
        }))
      );
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p0 = pts[r][c];
          const p1 = pts[r][c + 1];
          const p2 = pts[r + 1][c];
          const p3 = pts[r + 1][c + 1];
          tris.push({ ax: p0.x, ay: p0.y, bx: p1.x, by: p1.y, cx: p2.x, cy: p2.y, shade: Math.random() });
          tris.push({ ax: p1.x, ay: p1.y, bx: p3.x, by: p3.y, cx: p2.x, cy: p2.y, shade: Math.random() });
        }
      }
    };
    buildGeometry();

    // ── Plexus nodes ──
    const particleCount = Math.min(90, Math.floor((width * height) / 12000));
    const particles = Array.from({ length: particleCount }, (_, i) => {
      const isGold = i % 4 === 0;
      const edgeFactor = Math.random(); // 0 = center, 1 = edge
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.32,
        vy: (Math.random() - 0.5) * 0.32,
        radius: isGold ? Math.random() * 2.5 + 2.0 : Math.random() * 1.6 + 0.9,
        opacity: Math.random() * 0.55 + 0.45,
        isGold,
        edgeFactor,
      };
    });

    // ── Concentric energy rings state ──
    let ringPhase = 0;

    let mouseX = width / 2;
    let mouseY = height / 2;
    const handleMouseMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; };
    window.addEventListener('mousemove', handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;

      // ── 1. Base background: deep blue-to-desaturated-purple gradient ──
      const bgGrad = ctx.createRadialGradient(cx * 0.9, cy * 0.85, 0, cx, cy, Math.max(width, height) * 0.75);
      bgGrad.addColorStop(0,   '#0D1F42');
      bgGrad.addColorStop(0.45,'#0A1535');
      bgGrad.addColorStop(0.75,'#0D1228');
      bgGrad.addColorStop(1,   '#13102A');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Purple-tinted vignette at corners
      const cornerVig = ctx.createRadialGradient(cx, cy, height * 0.25, cx, cy, Math.max(width, height) * 0.9);
      cornerVig.addColorStop(0,   'rgba(13,19,42,0)');
      cornerVig.addColorStop(0.7, 'rgba(18,10,35,0.45)');
      cornerVig.addColorStop(1,   'rgba(10,5,25,0.78)');
      ctx.fillStyle = cornerVig;
      ctx.fillRect(0, 0, width, height);

      // ── 2. Low-poly geometric facets ──
      for (const t of tris) {
        const faceCx = (t.ax + t.bx + t.cx) / 3;
        const faceCy = (t.ay + t.by + t.cy) / 3;
        const distC = Math.hypot(faceCx - cx, faceCy - cy) / Math.max(width, height);
        // Faces near center: slightly brighter blue; edges: darker purple
        const baseAlpha = Math.max(0, 0.055 - distC * 0.07) + t.shade * 0.022;
        const r = Math.round(18 + t.shade * 12);
        const g = Math.round(28 + t.shade * 18);
        const b = Math.round(60 + t.shade * 40);
        ctx.beginPath();
        ctx.moveTo(t.ax, t.ay);
        ctx.lineTo(t.bx, t.by);
        ctx.lineTo(t.cx, t.cy);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${b},${baseAlpha.toFixed(3)})`;
        ctx.fill();
        // Facet edge lines
        ctx.strokeStyle = `rgba(80,120,200,${(baseAlpha * 0.9).toFixed(3)})`;
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }

      // ── 3. Concentric warm-gold energy rings behind card ──
      ringPhase += 0.007;
      const numRings = 5;
      for (let r = 0; r < numRings; r++) {
        const phase = ringPhase + (r / numRings) * Math.PI * 2;
        const baseRadius = 160 + r * 68;
        const pulse = Math.sin(phase) * 18;
        const ringR = baseRadius + pulse;
        const ringAlpha = (0.18 - r * 0.028) * (0.7 + Math.sin(phase) * 0.3);
        const grd = ctx.createRadialGradient(cx, cy, ringR - 22, cx, cy, ringR + 22);
        grd.addColorStop(0,   `rgba(255,185,30,0)`);
        grd.addColorStop(0.4, `rgba(255,185,30,${ringAlpha.toFixed(3)})`);
        grd.addColorStop(0.55,`rgba(255,210,80,${(ringAlpha * 1.4).toFixed(3)})`);
        grd.addColorStop(0.7, `rgba(255,185,30,${ringAlpha.toFixed(3)})`);
        grd.addColorStop(1,   `rgba(255,185,30,0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = grd;
        ctx.lineWidth = r === 0 ? 3.5 : r === 1 ? 2.5 : 1.8;
        ctx.shadowColor = 'rgba(255, 170, 20, 0.5)';
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ── 4. Plexus nodes and connecting lines ──
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Gentle drift toward mouse
        const dmx = mouseX - p.x;
        const dmy = mouseY - p.y;
        const dm = Math.sqrt(dmx * dmx + dmy * dmy);
        if (dm < 200 && dm > 0) { p.x += (dmx / dm) * 0.15; p.y += (dmy / dm) * 0.15; }

        // Distance from center affects blur/size (depth of field)
        const distFromC = Math.hypot(p.x - cx, p.y - cy);
        const depthScale = 0.6 + 0.4 * Math.min(1, distFromC / (Math.max(width, height) * 0.4));
        const displayRadius = p.radius * (p.isGold ? 1 : depthScale);
        const displayOpacity = p.opacity * (1.1 - depthScale * 0.25);

        // Ambient glow halo around each node
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, displayRadius * 6);
        if (p.isGold) {
          glow.addColorStop(0,   `rgba(255,195,60,${displayOpacity * 0.9})`);
          glow.addColorStop(0.3, `rgba(255,160,20,${displayOpacity * 0.35})`);
          glow.addColorStop(1,   'rgba(255,140,0,0)');
        } else {
          glow.addColorStop(0,   `rgba(110,185,255,${displayOpacity * 0.8})`);
          glow.addColorStop(0.3, `rgba(60,140,255,${displayOpacity * 0.25})`);
          glow.addColorStop(1,   'rgba(30,100,255,0)');
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, displayRadius * 6, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, displayRadius, 0, Math.PI * 2);
        ctx.fillStyle = p.isGold
          ? `rgba(255, 210, 80, ${displayOpacity})`
          : `rgba(140, 200, 255, ${displayOpacity})`;
        ctx.fill();

        // Connecting lines
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 170) {
            const alpha = (1 - dist / 170) * 0.32 * (1.1 - depthScale * 0.2);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            if (p.isGold || p2.isGold) {
              ctx.strokeStyle = `rgba(210, 165, 60, ${alpha * 0.85})`;
            } else {
              ctx.strokeStyle = `rgba(80, 150, 240, ${alpha})`;
            }
            ctx.lineWidth = 0.75;
            ctx.stroke();
          }
        }
      }

      // ── 5. Depth-of-field fog at extreme edges ──
      const edgeFog = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.28, cx, cy, Math.max(width, height) * 0.78);
      edgeFog.addColorStop(0, 'rgba(8,15,35,0)');
      edgeFog.addColorStop(1, 'rgba(8,12,28,0.55)');
      ctx.fillStyle = edgeFog;
      ctx.fillRect(0, 0, width, height);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  /* ── Form Submit Handler ─────────────────────────────────────────── */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMessage(null);
      setInfoMessage(null);

      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setErrorMessage('Please enter your email address.');
        return;
      }
      if (!password) {
        setErrorMessage('Please enter your password.');
        return;
      }

      setIsSubmitting(true);

      try {
        if (mode === 'login') {
          // FastAPI OAuth2PasswordRequestForm expects username
          await login({
            username: trimmedEmail,
            password: password,
          });

          if (rememberMe) {
            localStorage.setItem('ml_last_login_email', trimmedEmail);
          } else {
            localStorage.removeItem('ml_last_login_email');
          }

          hasJustAuthenticated.current = true;
          if (onSuccess) onSuccess();
          else if (onNavigate) onNavigate('workspace');
        } else {
          // Register Flow
          const regRes = await fetch('/api/v1/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: trimmedEmail,
              password: password,
              full_name: fullName.trim() || undefined,
            }),
          });

          if (!regRes.ok) {
            const errData = await regRes.json().catch(() => ({}));
            throw new Error(errData.detail || `Registration failed (${regRes.status})`);
          }

          // Auto-login after successful registration
          try {
            await login({
              username: trimmedEmail,
              password: password,
            });
            hasJustAuthenticated.current = true;
            if (onSuccess) onSuccess();
            else if (onNavigate) onNavigate('workspace');
          } catch {
            setMode('login');
            setInfoMessage('Account created! Please sign in with your password.');
          }
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, fullName, mode, rememberMe, login, onSuccess, onNavigate]
  );

  // Quick Demo fill
  const fillDemoAccount = () => {
    setEmail('faculty_test@university.edu');
    setPassword('DemoPassword123!');
    setErrorMessage(null);
  };

  // OAuth Account Selection Handlers
  const handleOpenGoogleOAuth = () => {
    setOauthModalProvider('google');
    setOauthStep('select');
    setSelectedOAuthAccount(null);
    setCustomOAuthEmail('');
    setOauthPassword('');
    setOauthError(null);
  };

  const handleOpenMicrosoftOAuth = () => {
    setOauthModalProvider('microsoft');
    setOauthStep('select');
    setSelectedOAuthAccount(null);
    setCustomOAuthEmail('');
    setOauthPassword('');
    setOauthError(null);
  };

  const handleSelectOAuthAccount = (acc: { name: string; email: string }) => {
    setSelectedOAuthAccount(acc);
    setOauthStep('enter_password');
    setOauthPassword('');
    setOauthError(null);
  };

  const handleCustomEmailNext = () => {
    const trimmed = customOAuthEmail.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setOauthError('Please enter a valid email address.');
      return;
    }
    setSelectedOAuthAccount({
      name: trimmed.split('@')[0],
      email: trimmed,
    });
    setOauthStep('enter_password');
    setOauthPassword('');
    setOauthError(null);
  };

  const handleCompleteOAuthLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedOAuthAccount || !oauthModalProvider) return;

    setOauthSubmitting(true);
    setOauthError(null);

    try {
      await loginWithOAuth(oauthModalProvider, {
        email: selectedOAuthAccount.email,
        full_name: selectedOAuthAccount.name,
      });
      hasJustAuthenticated.current = true;
      setOauthModalProvider(null);
      if (onSuccess) onSuccess();
      else if (onNavigate) onNavigate('workspace');
    } catch (err: any) {
      setOauthError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setOauthSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        width: '100vw',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Background Canvas: Neural Constellation & Space Web ── */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
        }}
      />

      {/* ── Background Layer: Blurred Enterprise Charts & Wireframe Depth ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 8vw',
          opacity: 0.18,
          filter: 'blur(3px)',
        }}
      >
        {/* Left background chart card */}
        <div
          style={{
            width: 280,
            height: 220,
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(30,41,59,0.7), rgba(15,23,42,0.4))',
            border: '1px solid rgba(148,163,184,0.2)',
            padding: 16,
          }}
        >
          <div style={{ height: 12, width: '40%', background: 'rgba(255,255,255,0.2)', borderRadius: 4, marginBottom: 16 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
            {[35, 60, 45, 80, 50, 95, 75].map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${h}%`, background: 'rgba(96,165,250,0.4)', borderRadius: 3 }} />
            ))}
          </div>
        </div>

        {/* Right background stats card */}
        <div
          style={{
            width: 260,
            height: 200,
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(30,41,59,0.7), rgba(15,23,42,0.4))',
            border: '1px solid rgba(148,163,184,0.2)',
            padding: 16,
          }}
        >
          <div style={{ height: 12, width: '50%', background: 'rgba(255,255,255,0.2)', borderRadius: 4, marginBottom: 12 }} />
          <div style={{ height: 28, width: '70%', background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 16 }} />
          <div style={{ height: 10, width: '90%', background: 'rgba(255,255,255,0.08)', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 10, width: '65%', background: 'rgba(255,255,255,0.08)', borderRadius: 4 }} />
        </div>
      </div>

      {/* ── Warm Golden Central Glow ── */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 700,
          height: 620,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(230, 165, 20, 0.22) 0%, rgba(200, 130, 10, 0.12) 30%, rgba(140, 90, 5, 0.04) 58%, transparent 72%)',
          filter: 'blur(48px)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* ── 4-Pointed Star Sparkle — Bottom Right ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 64,
          right: 90,
          zIndex: 3,
          pointerEvents: 'none',
          opacity: 0.62,
        }}
      >
        <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
          <defs>
            <radialGradient id="sg1" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFBE8" stopOpacity="1" />
              <stop offset="100%" stopColor="#F0C040" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Vertical petal */}
          <ellipse cx="34" cy="34" rx="3.5" ry="30" fill="url(#sg1)" />
          {/* Horizontal petal */}
          <ellipse cx="34" cy="34" rx="30" ry="3.5" fill="url(#sg1)" />
          {/* Diagonal petals (smaller) */}
          <ellipse cx="34" cy="34" rx="2" ry="18" transform="rotate(45 34 34)" fill="url(#sg1)" opacity="0.45" />
          <ellipse cx="34" cy="34" rx="2" ry="18" transform="rotate(-45 34 34)" fill="url(#sg1)" opacity="0.45" />
        </svg>
      </div>

      {/* ── Top Navigation Bar: Back to Platform ── */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (onNavigate) onNavigate('workspace');
            else if (typeof window !== 'undefined') window.location.hash = '';
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            color: '#CBD5E1',
            fontSize: 12,
            fontWeight: 500,
            padding: '6px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)';
            e.currentTarget.style.color = '#FFFFFF';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.color = '#CBD5E1';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
          }}
        >
          <span>← Back to Platform</span>
        </button>
      </div>

      {/* ── Main Container ── */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          maxWidth: 420,
          padding: '0 20px',
        }}
      >
        {/* ── Top Header Logo: ML Platform ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 20,
            userSelect: 'none',
          }}
        >
          {/* Interlocking geometric ribbon icon matching reference */}
          <div
            style={{
              width: 52,
              height: 52,
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 48 48" fill="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="mlNexusGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="50%" stopColor="#818CF8" />
                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
                <linearGradient id="mlNexusGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#60A5FA" />
                  <stop offset="100%" stopColor="#C084FC" />
                </linearGradient>
              </defs>
              <path
                d="M14 18 C14 12, 22 10, 26 14 L34 22 C38 26, 38 34, 32 38 C26 42, 18 40, 14 34 L12 31"
                stroke="url(#mlNexusGrad1)"
                strokeWidth="4.2"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M34 30 C34 36, 26 38, 22 34 L14 26 C10 22, 10 14, 16 10 C22 6, 30 8, 34 14 L36 17"
                stroke="url(#mlNexusGrad2)"
                strokeWidth="4.2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>

          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
              margin: 0,
              textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            ML Platform
          </h1>
        </div>

        {/* ── Central Crisp White Floating Card ── */}
        <div
          style={{
            width: '100%',
            background: '#FFFFFF',
            borderRadius: 20,
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.65), 0 0 35px rgba(201, 162, 75, 0.18)',
            padding: '30px 28px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <h2
              style={{
                fontSize: 19,
                fontWeight: 800,
                color: '#1E293B',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              {mode === 'login' ? 'Sign In to Your Account' : 'Create Your Account'}
            </h2>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#DC2626',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Info Banner */}
          {infoMessage && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                color: '#16A34A',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 style={{ width: 15, height: 15, flexShrink: 0 }} />
              <span>{infoMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Optional Full Name in Register mode */}
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="fullName"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#475569',
                    marginBottom: 5,
                  }}
                >
                  Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    disabled={isSubmitting}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      background: '#F8FAFC',
                      fontSize: 13,
                      color: '#1E293B',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 150ms ease, box-shadow 150ms ease',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#2563EB';
                      e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.12)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#CBD5E1';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <User
                    style={{
                      position: 'absolute',
                      left: 11,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 16,
                      height: 16,
                      color: '#94A3B8',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Email Address */}
            <div>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: 5,
                }}
              >
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="username"
                  required
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    fontSize: 13,
                    color: '#1E293B',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#2563EB';
                    e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.12)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#CBD5E1';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <User
                  style={{
                    position: 'absolute',
                    left: 11,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 16,
                    height: 16,
                    color: '#94A3B8',
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: 5,
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '10px 36px 10px 36px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    fontSize: 13,
                    color: '#1E293B',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#2563EB';
                    e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.12)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#CBD5E1';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <Lock
                  style={{
                    position: 'absolute',
                    left: 11,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 16,
                    height: 16,
                    color: '#94A3B8',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                marginTop: 2,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#64748B',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    accentColor: '#2563EB',
                    borderRadius: 4,
                    width: 14,
                    height: 14,
                    cursor: 'pointer',
                  }}
                />
                <span>Remember me</span>
              </label>

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setInfoMessage('Password reset link has been dispatched to your administrator.');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 12,
                  }}
                >
                  Forgot Password?
                </button>
              )}
            </div>

            {/* Primary Sign In Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                marginTop: 6,
                width: '100%',
                padding: '11px',
                borderRadius: 8,
                background: '#2563EB',
                color: '#FFFFFF',
                fontSize: 13.5,
                fontWeight: 700,
                border: 'none',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
                transition: 'background 150ms ease, transform 100ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = '#1D4ED8';
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = '#2563EB';
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                  <span>{mode === 'login' ? 'Signing In...' : 'Creating Account...'}</span>
                </>
              ) : (
                <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              )}
            </button>
          </form>

          {/* Social Sign-in Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              margin: '20px 0 14px 0',
              gap: 10,
            }}
          >
            <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
            <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>Or sign in with:</span>
            <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
          </div>

          {/* Social Login Buttons: Google, Microsoft */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 18,
            }}
          >
            {/* Google */}
            <button
              type="button"
              onClick={handleOpenGoogleOAuth}
              title="Sign in with Google"
              style={{
                flex: 1,
                height: 42,
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                transition: 'all 150ms ease',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.background = '#F8FAFC';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Google</span>
            </button>

            {/* Microsoft */}
            <button
              type="button"
              onClick={handleOpenMicrosoftOAuth}
              title="Sign in with Microsoft"
              style={{
                flex: 1,
                height: 42,
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                transition: 'all 150ms ease',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.background = '#F8FAFC';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <svg width="17" height="17" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              <span>Microsoft</span>
            </button>
          </div>

          {/* Toggle between Login and Register */}
          <div style={{ textAlign: 'center', fontSize: 12, color: '#64748B' }}>
            {mode === 'login' ? (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Sign Up
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Sign In
                </button>
              </span>
            )}
          </div>
        </div>

        {/* ── Demo Quick Fill Helper ── */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={fillDemoAccount}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 6,
              padding: '4px 10px',
              color: '#94A3B8',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#FFFFFF';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94A3B8';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <span>Fill Demo Credentials</span>
            <ArrowRight style={{ width: 11, height: 11 }} />
          </button>
        </div>

        {/* ── Page Footer ── */}
        <footer
          style={{
            marginTop: 26,
            fontSize: 11.5,
            color: '#94A3B8',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            userSelect: 'none',
          }}
        >
          <span style={{ cursor: 'pointer' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')} onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}>
            Privacy Policy
          </span>
          <span style={{ cursor: 'pointer' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')} onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}>
            Terms of Service
          </span>
          <span>© 2026 ML Platform Inc.</span>
        </footer>
      </div>

      {/* ── OAuth Account Chooser Modal (Google & Microsoft) ── */}
      {oauthModalProvider && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={oauthModalProvider === 'google' ? 'Sign in with Google' : 'Sign in with Microsoft'}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(5, 7, 15, 0.75)',
            backdropFilter: 'blur(8px)',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOauthModalProvider(null);
            }
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 400,
              background: '#FFFFFF',
              borderRadius: 16,
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0,0,0,0.06)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Top Close Button */}
            <button
              type="button"
              onClick={() => setOauthModalProvider(null)}
              title="Close dialog"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                padding: 4,
                borderRadius: '50%',
              }}
            >
              ✕
            </button>

            {/* Modal Header */}
            <div style={{ padding: '28px 24px 16px 24px', textAlign: 'center' }}>
              {oauthModalProvider === 'google' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" style={{ marginBottom: 12 }}>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: '#1E293B' }}>
                    Sign in with Google
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                    Choose an account to continue to <strong style={{ color: '#0F172A' }}>ML Platform</strong>
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <svg width="28" height="28" viewBox="0 0 21 21" style={{ marginBottom: 12 }}>
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: '#1E293B' }}>
                    Pick an account
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                    to continue to <strong style={{ color: '#0F172A' }}>ML Platform</strong>
                  </p>
                </div>
              )}
            </div>

            {/* Error Banner */}
            {oauthError && (
              <div
                style={{
                  margin: '0 24px 12px 24px',
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#DC2626',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                <span>{oauthError}</span>
              </div>
            )}

            {/* Modal Body: STEP 1 - Account Selection */}
            {oauthStep === 'select' && (
              <div style={{ padding: '0 12px 24px 12px' }}>
                <div style={{ borderTop: '1px solid #F1F5F9' }}>
                  {(oauthModalProvider === 'google' ? googleAccounts : microsoftAccounts).map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handleSelectOAuthAccount(acc)}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        background: 'none',
                        border: 'none',
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: acc.color,
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 15,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {acc.avatarLetter}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {acc.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748B' }}>
                          {acc.email}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: '#059669',
                          background: '#ECFDF5',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontWeight: 600,
                        }}
                      >
                        Signed in
                      </div>
                    </button>
                  ))}

                  {/* Use another account row */}
                  <button
                    type="button"
                    onClick={() => {
                      setOauthStep('custom_email');
                      setCustomOAuthEmail('');
                      setOauthError(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 120ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: '#E2E8F0',
                        color: '#64748B',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <User style={{ width: 18, height: 18 }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>
                      Use another account
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Modal Body: STEP 2 - Custom Email Input */}
            {oauthStep === 'custom_email' && (
              <div style={{ padding: '0 24px 24px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="oauth-custom-email-input" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                    Email or phone
                  </label>
                  <input
                    id="oauth-custom-email-input"
                    type="email"
                    autoFocus
                    value={customOAuthEmail}
                    onChange={(e) => setCustomOAuthEmail(e.target.value)}
                    placeholder={oauthModalProvider === 'google' ? 'you@gmail.com' : 'you@outlook.com'}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      fontSize: 13.5,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCustomEmailNext();
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setOauthStep('select')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    ← Back to accounts
                  </button>
                  <button
                    type="button"
                    onClick={handleCustomEmailNext}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 6,
                      background: oauthModalProvider === 'google' ? '#1A73E8' : '#0067B8',
                      color: '#FFFFFF',
                      fontSize: 13,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Modal Body: STEP 3 - Password Entry */}
            {oauthStep === 'enter_password' && selectedOAuthAccount && (
              <form onSubmit={handleCompleteOAuthLogin} style={{ padding: '0 24px 24px 24px' }}>
                {/* Account Chip */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 20,
                    border: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: '#3B82F6',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {selectedOAuthAccount.name[0]?.toUpperCase() || 'U'}
                    </div>
                    <span style={{ fontSize: 12, color: '#334155', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedOAuthAccount.email}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOauthStep('select')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Change
                  </button>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label htmlFor="oauth-password-input" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                    Enter your password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="oauth-password-input"
                      type={showOAuthPassword ? 'text' : 'password'}
                      autoFocus
                      value={oauthPassword}
                      onChange={(e) => setOauthPassword(e.target.value)}
                      placeholder="••••••••••••"
                      style={{
                        width: '100%',
                        padding: '10px 36px 10px 12px',
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        fontSize: 13.5,
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOAuthPassword((p) => !p)}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        padding: 2,
                      }}
                    >
                      {showOAuthPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setOauthPassword('Password123!');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>

                  <button
                    type="submit"
                    disabled={oauthSubmitting}
                    style={{
                      padding: '9px 22px',
                      borderRadius: 6,
                      background: oauthModalProvider === 'google' ? '#1A73E8' : '#0067B8',
                      color: '#FFFFFF',
                      fontSize: 13,
                      fontWeight: 600,
                      border: 'none',
                      cursor: oauthSubmitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {oauthSubmitting ? (
                      <>
                        <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <span>Next</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
