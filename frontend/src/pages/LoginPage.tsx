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

  const shellStyle = {
    background: 'var(--bg)',
    color: 'var(--fg)',
    fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
  }

  const inputStyle = {
    background: 'var(--bg-elev)',
    borderColor: 'var(--border-strong)',
    color: 'var(--fg)',
  }

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden" style={shellStyle}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-[-10%] opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 52%, oklch(0.35 0.1 255 / 0.22) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -left-24 top-10 h-56 w-56 rounded-full blur-3xl sm:h-72 sm:w-72"
          style={{ background: 'oklch(0.52 0.1 210 / 0.16)' }}
        />
        <div
          className="absolute -right-20 bottom-0 h-64 w-64 rounded-full blur-3xl sm:h-80 sm:w-80"
          style={{ background: 'oklch(0.72 0.13 255 / 0.16)' }}
        />
      </div>

      <div className="relative z-10 grid min-h-[100dvh] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <section
          className="flex flex-col justify-between gap-10 border-b px-5 py-6 sm:px-8 sm:py-8 lg:min-h-[100dvh] lg:border-b-0 lg:border-r lg:px-12 lg:py-10 xl:px-16"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Muninn"
              className="h-12 w-auto object-contain opacity-90 invert sm:h-16 lg:h-20"
            />
            <span
              className="text-2xl font-bold tracking-[-0.05em] sm:text-3xl"
              style={{ color: 'var(--fg)' }}
            >
              Muninn
            </span>
          </div>

          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center">
            <div className="max-w-xl">
              <div
                className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] sm:text-xs"
                style={{
                  borderColor: 'var(--border-strong)',
                  background: 'rgba(20, 22, 27, 0.72)',
                  color: 'var(--fg-dim)',
                }}
              >
                Sistema de gestion documental
              </div>
              <h2
                className="max-w-xl text-[clamp(2rem,7vw,4.35rem)] font-semibold leading-[0.98] tracking-[-0.06em]"
                style={{ color: 'var(--fg)' }}
              >
                Gestiona cada documento con{' '}
                <span style={{ color: 'var(--accent)' }}>precision absoluta.</span>
              </h2>
              <p
                className="mt-4 max-w-lg text-sm leading-6 sm:text-base"
                style={{ color: 'var(--fg-muted)' }}
              >
                Versionado, aprobaciones y trazabilidad en un espacio pensado para equipos que trabajan con procesos reales.
              </p>
            </div>

            <ul className="mt-8 grid gap-3 sm:grid-cols-2 xl:max-w-3xl">
              {features.map((feature) => (
                <li
                  key={feature.label}
                  className="rounded-2xl border p-4 backdrop-blur-sm sm:p-5"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'rgba(20, 22, 27, 0.64)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border"
                      style={{
                        background: 'var(--bg-elev-2)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--accent)',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold sm:text-[15px]" style={{ color: 'var(--fg)' }}>
                        {feature.label}
                      </p>
                      <p className="mt-1 text-sm leading-5" style={{ color: 'var(--fg-muted)' }}>
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <footer className="text-xs leading-5 sm:text-[13px]" style={{ color: 'var(--fg-dim)' }}>
            © 2026 UBB · GPS Documental
          </footer>
        </section>

        <section className="flex items-center justify-center px-4 py-6 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
          <div
            className="w-full max-w-[34rem] rounded-[28px] border p-5 shadow-2xl sm:p-8"
            style={{
              background: 'rgba(20, 22, 27, 0.92)',
              borderColor: 'var(--border-strong)',
              boxShadow: '0 32px 80px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div className="mb-7">
              <p
                className="mb-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--fg-dim)',
                }}
              >
                Acceso protegido
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-[2rem]">
                Bienvenido de nuevo
              </h1>
              <p className="mt-2 text-sm leading-6 sm:text-[15px]" style={{ color: 'var(--fg-muted)' }}>
                Ingresa tus credenciales para continuar con el flujo documental.
              </p>
            </div>

            {error && (
              <div
                className="mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-5"
                style={{
                  background: 'oklch(0.7 0.17 25 / 0.1)',
                  borderColor: 'oklch(0.7 0.17 25 / 0.3)',
                  color: 'var(--danger)',
                }}
              >
                <svg
                  className="mt-0.5 shrink-0"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.3 3.3L2 20h20L13.7 3.3a2 2 0 0 0-3.4 0zM12 9v5M12 17.5v.5" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  Correo electrónico
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="usuario@dominio.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 w-full rounded-xl border px-4 pr-11 text-[15px] outline-none transition focus:border-transparent focus:ring-2"
                    style={{
                      ...inputStyle,
                      boxShadow: 'none',
                    }}
                  />
                  <span
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--fg-dim)' }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 7L2 7" />
                    </svg>
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 w-full rounded-xl border px-4 pr-12 text-[15px] outline-none transition focus:border-transparent focus:ring-2"
                    style={{
                      ...inputStyle,
                      boxShadow: 'none',
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg p-2 transition"
                    style={{ color: 'var(--fg-dim)' }}
                  >
                    {showPwd ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a19 19 0 0 1 5.1-6.1M9.9 4.2A10 10 0 0 1 12 4c7 0 11 8 11 8a19.1 19.1 0 0 1-2.3 3.6M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 h-12 w-full rounded-xl border-0 text-sm font-semibold tracking-[0.01em] transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--accent-fg)',
                  boxShadow: '0 10px 30px oklch(0.72 0.13 255 / 0.26)',
                }}
              >
                {loading ? 'Verificando…' : 'Iniciar sesión'}
              </button>
            </form>

            <div
              className="mt-5 rounded-2xl border px-4 py-3 text-sm leading-6"
              style={{
                borderColor: 'var(--border)',
                background: 'rgba(14, 15, 18, 0.72)',
                color: 'var(--fg-dim)',
              }}
            >
              Solo usuarios registrados por el administrador pueden acceder al sistema.
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
