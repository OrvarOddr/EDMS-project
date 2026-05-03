/* Tweaks panel — edits color/theme/sidebar/density live */
const { useState: useStateTw, useEffect: useEffectTw } = React;

function TweaksPanel({ state, setState }) {
  const [mode, setMode] = useStateTw(false);
  useEffectTw(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setMode(true);
      if (e.data?.type === '__deactivate_edit_mode') setMode(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const set = (patch) => {
    const next = { ...state, ...patch };
    setState(next);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*');
  };

  if (!mode) return null;

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 300, width: 260,
      background: 'var(--bg-elev)', border: '1px solid var(--border-strong)',
      borderRadius: 10, boxShadow: 'var(--shadow)', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon.Sparkle size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Tweaks</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Tema</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['dark','Oscuro', <Icon.Moon size={12}/>], ['light','Claro', <Icon.Sun size={12}/>]].map(([v, l, i]) => (
              <button key={v} onClick={() => set({ theme: v })} style={{
                flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                border: `1px solid ${state.theme === v ? 'var(--accent)' : 'var(--border)'}`,
                background: state.theme === v ? 'var(--accent-soft)' : 'var(--bg-elev-2)',
                color: state.theme === v ? 'var(--accent)' : 'var(--fg-muted)',
              }}>{i}{l}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Sidebar</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[[false,'Expandido'], [true,'Colapsado']].map(([v, l]) => (
              <button key={String(v)} onClick={() => set({ sidebarCollapsed: v })} style={{
                flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 12,
                border: `1px solid ${state.sidebarCollapsed === v ? 'var(--accent)' : 'var(--border)'}`,
                background: state.sidebarCollapsed === v ? 'var(--accent-soft)' : 'var(--bg-elev-2)',
                color: state.sidebarCollapsed === v ? 'var(--accent)' : 'var(--fg-muted)',
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Acento</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[255, 155, 300, 25, 75].map(h => (
              <button key={h} onClick={() => set({ accentHue: h })} title={`hue ${h}`} style={{
                flex: 1, height: 26, borderRadius: 6, cursor: 'pointer',
                background: `oklch(0.7 0.14 ${h})`,
                border: state.accentHue === h ? '2px solid var(--fg)' : '2px solid transparent',
              }} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Densidad</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['compact','Compacta'], ['comfy','Cómoda']].map(([v, l]) => (
              <button key={v} onClick={() => set({ density: v })} style={{
                flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 12,
                border: `1px solid ${state.density === v ? 'var(--accent)' : 'var(--border)'}`,
                background: state.density === v ? 'var(--accent-soft)' : 'var(--bg-elev-2)',
                color: state.density === v ? 'var(--accent)' : 'var(--fg-muted)',
              }}>{l}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.TweaksPanel = TweaksPanel;
