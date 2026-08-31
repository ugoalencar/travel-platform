import { Link, Outlet } from 'react-router-dom';
import { BarChart3, Users, Package, CreditCard, TrendingUp, Zap, Megaphone, MessageSquare, Settings, AlertCircle, Flag, Heart, FileText } from 'lucide-react';

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white shadow-lg">
        <div className="p-6">
          <h1 className="text-2xl font-bold">Travel Admin</h1>
          <p className="text-slate-400 text-sm mt-2">Platform Control</p>
        </div>

        <nav className="space-y-2 px-4">
          <NavLink to="/" icon={BarChart3} label="Dashboard" />
          <NavLink to="/subscribers" icon={Users} label="Subscribers" />
          <NavLink to="/plans" icon={Package} label="Plans" />
          <NavLink to="/subscriptions" icon={CreditCard} label="Subscriptions" />
          <NavLink to="/financial" icon={TrendingUp} label="Financial" />
          <NavLink to="/leads" icon={Zap} label="Leads" />
          <NavLink to="/marketing" icon={Megaphone} label="Marketing" />
          <NavLink to="/support" icon={MessageSquare} label="Support" />

          <hr className="my-4 border-slate-700" />

          <NavLink to="/incidents" icon={AlertCircle} label="Incidents" />
          <NavLink to="/feature-flags" icon={Flag} label="Feature Flags" />
          <NavLink to="/health" icon={Heart} label="Health" />
          <NavLink to="/audit" icon={FileText} label="Audit" />

          <hr className="my-4 border-slate-700" />

          <NavLink to="/settings" icon={Settings} label="Settings" />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
    >
      <Icon size={20} />
      <span>{label}</span>
    </Link>
  );
}
