/* Topbar — breadcrumb, live search, view toggle, actions */
const { useState: useStateTb, useRef: useRefTb, useEffect: useEffectTb } = React;

function Crumb({ children, onClick, last }) {
  return (
    <>
      <button onClick={onClick} style={{
        padding: '3px 6px', borderRadius: 5, color: last ? 'var(--fg)' : 'var(--fg-muted)',
        fontSize: 13, fontWeight: last ? 500 : 400,
      }} className="nav-item">
        {children}
      </button>
      {!last && <Icon.Chev size={11} style={{ color: 'var(--fg-dim)' }} />}
    </>
  );
}

function SearchField({ value, onChange, onSelectResult, data }) {
  const [open, setOpen] = useStateTb(false);
  const ref = useRefTb();

  const q = value.trim().toLowerCase();
  const hits = q.length > 0 ? data.docs.filter(d => d.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const folderHits = q.length > 0 ? flattenFolders(data.folders).filter(f => f.name.toLowerCase().includes(q) && f.id !== 'root').slice(0, 3) : [];

  useEffectTb(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); ref.current?.querySelector('input')?.focus(); setOpen(true); } };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, maxWidth: 560 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
        borderRadius: 7, padding: '6px 10px', height: 32,
      }}>
        <Icon.Search size={14} style={{ color: 'var(--fg-dim)' }} />
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar documentos, carpetas, personas…"
          style={{
            flex: 1, background: 'transparent', border: 0, outline: 'none',
            fontSize: 13, color: 'var(--fg)',
          }}
        />
        <kbd style={{
          fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--fg-dim)', padding: '1px 5px',
          border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)',
        }}>⌘K</kbd>
      </div>

      {open && (q.length > 0 || true) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--bg-elev)', border: '1px solid var(--border)',
          borderRadius: 9, boxShadow: 'var(--shadow)', zIndex: 50,
          maxHeight: 400, overflow: 'auto',
        }}>
          {q.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              Búsquedas sugeridas
            </div>
          ) : null}
          {q.length === 0 && [
            { q: 'contratos vencidos', icon: <Icon.File size={13} /> },
            { q: 'tag:confidencial', icon: <Icon.Tag size={13} /> },
            { q: 'owner:Laura tipo:pdf', icon: <Icon.Users size={13} /> },
          ].map((s, i) => (
            <button key={i} onClick={() => onChange(s.q)} className="nav-item" style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
              width: '100%', textAlign: 'left', color: 'var(--fg-muted)', fontSize: 13,
            }}>
              <span style={{ color: 'var(--fg-dim)' }}>{s.icon}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{s.q}</span>
            </button>
          ))}

          {folderHits.length > 0 && (
            <>
              <div style={{ padding: '10px 14px 4px', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Carpetas</div>
              {folderHits.map(f => (
                <button key={f.id} className="nav-item" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', width: '100%', textAlign: 'left', color: 'var(--fg)', fontSize: 13 }}>
                  <Icon.Folder size={14} style={{ color: 'var(--fg-dim)' }} />
                  <span>{f.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-dim)' }}>{f.count} docs</span>
                </button>
              ))}
            </>
          )}

          {hits.length > 0 && (
            <>
              <div style={{ padding: '10px 14px 4px', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Documentos</div>
              {hits.map(d => (
                <button key={d.id} onClick={() => { onSelectResult(d.id); setOpen(false); }} className="nav-item" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', width: '100%', textAlign: 'left', color: 'var(--fg)', fontSize: 13 }}>
                  <KindBadge kind={d.kind} small />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{highlight(d.name, q)}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{d.modified}</span>
                </button>
              ))}
            </>
          )}

          {q.length > 0 && hits.length === 0 && folderHits.length === 0 && (
            <div style={{ padding: '18px 14px', fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
              Sin resultados para “{q}”
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function highlight(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text;
  return <>{text.slice(0,i)}<mark style={{ background: 'var(--accent-soft)', color: 'var(--fg)', padding: 0 }}>{text.slice(i, i+q.length)}</mark>{text.slice(i+q.length)}</>;
}

function flattenFolders(folders, acc = []) {
  for (const f of folders) {
    acc.push(f);
    if (f.children) flattenFolders(f.children, acc);
  }
  return acc;
}

function KindBadge({ kind, small }) {
  const k = window.APP_DATA.kinds[kind];
  return (
    <span style={{
      fontSize: small ? 9 : 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
      padding: small ? '1px 4px' : '2px 5px', borderRadius: 3,
      color: k.tone, background: `color-mix(in oklch, ${k.tone} 16%, transparent)`,
      letterSpacing: '0.04em',
      flexShrink: 0,
    }}>{k.label}</span>
  );
}

function Topbar({ breadcrumb, onCrumbClick, search, onSearch, viewMode, onViewMode, onAction, onSelectResult, data, onOpenNotifs, notifCount }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '10px 18px', borderBottom: '1px solid var(--border)',
      background: 'var(--bg-elev)', flexShrink: 0, height: 52,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {breadcrumb.map((b, i) => (
          <Crumb key={i} last={i === breadcrumb.length - 1} onClick={() => onCrumbClick(b)}>{b.label}</Crumb>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <SearchField value={search} onChange={onSearch} data={data} onSelectResult={onSelectResult} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
          <button onClick={() => onViewMode('list')} title="Lista" style={{
            padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center',
            color: viewMode === 'list' ? 'var(--fg)' : 'var(--fg-dim)',
            background: viewMode === 'list' ? 'var(--bg-active)' : 'transparent',
          }}><Icon.List size={14} /></button>
          <button onClick={() => onViewMode('grid')} title="Cuadrícula" style={{
            padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center',
            color: viewMode === 'grid' ? 'var(--fg)' : 'var(--fg-dim)',
            background: viewMode === 'grid' ? 'var(--bg-active)' : 'transparent',
          }}><Icon.Grid size={14} /></button>
        </div>

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />

        <button onClick={onOpenNotifs} className="nav-item" title="Notificaciones" style={{
          position: 'relative', width: 30, height: 30, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-muted)',
        }}>
          <Icon.Bell size={15} />
          {notifCount > 0 && (
            <span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3, background: 'var(--danger)' }} />
          )}
        </button>

        <div style={{ display: 'flex', gap: 0, marginLeft: 4 }}>
          <button onClick={() => onAction('upload')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: '6px 0 0 6px',
            background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
            color: 'var(--fg)', fontSize: 12.5, fontWeight: 500,
          }}>
            <Icon.Upload size={13} /> Subir
          </button>
          <button onClick={() => onAction('new')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: '0 6px 6px 0',
            background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 12.5, fontWeight: 500,
            border: '1px solid var(--accent)', borderLeft: 0,
          }}>
            <Icon.Plus size={13} /> Nuevo
          </button>
        </div>

        <div style={{
          width: 28, height: 28, borderRadius: 14,
          background: 'oklch(0.7 0.14 30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, fontWeight: 600, marginLeft: 6,
        }}>LI</div>
      </div>
    </div>
  );
}

window.Topbar = Topbar;
window.KindBadge = KindBadge;
