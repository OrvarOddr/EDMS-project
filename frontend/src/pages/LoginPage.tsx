import { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'

const features = [
  { label: 'Control total de versiones', desc: 'Historial completo con restauración en un clic.' },
  { label: 'Colaboración en tiempo real', desc: 'Comparte, comenta y aprueba con tu equipo.' },
  { label: 'Flujos de aprobación', desc: 'Desde el borrador hasta la firma, sin salir de Muninn.' },
  { label: 'Búsqueda semántica', desc: 'Encuentra cualquier documento por contenido, autor o etiqueta.' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const detail = typeof error.response?.data?.detail === 'string' ? error.response.data.detail : null
        if (detail) {
          setError(detail)
          return
        }
      }
      setError('Credenciales incorrectas. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg)',
      color: 'var(--fg)',
      fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
    }}>
      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', inset: '-10%',
          backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '48px 48px', opacity: 0.6,
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 60% 50% at 50% 52%, oklch(0.35 0.1 255 / 0.22) 0%, transparent 70%)',
        }} />
      </div>

      {/* Left panel */}
      <div style={{
        position: 'relative', zIndex: 1,
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '40px 52px',
        borderRight: '1px solid var(--border)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={logo} alt="Muninn" style={{ height: 100, width: 'auto', objectFit: 'contain', filter: 'invert(1)', opacity: 0.9 }} />
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--fg)' }}>Muninn</span>
        </div>

        {/* Hero */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 440 }}>
          <h2 style={{
            fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 600,
            lineHeight: 1.15, letterSpacing: '-0.025em',
            marginBottom: 20, textWrap: 'pretty' as never,
          }}>
            Gestiona cada documento con{' '}
            <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>precisión absoluta.</em>
          </h2>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {features.map((f) => (
              <li key={f.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.4 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  background: 'var(--bg-elev-2)', border: '1px solid var(--border-strong)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--accent)',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
                <div><strong style={{ color: 'var(--fg)', fontWeight: 500 }}>{f.label}</strong> — {f.desc}</div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <footer style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>
          © 2026 UBB · GPS Documental
        </footer>
      </div>

      {/* Right panel */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: 640, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '60px 72px',
      }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 }}>
              Bienvenido de nuevo
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--fg-muted)' }}>
              Ingresa tus credenciales para continuar
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 12px', borderRadius: 7, marginBottom: 14,
              background: 'oklch(0.7 0.17 25 / 0.1)', border: '1px solid oklch(0.7 0.17 25 / 0.3)',
              color: 'var(--danger)', fontSize: 12.5,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.3L2 20h20L13.7 3.3a2 2 0 0 0-3.4 0zM12 9v5M12 17.5v.5"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 6 }}>
                Correo electrónico
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="usuario@dominio.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%', height: 48,
                    background: 'var(--bg-elev)', border: '1px solid var(--border-strong)',
                    borderRadius: 8, padding: '0 40px 0 12px',
                    fontSize: 15, color: 'var(--fg)', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-soft)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none' }}
                />
                <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-dim)', pointerEvents: 'none' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 7L2 7"/></svg>
                </span>
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 6 }}>
                Contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%', height: 48,
                    background: 'var(--bg-elev)', border: '1px solid var(--border-strong)',
                    borderRadius: 8, padding: '0 40px 0 12px',
                    fontSize: 15, color: 'var(--fg)', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-soft)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}
                >
                  {showPwd
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a19 19 0 0 1 5.1-6.1M9.9 4.2A10 10 0 0 1 12 4c7 0 11 8 11 8a19.1 19.1 0 0 1-2.3 3.6M3 3l18 18"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>
                  }
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', height: 48, borderRadius: 8,
                background: 'var(--accent)', color: 'var(--accent-fg)',
                fontSize: 13.5, fontWeight: 600, letterSpacing: '0.01em',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.55 : 1,
                boxShadow: '0 4px 14px oklch(0.72 0.13 255 / 0.3)',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Verificando…' : 'Iniciar sesión'}
            </button>
          </form>

          <p style={{ fontSize: 11.5, color: 'var(--fg-dim)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
            Acceso protegido. Solo usuarios registrados por el administrador.
          </p>
        </div>
      </div>
    </div>
  )
}
