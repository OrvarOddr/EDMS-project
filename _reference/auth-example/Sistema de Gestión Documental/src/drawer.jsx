/* Detail drawer + context menu + notifications panel */
const { useEffect: useEffectDr } = React;

function DetailDrawer({ doc, onClose, onAction }) {
  useEffectDr(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  if (!doc) return null;
  const owner = window.APP_DATA.users.find(u => u.id === doc.owner);
  const kind = window.APP_DATA.kinds[doc.kind];

  return (
    <aside style={{
      width: 360, height: '100%', flexShrink: 0,
      background: 'var(--bg-elev)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', animation: 'slide-in 0.18s ease-out',
    }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
        <KindBadge kind={doc.kind} />
        <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-muted)' }}>Detalles</span>
        <button onClick={() => onAction('fullscreen', doc.id)} className="nav-item" title="Abrir completo" style={{ width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)' }}>
          <Icon.Eye size={14} />
        </button>
        <button onClick={onClose} className="nav-item" style={{ width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)' }}>
          <Icon.Close size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Preview */}
        <div style={{ padding: '14px 14px 0' }}>
          <div style={{
            aspectRatio: '8.5 / 11', borderRadius: 8, overflow: 'hidden',
            background: `linear-gradient(135deg, color-mix(in oklch, ${kind.tone} 16%, var(--bg-elev-2)), var(--bg-elev-2))`,
            border: '1px solid var(--border)', position: 'relative', padding: 18,
          }}>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}>
              <defs>
                <pattern id={`stripes-dr-${doc.id}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="8" stroke={kind.tone} strokeWidth="1" opacity="0.3" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#stripes-dr-${doc.id})`} />
            </svg>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ height: 8, width: '75%', background: 'color-mix(in oklch, currentColor 35%, transparent)', borderRadius: 2, color: kind.tone }} />
              <div style={{ height: 4, width: '55%', background: 'color-mix(in oklch, currentColor 25%, transparent)', borderRadius: 1, color: kind.tone, marginBottom: 10 }} />
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ height: 4, width: `${85 - (i % 3) * 10}%`, background: 'color-mix(in oklch, currentColor 16%, transparent)', borderRadius: 1, color: kind.tone }} />
              ))}
            </div>
            <div style={{ position: 'absolute', bottom: 10, right: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: kind.tone, opacity: 0.6 }}>
              Vista previa · {doc.pages ? `pág. 1 de ${doc.pages}` : doc.rows ? `${doc.rows.toLocaleString('es-ES')} filas` : '—'}
            </div>
          </div>
        </div>

        {/* Title + actions */}
        <div style={{ padding: '14px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', marginBottom: 6, lineHeight: 1.3 }}>{doc.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <DocsUI.StatusPill status={doc.status} />
            <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>·</span>
            <span style={{ color: 'var(--fg-muted)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>v{doc.version}</span>
            <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>·</span>
            <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{doc.modified}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            <button style={btnStylePrimary}>
              <Icon.Eye size={13} /> Abrir
            </button>
            <button style={btnStyleGhost}>
              <Icon.Share size={13} /> Compartir
            </button>
            <button style={btnStyleGhost}>
              <Icon.Download size={13} /> Descargar
            </button>
            <button style={btnStyleGhost}>
              <Icon.Signature size={13} /> Firmar
            </button>
          </div>

          {/* Metadatos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Autor',        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><DocsUI.OwnerAvatar userId={doc.owner} size={18} /><span>{owner?.name}</span></div>],
              ['Carpeta',      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon.Folder size={12} style={{ color: 'var(--fg-dim)' }} />{doc.folder}</span>],
              ['Tamaño',       doc.size],
              ['Tipo',         kind.label],
              [doc.pages ? 'Páginas' : 'Filas', doc.pages ?? doc.rows?.toLocaleString('es-ES')],
              ['Compartido',   doc.shared.length > 0 ? <DocsUI.AvatarStack ids={doc.shared} max={5} /> : <span style={{ color: 'var(--fg-dim)' }}>Solo tú</span>],
              ['Etiquetas',    doc.tags.length > 0 ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{doc.tags.map(t => <DocsUI.TagChip key={t} id={t} />)}</div> : <span style={{ color: 'var(--fg-dim)' }}>—</span>],
            ].map(([label, value], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: 12.5 }}>
                <span style={{ width: 88, color: 'var(--fg-dim)', flexShrink: 0 }}>{label}</span>
                <span style={{ color: 'var(--fg)', flex: 1, minWidth: 0 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Versiones */}
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.Branch size={11} /> Historial de versiones
          </div>
          {Array.from({ length: Math.min(doc.version, 4) }).map((_, i) => {
            const v = doc.version - i;
            const labels = ['actual', 'hace 1 día', 'hace 3 días', 'hace 1 semana'];
            return (
              <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ width: 28, height: 18, borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, fontWeight: 600, background: i === 0 ? 'var(--accent-soft)' : 'var(--bg-elev-2)', color: i === 0 ? 'var(--accent)' : 'var(--fg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>v{v}</span>
                <div style={{ flex: 1, fontSize: 12 }}>
                  <div style={{ color: 'var(--fg)' }}>{labels[i] || `hace ${i} semanas`}</div>
                  <div style={{ color: 'var(--fg-dim)', fontSize: 11 }}>por {window.APP_DATA.users[i % window.APP_DATA.users.length].name.split(' ')[0]}</div>
                </div>
                {i > 0 && <button style={{ fontSize: 11, color: 'var(--accent)' }}>Restaurar</button>}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

const btnStylePrimary = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
  background: 'var(--accent)', color: 'var(--accent-fg)', border: '1px solid var(--accent)',
};
const btnStyleGhost = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
  background: 'var(--bg-elev-2)', color: 'var(--fg)', border: '1px solid var(--border)',
};

function ContextMenu({ ctx, onClose, onAction }) {
  useEffectDr(() => {
    if (!ctx) return;
    const h = () => onClose();
    setTimeout(() => {
      document.addEventListener('click', h);
      document.addEventListener('contextmenu', h);
    }, 0);
    return () => { document.removeEventListener('click', h); document.removeEventListener('contextmenu', h); };
  }, [ctx, onClose]);

  if (!ctx) return null;
  const items = [
    { id: 'open',     icon: <Icon.Eye size={13} />,       label: 'Abrir' },
    { id: 'preview',  icon: <Icon.Panel size={13} />,     label: 'Vista previa', shortcut: 'Espacio' },
    null,
    { id: 'share',    icon: <Icon.Share size={13} />,     label: 'Compartir…',   shortcut: '⌘⇧S' },
    { id: 'sign',     icon: <Icon.Signature size={13} />, label: 'Solicitar firma' },
    { id: 'download', icon: <Icon.Download size={13} />,  label: 'Descargar',    shortcut: '⌘D' },
    null,
    { id: 'rename',   icon: <Icon.File size={13} />,      label: 'Renombrar',    shortcut: 'F2' },
    { id: 'move',     icon: <Icon.Move size={13} />,      label: 'Mover a…' },
    { id: 'tag',      icon: <Icon.Tag size={13} />,       label: 'Añadir etiqueta' },
    { id: 'star',     icon: <Icon.Star size={13} />,      label: 'Marcar favorito' },
    null,
    { id: 'trash',    icon: <Icon.Trash size={13} />,     label: 'Mover a papelera', danger: true, shortcut: '⌫' },
  ];

  const vw = window.innerWidth, vh = window.innerHeight;
  const x = Math.min(ctx.x, vw - 230);
  const y = Math.min(ctx.y, vh - 370);

  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: 'fixed', top: y, left: x, zIndex: 100,
      background: 'var(--bg-elev)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: 'var(--shadow)',
      padding: 4, minWidth: 210,
    }}>
      {items.map((it, i) => it === null ? (
        <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      ) : (
        <button key={it.id} onClick={() => { onAction(it.id, ctx.docId); onClose(); }} className="nav-item" style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '6px 10px', borderRadius: 5, fontSize: 12.5,
          color: it.danger ? 'var(--danger)' : 'var(--fg)',
        }}>
          <span style={{ color: it.danger ? 'var(--danger)' : 'var(--fg-muted)' }}>{it.icon}</span>
          <span style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>
          {it.shortcut && <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontFamily: 'JetBrains Mono, monospace' }}>{it.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}

function NotifPopover({ open, onClose }) {
  if (!open) return null;
  const items = [
    { icon: <Icon.Signature size={13} style={{ color: 'var(--warn)' }} />, title: 'Firma pendiente — Contrato Acme', desc: 'Vence hoy a las 18:00', at: '8 min' },
    { icon: <Icon.Users size={13} style={{ color: 'var(--accent)' }} />,    title: 'Bafora Consulting te compartió un documento', desc: 'Contrato SaaS — Bafora Consulting', at: '2 h' },
    { icon: <Icon.Check size={13} style={{ color: 'var(--ok)' }} />,        title: 'Política de datos aprobada',      desc: 'Laura I. aprobó la versión final', at: 'ayer' },
    { icon: <Icon.Branch size={13} style={{ color: 'var(--fg-muted)' }} />, title: 'Nueva versión en PRD búsqueda',    desc: 'Pablo Q. subió v4', at: 'ayer' },
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{
        position: 'absolute', top: 56, right: 108, width: 340,
        background: 'var(--bg-elev)', border: '1px solid var(--border-strong)',
        borderRadius: 10, boxShadow: 'var(--shadow)', zIndex: 50, overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Notificaciones</span>
          <button style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Marcar todo leído</button>
        </div>
        {items.map((it, i) => (
          <div key={i} className="nav-item" style={{
            padding: '10px 14px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
            display: 'flex', gap: 10, cursor: 'pointer',
          }}>
            <div style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--bg-elev-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {it.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--fg)', fontWeight: 500, marginBottom: 2 }}>{it.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{it.desc}</div>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', flexShrink: 0 }}>{it.at}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function DropZoneOverlay({ active }) {
  if (!active) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'color-mix(in oklch, var(--accent) 12%, transparent)',
      backdropFilter: 'blur(2px)',
      border: '3px dashed var(--accent)', borderRadius: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{ background: 'var(--bg-elev)', padding: '18px 28px', borderRadius: 12, boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Icon.Upload size={28} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Suelta para subir</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Los archivos se añadirán a la carpeta actual</div>
        </div>
      </div>
    </div>
  );
}

function Toast({ toast, onClose }) {
  useEffectDr(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 2600);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 18, right: 18, zIndex: 200,
      background: 'var(--bg-elev)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: 'var(--shadow)',
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
      animation: 'slide-in 0.2s ease-out',
    }}>
      <Icon.Check size={14} style={{ color: 'var(--ok)' }} />
      <span style={{ fontSize: 12.5, color: 'var(--fg)' }}>{toast}</span>
    </div>
  );
}

window.DrawerUI = { DetailDrawer, ContextMenu, NotifPopover, DropZoneOverlay, Toast };
