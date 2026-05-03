/* Main app — glue + state + DnD + keyboard + dashboard view */
const { useState: useS, useEffect: useE, useMemo: useM, useRef: useR } = React;

function flattenFolders(folders, acc = []) {
  for (const f of folders) { acc.push(f); if (f.children) flattenFolders(f.children, acc); }
  return acc;
}

function getFolderPath(folders, targetId, path = []) {
  for (const f of folders) {
    const p = [...path, f];
    if (f.id === targetId) return p;
    if (f.children) {
      const found = getFolderPath(f.children, targetId, p);
      if (found) return found;
    }
  }
  return null;
}

function App() {
  const data = window.APP_DATA;
  const [tweaks, setTweaks] = useS(window.TWEAKS);

  // persist / apply tweaks
  useE(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme);
    document.documentElement.style.setProperty('--accent', `oklch(0.72 0.13 ${tweaks.accentHue})`);
    document.documentElement.style.setProperty('--accent-soft', `oklch(0.55 0.13 ${tweaks.accentHue} / 0.22)`);
    if (tweaks.theme === 'light') {
      document.documentElement.style.setProperty('--accent', `oklch(0.5 0.15 ${tweaks.accentHue})`);
      document.documentElement.style.setProperty('--accent-soft', `oklch(0.5 0.15 ${tweaks.accentHue} / 0.12)`);
    }
  }, [tweaks]);

  // State
  const [selectedView, setSelectedView] = useS('inicio');      // inicio | recientes | compartidos | favoritos | aprobaciones | papelera | carpeta
  const [selectedFolder, setSelectedFolder] = useS('root');
  const [selectedTag, setSelectedTag] = useS(null);
  const [search, setSearch] = useS('');
  const [viewMode, setViewMode] = useS('list');
  const [filters, setFilters] = useS({ kind: null, owner: null, status: null, date: null });
  const [selected, setSelected] = useS(new Set());
  const [openDocId, setOpenDocId] = useS(null);
  const [ctxMenu, setCtxMenu] = useS(null);
  const [notifOpen, setNotifOpen] = useS(false);
  const [dragging, setDragging] = useS(false);
  const [toast, setToast] = useS(null);
  const dragCounter = useR(0);

  // filter docs
  const visibleDocs = useM(() => {
    let list = data.docs;
    if (selectedView === 'favoritos') list = list.filter(d => d.starred);
    else if (selectedView === 'compartidos') list = list.filter(d => d.shared.length > 0 && d.owner !== 'u1');
    else if (selectedView === 'aprobaciones') list = list.filter(d => d.status === 'pendiente-firma' || d.status === 'revision');
    else if (selectedView === 'papelera') list = [];
    else if (selectedView === 'recientes') list = [...list].sort((a,b) => a.modified.localeCompare(b.modified));
    else if (selectedView === 'carpeta' && selectedFolder !== 'root') {
      list = list.filter(d => d.folder === selectedFolder);
    }
    if (selectedTag) list = list.filter(d => d.tags.includes(selectedTag));
    if (filters.kind)   list = list.filter(d => d.kind === filters.kind);
    if (filters.owner)  list = list.filter(d => d.owner === filters.owner);
    if (filters.status) list = list.filter(d => d.status === filters.status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(q));
    }
    return list;
  }, [data.docs, selectedView, selectedFolder, selectedTag, filters, search]);

  const breadcrumb = useM(() => {
    if (selectedView === 'inicio')       return [{ id: 'inicio', label: 'Inicio' }];
    if (selectedView === 'recientes')    return [{ id: 'recientes', label: 'Recientes' }];
    if (selectedView === 'compartidos')  return [{ id: 'compartidos', label: 'Compartidos conmigo' }];
    if (selectedView === 'favoritos')    return [{ id: 'favoritos', label: 'Favoritos' }];
    if (selectedView === 'aprobaciones') return [{ id: 'aprobaciones', label: 'Aprobaciones' }];
    if (selectedView === 'papelera')     return [{ id: 'papelera', label: 'Papelera' }];
    const path = getFolderPath(data.folders, selectedFolder);
    return path ? path.map(n => ({ id: n.id, label: n.name })) : [{ id: 'root', label: 'Archivo' }];
  }, [selectedView, selectedFolder, data.folders]);

  // selection helpers
  const toggleSelect = (id) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const selectAll = () => {
    if (selected.size === visibleDocs.length) setSelected(new Set());
    else setSelected(new Set(visibleDocs.map(d => d.id)));
  };
  const clearSel = () => setSelected(new Set());

  const openDoc = (id) => setOpenDocId(id);
  const contextMenu = (e, docId) => setCtxMenu({ x: e.clientX, y: e.clientY, docId });

  const handleAction = (action, docId) => {
    const msgs = {
      upload: 'Selecciona archivos para subir',
      new: 'Nuevo documento creado',
      download: 'Descarga iniciada',
      share: 'Enlace copiado al portapapeles',
      sign: 'Solicitud de firma enviada',
      trash: 'Movido a papelera',
      move: 'Selecciona destino…',
      tag: 'Etiquetas actualizadas',
      star: 'Añadido a favoritos',
      rename: 'Renombrar — modo edición',
      open: 'Abriendo documento…',
      preview: 'Vista previa activada',
      fullscreen: 'Abriendo completo…',
    };
    setToast(msgs[action] || `Acción: ${action}`);
    if (action === 'open' || action === 'preview') setOpenDocId(docId);
  };

  // Drag & drop
  useE(() => {
    const onEnter = (e) => { e.preventDefault(); dragCounter.current++; if (e.dataTransfer?.types?.includes('Files')) setDragging(true); };
    const onOver  = (e) => { e.preventDefault(); };
    const onLeave = (e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) { setDragging(false); dragCounter.current = 0; } };
    const onDrop  = (e) => { e.preventDefault(); dragCounter.current = 0; setDragging(false); if (e.dataTransfer?.files?.length) setToast(`${e.dataTransfer.files.length} archivos subidos`); };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // Keyboard
  useE(() => {
    const h = (e) => {
      if (e.key === 'Escape') { setSelected(new Set()); setOpenDocId(null); setCtxMenu(null); }
      if (e.key === ' ' && selected.size === 1 && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        setOpenDocId([...selected][0]);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [selected]);

  const openDoc_obj = openDocId ? data.docs.find(d => d.id === openDocId) : null;
  const allSelected = visibleDocs.length > 0 && visibleDocs.every(d => selected.has(d.id));

  const showDashboard = selectedView === 'inicio' && search.trim() === '' && !filters.kind && !filters.owner && !filters.status && !filters.date && !selectedTag;

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', position: 'relative', background: 'var(--bg)' }}>
      <Sidebar
        collapsed={tweaks.sidebarCollapsed}
        selectedView={selectedView}
        onSelectView={(v) => { setSelectedView(v); setSelected(new Set()); setSearch(''); }}
        selectedFolder={selectedFolder}
        onSelectFolder={setSelectedFolder}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        data={data}
        onToggleCollapsed={() => setTweaks({ ...tweaks, sidebarCollapsed: !tweaks.sidebarCollapsed })}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        <Topbar
          breadcrumb={breadcrumb}
          onCrumbClick={(b) => { if (data.folders.some(f => f.id === b.id) || getFolderPath(data.folders, b.id)) { setSelectedView('carpeta'); setSelectedFolder(b.id); } }}
          search={search} onSearch={setSearch}
          viewMode={viewMode} onViewMode={setViewMode}
          onAction={handleAction}
          onSelectResult={openDoc}
          data={data}
          onOpenNotifs={() => setNotifOpen(true)}
          notifCount={4}
        />

        {/* Content header */}
        <div style={{ padding: '18px 18px 8px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 2px', letterSpacing: '-0.01em' }}>
              {showDashboard ? 'Buenos días, Laura' : breadcrumb[breadcrumb.length - 1].label}
            </h1>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
              {showDashboard ? 'Tienes 3 documentos que requieren tu firma hoy.' : `${visibleDocs.length} documentos${selectedTag ? ` · etiqueta "${data.tags.find(t=>t.id===selectedTag)?.label}"` : ''}`}
            </div>
          </div>
          {!showDashboard && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => handleAction('new-folder')} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg-elev)', color: 'var(--fg)', fontSize: 12.5,
              }}><Icon.Folder size={13} /> Nueva carpeta</button>
              <button onClick={() => handleAction('scan')} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg-elev)', color: 'var(--fg)', fontSize: 12.5,
              }}><Icon.Scan size={13} /> Escanear (OCR)</button>
            </div>
          )}
        </div>

        {showDashboard ? (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <DocsUI.OverviewCards data={data} onAction={handleAction} />
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, padding: '14px 18px' }}>
              <DocsUI.ApprovalsPanel approvals={data.approvals} docs={data.docs} onOpenDoc={openDoc} />
              <DocsUI.ActivityPanel activity={data.activity} docs={data.docs} />
            </div>

            <div style={{ padding: '4px 18px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Recientes</h2>
                <button onClick={() => setSelectedView('recientes')} style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  Ver todos <Icon.Arrow size={11} />
                </button>
              </div>
              <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 0 }}>
                  {data.docs.slice(0, 6).map((d, i) => {
                    const kind = data.kinds[d.kind];
                    return (
                      <button key={d.id} onClick={() => openDoc(d.id)} className="nav-item" style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                        borderRight: (i % 3 !== 2) ? '1px solid var(--border)' : 'none',
                        borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
                        background: 'transparent', color: 'var(--fg)', textAlign: 'left',
                      }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 6, flexShrink: 0,
                          background: `color-mix(in oklch, ${kind.tone} 16%, var(--bg-elev-2))`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: kind.tone, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                        }}>{kind.label}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>{d.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{d.modified} · v{d.version}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <DocsUI.FiltersRow filters={filters} onFilters={setFilters} onClear={() => setFilters({ kind: null, owner: null, status: null, date: null })} data={data} />
            {viewMode === 'list' ? (
              <DocsUI.ListView docs={visibleDocs} selected={selected} onToggleSelect={toggleSelect} onSelectAll={selectAll} allSelected={allSelected} onOpenDoc={openDoc} onContextMenu={contextMenu} />
            ) : (
              <DocsUI.GridView docs={visibleDocs} selected={selected} onToggleSelect={toggleSelect} onOpenDoc={openDoc} onContextMenu={contextMenu} />
            )}
          </>
        )}

        <DocsUI.BulkBar count={selected.size} onClear={clearSel} onAction={(a) => { handleAction(a); clearSel(); }} />
      </main>

      {openDoc_obj && <DrawerUI.DetailDrawer doc={openDoc_obj} onClose={() => setOpenDocId(null)} onAction={handleAction} />}

      <DrawerUI.ContextMenu ctx={ctxMenu} onClose={() => setCtxMenu(null)} onAction={handleAction} />
      <DrawerUI.NotifPopover open={notifOpen} onClose={() => setNotifOpen(false)} />
      <DrawerUI.DropZoneOverlay active={dragging} />
      <DrawerUI.Toast toast={toast} onClose={() => setToast(null)} />

      <TweaksPanel state={tweaks} setState={setTweaks} />

      <style>{`
        @keyframes slide-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
        .nav-item:hover { background: var(--bg-hover) !important; }
        .nav-item[data-active]:hover { background: var(--bg-active) !important; }
        input::placeholder { color: var(--fg-dim); }
        mark { background: var(--accent-soft); color: var(--fg); }
        button { transition: background 0.1s, color 0.1s, border-color 0.1s; }
      `}</style>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
