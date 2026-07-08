import pathlib
import re

p = pathlib.Path("src/components/OwnerDashboard.tsx")
s = p.read_text()

old_component = '''export default function OwnerDashboard({ username }: { username: string }) {
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'settings'>('overview');

  useEffect(() => {
    fetch(`/api/stores/${username}`)
      .then(res => res.json())
      .then(data => { if (!data.error) setStore(data); })
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return <p className="text-muted text-sm text-center py-10">Loading...</p>;
  if (!store) return <p className="text-muted text-sm text-center py-10">Store not found.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{store.name || store.username}</h1>
          <p className="text-muted text-xs mt-1">chatfi.pro/{store.username}</p>
        </div>
        <Link
          href={`/${username}`}
          className="text-xs font-bold border border-border rounded-full px-4 py-2 hover:border-accent transition-colors"
        >
          View store
        </Link>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border">
        {(['overview', 'settings'] as const).map((t) => (
          <button
            key={t}
            id={t === 'settings' ? 'settings' : undefined}
            onClick={() => setTab(t)}
            className={`px-1 pb-2.5 mr-5 text-sm capitalize transition-colors border-b-2 ${
              tab === t ? 'border-accent text-text font-bold' : 'border-transparent text-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab username={username} store={store} />}
      {tab === 'settings' && <SettingsTab username={username} store={store} onUpdate={setStore} />}
    </div>
  );
}'''

new_component = '''export default function OwnerDashboard({ username }: { username: string }) {
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/stores/${username}`)
      .then(res => res.json())
      .then(data => { if (!data.error) setStore(data); })
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return <p className="text-muted text-sm text-center py-10">Loading...</p>;
  if (!store) return <p className="text-muted text-sm text-center py-10">Store not found.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{store.name || store.username}</h1>
          <p className="text-muted text-xs mt-1">chatfi.pro/{store.username}</p>
        </div>
        <Link
          href={`/${username}`}
          className="text-xs font-bold border border-border rounded-full px-4 py-2 hover:border-accent transition-colors"
        >
          View store
        </Link>
      </div>

      <OverviewTab username={username} store={store} />
    </div>
  );
}'''

if old_component not in s:
    raise SystemExit("OwnerDashboard component block not found — aborting")
s = s.replace(old_component, new_component)

# Remove the now-unused SettingsTab function entirely (it lives on its own page now)
match = re.search(r"\nfunction SettingsTab\(.*", s, re.DOTALL)
if not match:
    raise SystemExit("SettingsTab function not found — aborting")
s = s[:match.start()] + "\n"

p.write_text(s)
print("done")
