import type { ExpedientItem } from '../../api/expedients'

/**
 * Pantalla principal de Proyectos. Un "proyecto" es un expediente; la lista ya
 * viene filtrada por rol desde el backend (admin ve todos; el resto solo aquellos
 * en los que participa). Al abrir un proyecto se entra a su detalle/pipeline.
 */
export default function ProjectsView({
  expedients,
  isAdmin,
  onOpenProject,
  onCreateProject,
}: {
  expedients: ExpedientItem[]
  isAdmin: boolean
  onOpenProject: (expedientId: string) => void
  onCreateProject: () => void
}) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px 28px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
          {isAdmin
            ? 'Como administrador ves todos los proyectos del sistema.'
            : 'Ves los proyectos en los que participas.'}
        </div>
        <button
          onClick={onCreateProject}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            fontWeight: 600,
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            cursor: 'pointer',
          }}
        >
          + Nuevo proyecto
        </button>
      </div>

      {expedients.length === 0 ? (
        <div
          style={{
            border: '1px dashed var(--border)',
            borderRadius: 10,
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--fg-muted)',
            fontSize: 13,
          }}
        >
          {isAdmin
            ? 'Todavía no hay proyectos. Crea el primero para empezar.'
            : 'No participas en ningún proyecto todavía.'}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {expedients.map((exp) => (
            <button
              key={exp.id}
              onClick={() => onOpenProject(exp.id)}
              className="edms-nav-item"
              style={{
                textAlign: 'left',
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '16px 16px 14px',
                cursor: 'pointer',
                color: 'var(--fg)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minHeight: 120,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    flexShrink: 0,
                    background: 'color-mix(in oklch, var(--accent) 18%, var(--bg-elev-2))',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {exp.name.slice(0, 1).toUpperCase()}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {exp.name}
                </span>
              </div>

              {exp.code && (
                <span
                  style={{
                    alignSelf: 'flex-start',
                    fontSize: 10.5,
                    padding: '2px 7px',
                    borderRadius: 6,
                    background: 'var(--bg-active)',
                    color: 'var(--fg-muted)',
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  }}
                >
                  {exp.code}
                </span>
              )}

              {exp.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--fg-muted)',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {exp.description}
                </div>
              )}

              <div
                style={{
                  marginTop: 'auto',
                  fontSize: 11.5,
                  color: 'var(--fg-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {typeof exp.document_count === 'number'
                  ? `${exp.document_count} documento${exp.document_count === 1 ? '' : 's'}`
                  : 'Abrir proyecto'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
