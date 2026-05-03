/* Sidebar — folder tree, smart views, tags, approvals */
const { useState } = React;

function SectionLabel({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 6px', color: 'var(--fg-dim)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
      <span>{children}</span>
      {action}
    </div>
  );
}

function NavItem({ icon, label, count, active, onClick, badge, badgeTone, indent = 0 }) {
  return (
    <button onClick={onClick} className="nav-item" data-active={active || undefined} style={{
      display: 'flex', alignItems: 'center', gap: 9,
      width: 'calc(100% - 12px)', margin: '0 6px',
      padding: `7px 10px 7px ${10 + indent * 14}px`,
      borderRadius: 6, color: active ? 'var(--fg)' : 'var(--fg-muted)',
      background: active ? 'var(--bg-active)' : 'transparent',
      fontSize: 13, textAlign: 'left', lineHeight: 1.2,
      transition: 'background 0.12s, color 0.12s',
    }}>
      {icon}
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: active ? 500 : 400 }}>{label}</span>
      {count != null && <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
      {badge && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: badgeTone || 'var(--accent-soft)', color: badgeTone ? '#fff' : 'var(--accent)' }}>{badge}</span>}
    </button>
  );
}

function FolderNode({ node, depth, selectedFolder, onSelect, expanded, onToggle }) {
  const open = expanded.has(node.id);
  const hasKids = node.children && node.children.length > 0;
  const active = selectedFolder === node.id;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, margin: '0 6px' }}>
        {hasKids ? (
          <button onClick={() => onToggle(node.id)} style={{
            width: 18, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: depth * 14, color: 'var(--fg-dim)', borderRadius: 4,
          }}>
            <Icon.Chev size={11} stroke={2} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }} />
          </button>
        ) : (
          <span style={{ width: 18, marginLeft: depth * 14 }} />
        )}
        <button onClick={() => onSelect(node.id)} data-active={active || undefined} className="nav-item" style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 6,
          color: active ? 'var(--fg)' : 'var(--fg-muted)',
          background: active ? 'var(--bg-active)' : 'transparent',
          fontSize: 13, textAlign: 'left', fontWeight: active ? 500 : 400,
        }}>
          {open && hasKids ? <Icon.FolderOpen size={14} /> : (node.icon === 'Home' ? <Icon.Home size={14} /> : <Icon.Folder size={14} />)}
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
          {node.shared && <Icon.Users size={11} style={{ color: 'var(--fg-dim)' }} />}
          {node.count != null && <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>{node.count}</span>}
        </button>
      </div>
      {open && hasKids && (
        <div>
          {node.children.map(c => (
            <FolderNode key={c.id} node={c} depth={depth + 1} selectedFolder={selectedFolder} onSelect={onSelect} expanded={expanded} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ collapsed, selectedView, onSelectView, selectedFolder, onSelectFolder, selectedTag, onSelectTag, data, onToggleCollapsed }) {
  const [expanded, setExpanded] = useState(new Set(['root', 'legal', 'finanzas', 'producto']));
  const toggle = (id) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  };

  if (collapsed) {
    return (
      <aside style={{
        width: 52, height: '100%', background: 'var(--bg-elev)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '12px 0', gap: 4,
      }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-fg)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>A</div>
        {[
          { id: 'inicio', icon: <Icon.Home size={16} /> },
          { id: 'recientes', icon: <Icon.Clock size={16} /> },
          { id: 'compartidos', icon: <Icon.Users size={16} /> },
          { id: 'favoritos', icon: <Icon.Star size={16} /> },
          { id: 'aprobaciones', icon: <Icon.Signature size={16} /> },
          { id: 'papelera', icon: <Icon.Trash size={16} /> },
        ].map(item => (
          <button key={item.id} onClick={() => onSelectView(item.id)} title={item.id} className="nav-item" style={{
            width: 34, height: 34, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: selectedView === item.id ? 'var(--fg)' : 'var(--fg-muted)',
            background: selectedView === item.id ? 'var(--bg-active)' : 'transparent',
          }}>{item.icon}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={onToggleCollapsed} title="Expandir sidebar" style={{ width: 34, height: 34, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-dim)' }}>
          <Icon.Panel size={16} />
        </button>
      </aside>
    );
  }

  const pendientes = data.approvals.length;
  return (
    <aside style={{
      width: 260, height: '100%', background: 'var(--bg-elev)',
      borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Workspace header */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-fg)', fontWeight: 700, fontSize: 13 }}>A</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Nimbera</div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Workspace · 42 personas</div>
        </div>
        <button onClick={onToggleCollapsed} title="Colapsar" className="nav-item" style={{ width: 26, height: 26, borderRadius: 5, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon.Panel size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 12 }}>
        {/* Smart views */}
        <div style={{ padding: '8px 0 4px' }}>
          <NavItem icon={<Icon.Home size={14} />} label="Inicio" active={selectedView === 'inicio'} onClick={() => onSelectView('inicio')} />
          <NavItem icon={<Icon.Clock size={14} />} label="Recientes" active={selectedView === 'recientes'} onClick={() => onSelectView('recientes')} />
          <NavItem icon={<Icon.Users size={14} />} label="Compartidos conmigo" count={23} active={selectedView === 'compartidos'} onClick={() => onSelectView('compartidos')} />
          <NavItem icon={<Icon.Star size={14} />} label="Favoritos" count={4} active={selectedView === 'favoritos'} onClick={() => onSelectView('favoritos')} />
          <NavItem icon={<Icon.Signature size={14} />} label="Aprobaciones" badge={pendientes} active={selectedView === 'aprobaciones'} onClick={() => onSelectView('aprobaciones')} />
          <NavItem icon={<Icon.Trash size={14} />} label="Papelera" active={selectedView === 'papelera'} onClick={() => onSelectView('papelera')} />
        </div>

        {/* Folder tree */}
        <SectionLabel action={<button title="Nueva carpeta" style={{ color: 'var(--fg-dim)', width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon.Plus size={12} /></button>}>Carpetas</SectionLabel>
        {data.folders.map(f => (
          <FolderNode key={f.id} node={f} depth={0} selectedFolder={selectedFolder} onSelect={(id) => { onSelectFolder(id); onSelectView('carpeta'); }} expanded={expanded} onToggle={toggle} />
        ))}

        {/* Tags */}
        <SectionLabel>Etiquetas</SectionLabel>
        <div style={{ padding: '0 6px' }}>
          {data.tags.map(t => (
            <button key={t.id} onClick={() => onSelectTag(selectedTag === t.id ? null : t.id)} className="nav-item" style={{
              display: 'flex', alignItems: 'center', gap: 9,
              width: '100%', padding: '6px 10px', borderRadius: 6,
              background: selectedTag === t.id ? 'var(--bg-active)' : 'transparent',
              color: selectedTag === t.id ? 'var(--fg)' : 'var(--fg-muted)',
              fontSize: 13, textAlign: 'left',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Storage footer */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-muted)', marginBottom: 6 }}>
          <span>Almacenamiento</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{data.stats.storage.used} / {data.stats.storage.total} GB</span>
        </div>
        <div style={{ height: 4, background: 'var(--bg-active)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${(data.stats.storage.used / data.stats.storage.total) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
        </div>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
