import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuthContext } from '../../providers/AuthContext';

export interface LoginPageProps {
  onSuccess?: () => void;
  onNavigate?: (tab: string) => void;
  defaultMode?: 'login' | 'register';
}

export function LoginPage({ onSuccess, onNavigate, defaultMode = 'login' }: LoginPageProps) {
  const { login, isAuthenticated } = useAuthContext();

  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // If already authenticated, redirect to workspace
  useEffect(() => {
    if (isAuthenticated) {
      if (onSuccess) onSuccess();
      else if (onNavigate) onNavigate('workspace');
    }
  }, [isAuthenticated, onSuccess, onNavigate]);

  /* ── Interactive Neural Constellation Background Canvas ──────────── */
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
    };
    window.addEventListener('resize', handleResize);

    // Particle nodes
    const particleCount = Math.min(65, Math.floor((width * height) / 18000));
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      radius: Math.random() * 2 + 1.2,
      opacity: Math.random() * 0.6 + 0.3,
    }));

    let mouseX = width / 2;
    let mouseY = height / 2;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Deep radial background gradient
      const bgGrad = ctx.createRadialGradient(
        width / 2, height / 2, 50,
        width / 2, height / 2, Math.max(width, height) * 0.8
      );
      bgGrad.addColorStop(0, '#10142A');
      bgGrad.addColorStop(0.5, '#0C0F22');
      bgGrad.addColorStop(1, '#070914');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw and update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Subtle gentle drift toward mouse
        const dxMouse = mouseX - p.x;
        const dyMouse = mouseY - p.y;
        const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
        if (distMouse < 180) {
          p.x += (dxMouse / distMouse) * 0.2;
          p.y += (dyMouse / distMouse) * 0.2;
        }

        // Draw particle dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 180, 255, ${p.opacity})`;
        ctx.shadowColor = '#00D4FF';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Connect nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(75, 140, 240, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

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

      {/* ── Warm Golden Radial Halo Backlight Behind Center Card ── */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(234, 179, 8, 0.24) 0%, rgba(201, 162, 75, 0.12) 40%, rgba(11, 9, 18, 0) 70%)',
          filter: 'blur(35px)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

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

          {/* Social Login Buttons: Google, Microsoft, GitHub */}
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
              onClick={fillDemoAccount}
              title="Sign in with Google (Click to fill demo account)"
              style={{
                width: 44,
                height: 40,
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.background = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.background = '#FFFFFF';
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
            </button>

            {/* Microsoft */}
            <button
              type="button"
              onClick={fillDemoAccount}
              title="Sign in with Microsoft (Click to fill demo account)"
              style={{
                width: 44,
                height: 40,
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.background = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.background = '#FFFFFF';
              }}
            >
              <svg width="17" height="17" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
            </button>

            {/* GitHub */}
            <button
              type="button"
              onClick={fillDemoAccount}
              title="Sign in with GitHub (Click to fill demo account)"
              style={{
                width: 44,
                height: 40,
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.background = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.background = '#FFFFFF';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#181717">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
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
    </div>
  );
}
