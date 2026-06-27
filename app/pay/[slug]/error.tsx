'use client';
export default function Error({ error }: { error: Error }) {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#0F0F0F', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ color: '#fff', textAlign: 'center' }}>
        <h1 style={{ color: '#ff4444', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Payment Error</h1>
        <p style={{ color: '#7d8590', fontSize: 14 }}>{error.message}</p>
      </div>
    </main>
  );
}
