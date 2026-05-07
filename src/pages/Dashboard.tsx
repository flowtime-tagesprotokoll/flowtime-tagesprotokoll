import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useShops } from '../lib/queries';
import { useAuth } from '../lib/authStore';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DashboardPage() {
  const session = useAuth((s) => s.session)!;
  const { data: shops, isLoading } = useShops();
  const navigate = useNavigate();
  const heute = todayISO();

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Tagesprotokoll</h1>
          <p className="text-sm text-muted mt-1">
            Hallo {session.profile.name}. Welcher Shop?
          </p>
        </div>

        {isLoading && <div className="text-muted">Lade Shops …</div>}

        {shops && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shops.map((shop) => (
              <button
                key={shop.id}
                type="button"
                onClick={() =>
                  navigate(`/protokoll/${shop.id}/${heute}`)
                }
                className="bg-surface border border-border rounded-lg p-5 text-left hover:border-accent hover:bg-surface-2 transition-colors"
              >
                <div className="text-xs text-muted uppercase tracking-wider">
                  {shop.kurz}
                </div>
                <div className="text-lg font-semibold mt-1">{shop.name}</div>
                <div className="text-xs text-muted mt-2 mono">{heute}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
