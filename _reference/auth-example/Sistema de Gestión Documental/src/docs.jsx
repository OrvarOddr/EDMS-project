/* Docs table + grid views, filters, bulk actions, overview cards */
const { useState: useStateDocs, useEffect: useEffectDocs, useMemo: useMemoDocs } = React;

function FiltersRow({ filters, onFilters, onClear, data }) {
  const pills = [
    { key: 'kind',   label: 'Tipo',     options: [['pdf','PDF'], ['doc','Documento'], ['sheet','Hoja'], ['slide','Slide'], ['image','Imagen']] },
    { key: 'owner',  label: 'Autor',    options: data.users.map(u => [u.id, u.name]) },
    { key: 'status', label: 'Estado',   options: [['borrador','Borrador'], ['revision','En revisión'], ['pendiente-firma','Pendiente firma'], ['publicado','Publicado'], ['firmado','Firmado'], ['archivado','Archivado']] },
    { key: 'date',   label: 'Fecha',    options: [['hoy','Hoy'], ['semana','Últimos 7 días'], ['mes','Último mes'], ['ano','Este año']] },
  ];
  const [openKey, setOpenKey] = useStateDocs(null);
  const active = Object.entries(filters).filter(([k, v]) => v);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--fg-dim)', fontSize: 12, marginRight: 4 }}>
        <Icon.Filter size={12} /> Filtros
      </span>
      {pills.map(p => {
        const v = filters[p.key];
        const activeLabel = v ? (p.options.find(o => o[0] === v)?.[1] || v) : null;
        return (
          <div key={p.key} style={{ position: 'relative' }}>
            <button onClick={() => setOpenKey(openKey === p.key ? null : p.key)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 14,
              border: '1px solid var(--border)',
              background: v ? 'var(--accent-soft)' : 'var(--bg-elev)',
              color: v ? 'var(--accent)' : 'var(--fg-muted)',
              fontSize: 12, fontWeight: v ? 500 : 400,
            }}>
              {p.label}{v && <span style={{ color: 'var(--fg)' }}>: {activeLabel}</span>}
              <Icon.ChevDown size={10} />
            </button>
            {openKey === p.key && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20,
                background: 'var(--bg-elev)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: 'var(--shadow)',
                minWidth: 180, padding: 4,
              }}>
                {v && (
                  <button onClick={() => { onFilters({ ...filters, [p.key]: null }); setOpenKey(null); }} className="nav-item" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 5, fontSize: 12, color: 'var(--fg-dim)' }}>Limpiar</button>
                )}
                {p.options.map(([val, lbl]) => (
                  <button key={val} onClick={() => { onFilters({ ...filters, [p.key]: val }); setOpenKey(null); }} className="nav-item" style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 5, fontSize: 12.5,
                    color: 'var(--fg)', textAlign: 'left',
                    background: v === val ? 'var(--bg-active)' : 'transparent',
                  }}>
                    {v === val && <Icon.Check size={11} style={{ color: 'var(--accent)' }} />}
                    <span style={{ marginLeft: v === val ? 0 : 17 }}>{lbl}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {active.length > 0 && (
        <button onClick={onClear} style={{ fontSize: 11, color: 'var(--fg-dim)', padding: '4px 6px', marginLeft: 2 }}>
          Limpiar todo
        </button>
      )}
    </div>
  );
}

function BulkBar({ count, onClear, onAction }) {
  if (count === 0) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-elev-2)', border: '1px solid var(--border-strong)',
      borderRadius: 10, boxShadow: 'var(--shadow)', padding: '6px 6px 6px 14px',
      display: 'flex', alignItems: 'center', gap: 6, zIndex: 30,
    }}>
      <span style={{ fontSize: 12.5, color: 'var(--fg)', fontWeight: 500, marginRight: 4 }}>{count} seleccionados</span>
      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
      {[
        { id: 'download', icon: <Icon.Download size={13} />, label: 'Descargar' },
        { id: 'share',    icon: <Icon.Share size={13} />,    label: 'Compartir' },
        { id: 'move',     icon: <Icon.Move size={13} />,     label: 'Mover' },
        { id: 'tag',      icon: <Icon.Tag size={13} />,      label: 'Etiquetar' },
        { id: 'trash',    icon: <Icon.Trash size={13} />,    label: 'Eliminar', danger: true },
      ].map(a => (
        <button key={a.id} onClick={() => onAction(a.id)} className="nav-item" style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 6,
          color: a.danger ? 'var(--danger)' : 'var(--fg)', fontSize: 12,
        }}>{a.icon}{a.label}</button>
      ))}
      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
      <button onClick={onClear} title="Deseleccionar" style={{ width: 24, height: 24, borderRadius: 5, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon.Close size={13} />
      </button>
    </div>
  );
}

function OwnerAvatar({ userId, size = 20 }) {
  const u = window.APP_DATA.users.find(u => u.id === userId);
  if (!u) return null;
  return (
    <span title={u.name} style={{
      width: size, height: size, borderRadius: size/2, background: u.color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: '#0e0f12', fontSize: size * 0.45, fontWeight: 600, flexShrink: 0,
      border: '1.5px solid var(--bg-elev)',
    }}>{u.initials}</span>
  );
}

function AvatarStack({ ids, max = 3 }) {
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <div style={{ display: 'inline-flex' }}>
      {shown.map((id, i) => (
        <span key={id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <OwnerAvatar userId={id} size={20} />
        </span>
      ))}
      {extra > 0 && (
        <span style={{
          marginLeft: -6, width: 20, height: 20, borderRadius: 10,
          background: 'var(--bg-active)', color: 'var(--fg-muted)',
          fontSize: 9, fontWeight: 600, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--bg-elev)',
        }}>+{extra}</span>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    'borrador':        { label: 'Borrador',       color: 'var(--fg-dim)' },
    'revision':        { label: 'En revisión',    color: 'oklch(0.72 0.13 255)' },
    'pendiente-firma': { label: 'Pendiente firma',color: 'oklch(0.78 0.14 75)' },
    'publicado':       { label: 'Publicado',      color: 'oklch(0.75 0.14 155)' },
    'firmado':         { label: 'Firmado',        color: 'oklch(0.75 0.14 155)' },
    'archivado':       { label: 'Archivado',      color: 'var(--fg-dim)' },
  };
  const s = map[status] || map.borrador;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: s.color }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} />
      {s.label}
    </span>
  );
}

function TagChip({ id }) {
  const t = window.APP_DATA.tags.find(t => t.id === id);
  if (!t) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 6px', borderRadius: 10, fontSize: 10.5,
      color: t.color, background: `color-mix(in oklch, ${t.color} 14%, transparent)`,
    }}>
      {t.label}
    </span>
  );
}

function ListView({ docs, selected, onToggleSelect, onSelectAll, allSelected, onOpenDoc, onContextMenu }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2 }}>
            <th style={{ width: 36, padding: '10px 4px 10px 10px', textAlign: 'left' }}>
              <Checkbox checked={allSelected} onChange={onSelectAll} indeterminate={selected.size > 0 && !allSelected} />
            </th>
            {['Nombre', 'Etiquetas', 'Autor', 'Estado', 'Versión', 'Compartido con', 'Modificado', 'Tamaño', ''].map((h, i) => (
              <th key={i} style={{
                padding: '10px 12px', textAlign: 'left', fontWeight: 500,
                color: 'var(--fg-dim)', fontSize: 11, letterSpacing: '0.04em',
                textTransform: 'uppercase', borderBottom: '1px solid var(--border)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((d, i) => {
            const isSel = selected.has(d.id);
            return (
              <tr key={d.id}
                  onClick={() => onOpenDoc(d.id)}
                  onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, d.id); }}
                  style={{
                    cursor: 'pointer',
                    background: isSel ? 'var(--accent-soft)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                <td style={{ padding: '8px 4px 8px 10px', borderBottom: '1px solid var(--border)' }} onClick={e => { e.stopPropagation(); onToggleSelect(d.id); }}>
                  <Checkbox checked={isSel} onChange={() => onToggleSelect(d.id)} />
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <KindBadge kind={d.kind} />
                    {d.starred && <Icon.Star size={12} style={{ color: 'oklch(0.8 0.14 75)', fill: 'oklch(0.8 0.14 75)' }} />}
                    {d.locked && <Icon.Lock size={12} style={{ color: 'var(--fg-dim)' }} />}
                    <span style={{ color: 'var(--fg)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}>{d.name}</span>
                  </div>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {d.tags.map(t => <TagChip key={t} id={t} />)}
                  </div>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <OwnerAvatar userId={d.owner} size={18} />
                    <span>{window.APP_DATA.users.find(u => u.id === d.owner)?.name.split(' ')[0]}</span>
                  </div>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <StatusPill status={d.status} />
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>
                  v{d.version}
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  {d.shared.length > 0 ? <AvatarStack ids={d.shared} /> : <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>{d.modified}</td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{d.size}</td>
                <td style={{ padding: '8px 12px 8px 4px', borderBottom: '1px solid var(--border)' }} onClick={e => { e.stopPropagation(); onContextMenu(e, d.id); }}>
                  <button style={{ width: 22, height: 22, borderRadius: 4, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon.More size={14} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {docs.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-dim)' }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>Sin documentos</div>
          <div style={{ fontSize: 12 }}>Ajusta los filtros o arrastra archivos aquí para subirlos.</div>
        </div>
      )}
    </div>
  );
}

function Checkbox({ checked, onChange, indeterminate }) {
  return (
    <button onClick={onChange} style={{
      width: 16, height: 16, borderRadius: 4,
      border: `1.4px solid ${checked || indeterminate ? 'var(--accent)' : 'var(--border-strong)'}`,
      background: checked || indeterminate ? 'var(--accent)' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.1s',
    }}>
      {checked && <Icon.Check size={10} stroke={3} style={{ color: 'var(--accent-fg)' }} />}
      {indeterminate && !checked && <span style={{ width: 7, height: 2, background: 'var(--accent-fg)', borderRadius: 1 }} />}
    </button>
  );
}

function GridView({ docs, selected, onToggleSelect, onOpenDoc, onContextMenu }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
        {docs.map(d => {
          const isSel = selected.has(d.id);
          const kind = window.APP_DATA.kinds[d.kind];
          return (
            <div key={d.id}
                 onClick={() => onOpenDoc(d.id)}
                 onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, d.id); }}
                 style={{
                   background: 'var(--bg-elev)',
                   border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                   borderRadius: 10, padding: 12, cursor: 'pointer',
                   transition: 'all 0.12s', position: 'relative',
                   boxShadow: isSel ? '0 0 0 3px var(--accent-soft)' : 'none',
                 }}
                 onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                 onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = 'var(--border)'; }}>

              <div style={{ position: 'absolute', top: 8, left: 8, opacity: isSel ? 1 : 0, transition: 'opacity 0.1s' }}
                   onClick={e => { e.stopPropagation(); onToggleSelect(d.id); }}>
                <Checkbox checked={isSel} onChange={() => onToggleSelect(d.id)} />
              </div>
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                {d.starred && <Icon.Star size={12} style={{ color: 'oklch(0.8 0.14 75)', fill: 'oklch(0.8 0.14 75)' }} />}
                {d.locked && <Icon.Lock size={12} style={{ color: 'var(--fg-dim)' }} />}
              </div>

              {/* Doc preview placeholder */}
              <div style={{
                height: 110, borderRadius: 6, marginBottom: 10,
                background: `linear-gradient(135deg, color-mix(in oklch, ${kind.tone} 14%, var(--bg-elev-2)), var(--bg-elev-2))`,
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'flex-end', padding: 8, overflow: 'hidden', position: 'relative',
              }}>
                <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
                  <defs>
                    <pattern id={`stripes-${d.id}`} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="7" stroke={kind.tone} strokeWidth="1" opacity="0.3" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#stripes-${d.id})`} />
                </svg>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ height: 3, width: '70%', background: 'color-mix(in oklch, currentColor 30%, transparent)', borderRadius: 1, color: kind.tone }} />
                  <div style={{ height: 3, width: '90%', background: 'color-mix(in oklch, currentColor 22%, transparent)', borderRadius: 1, color: kind.tone }} />
                  <div style={{ height: 3, width: '55%', background: 'color-mix(in oklch, currentColor 22%, transparent)', borderRadius: 1, color: kind.tone }} />
                </div>
                <div style={{ position: 'absolute', top: 8, left: 8 }}>
                  <KindBadge kind={d.kind} />
                </div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 6, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>
                {d.name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--fg-dim)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <OwnerAvatar userId={d.owner} size={16} />
                  <span>{d.modified}</span>
                </div>
                {d.shared.length > 0 && <AvatarStack ids={d.shared} max={2} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------- Dashboard (Inicio) ------- */

function OverviewCards({ data, onAction }) {
  const cards = [
    { label: 'Documentos totales', value: data.stats.total.toLocaleString('es-ES'), delta: `+${data.stats.deltaWeek} esta semana`, deltaTone: 'var(--ok)' },
    { label: 'Pendientes de firma', value: data.stats.pendientes, delta: '3 vencen hoy', deltaTone: 'var(--warn)' },
    { label: 'Compartidos externos', value: data.stats.compartidos, delta: '12 con acceso expirado', deltaTone: 'var(--fg-dim)' },
    { label: 'Almacenamiento', value: `${data.stats.storage.used} GB`, delta: `${Math.round((data.stats.storage.used / data.stats.storage.total) * 100)}% usado`, deltaTone: 'var(--fg-dim)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '16px 18px 4px' }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', letterSpacing: '0.02em', marginBottom: 6 }}>{c.label}</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginBottom: 6 }}>{c.value}</div>
          <div style={{ fontSize: 11, color: c.deltaTone }}>{c.delta}</div>
        </div>
      ))}
    </div>
  );
}

function ApprovalsPanel({ approvals, docs, onOpenDoc }) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon.Signature size={14} style={{ color: 'var(--warn)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Pendientes de tu revisión</span>
          <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'var(--bg-active)', color: 'var(--fg-muted)' }}>{approvals.length}</span>
        </div>
        <button style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>Ver todo <Icon.Arrow size={11} /></button>
      </div>
      {approvals.map(a => {
        const d = docs.find(dd => dd.id === a.docId);
        return (
          <div key={a.id} onClick={() => onOpenDoc(a.docId)} className="nav-item" style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 4, alignSelf: 'stretch', background: a.priority === 'alta' ? 'var(--danger)' : 'var(--warn)', borderRadius: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', display: 'flex', gap: 10 }}>
                <span>Solicitado por <b style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{window.APP_DATA.users.find(u => u.id === a.requester)?.name.split(' ')[0]}</b></span>
                <span>·</span>
                <span style={{ color: a.priority === 'alta' ? 'var(--danger)' : 'var(--fg-muted)' }}>Vence {a.due}</span>
              </div>
            </div>
            <button onClick={e => e.stopPropagation()} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elev-2)', color: 'var(--fg)', fontSize: 12, fontWeight: 500 }}>Revisar</button>
          </div>
        );
      })}
    </div>
  );
}

function ActivityPanel({ activity, docs }) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon.Clock size={14} style={{ color: 'var(--fg-muted)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Actividad reciente</span>
        </div>
      </div>
      <div style={{ padding: '6px 0' }}>
        {activity.map(a => {
          const d = docs.find(dd => dd.id === a.doc);
          const u = window.APP_DATA.users.find(u => u.id === a.who);
          return (
            <div key={a.id} style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <OwnerAvatar userId={a.who} size={22} />
              <div style={{ flex: 1, minWidth: 0, color: 'var(--fg-muted)' }}>
                <b style={{ color: 'var(--fg)', fontWeight: 500 }}>{u?.name.split(' ')[0]}</b>
                {' '}{a.what}{' '}
                <span style={{ color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: 240, verticalAlign: 'bottom' }}>{d?.name}</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{a.at}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.DocsUI = { FiltersRow, BulkBar, ListView, GridView, OverviewCards, ApprovalsPanel, ActivityPanel, Checkbox, OwnerAvatar, AvatarStack, StatusPill, TagChip };
