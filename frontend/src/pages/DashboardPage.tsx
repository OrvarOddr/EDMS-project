export default function DashboardPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg)' }}>
      <iframe
        src="/dashboard.html"
        title="EDMS Dashboard"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  )
}
