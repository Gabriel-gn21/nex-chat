import React from 'react';
import { MessageSquare, BarChart3, Bot, Settings, LogOut, ChevronRight, Package } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import clsx from 'clsx';

type View = 'messages' | 'reports' | 'chatbot' | 'stock' | 'settings';

interface SidebarProps {
  activeView: View;
  setActiveView: (v: View) => void;
  mobileChatOpen?: boolean;
}

const navItems = [
  { id: 'messages' as View, icon: MessageSquare, label: 'Mensagens'  },
  { id: 'reports'  as View, icon: BarChart3,     label: 'Relatórios' },
  { id: 'chatbot'  as View, icon: Bot,           label: 'Chatbot'    },
  { id: 'stock'    as View, icon: Package,       label: 'Estoque'    },
];

export default function Sidebar({ activeView, setActiveView, mobileChatOpen }: SidebarProps) {
  const { user, logout } = useAuth();
  const roleLabel = { superadmin: 'Super Admin', admin: 'Admin', operator: 'Operador' };

  const allItems = [
    ...navItems,
    ...(user?.role !== 'operator'
      ? [{ id: 'settings' as View, icon: Settings, label: 'Configurações' }]
      : []),
  ];

  return (
    <>
      {/* ── Desktop: sidebar vertical (esquerda) ── */}
      <aside className="hidden md:flex w-16 bg-white border-r border-slate-100 flex-col items-center py-4 gap-2 shadow-sm z-10">
        {/* Logo */}
        <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-accent-500 rounded-xl flex items-center justify-center mb-3 shadow-md">
          <span className="text-white font-bold text-sm">N</span>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 flex-1 w-full px-2">
          {navItems.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              title={label}
              className={clsx(
                'relative w-full flex items-center justify-center h-10 rounded-xl transition-all group',
                activeView === id
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              )}
            >
              {activeView === id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary-600 rounded-r-full" />
              )}
              <Icon size={20} strokeWidth={activeView === id ? 2.5 : 1.8} />
              <span className="absolute left-14 bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                {label}
                <ChevronRight size={10} className="inline ml-1 opacity-50" />
              </span>
            </button>
          ))}

          {user?.role !== 'operator' && (
            <button
              onClick={() => setActiveView('settings')}
              title="Configurações"
              className={clsx(
                'relative w-full flex items-center justify-center h-10 rounded-xl transition-all group mt-1',
                activeView === 'settings'
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              )}
            >
              {activeView === 'settings' && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary-600 rounded-r-full" />
              )}
              <Settings size={20} strokeWidth={activeView === 'settings' ? 2.5 : 1.8} />
              <span className="absolute left-14 bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                Configurações
              </span>
            </button>
          )}
        </nav>

        {/* User avatar + logout */}
        <div className="flex flex-col items-center gap-2 w-full px-2">
          <div className="group relative w-full flex items-center justify-center">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-center border-2 border-primary-200 cursor-pointer">
              <span className="text-primary-700 font-bold text-sm">
                {user?.name?.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </span>
            </div>
            <div className="absolute left-14 bottom-0 bg-white border border-slate-200 rounded-xl p-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 min-w-[180px]">
              <p className="font-semibold text-slate-800 text-sm">{user?.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
              <span className="inline-block mt-2 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-md text-xs font-medium">
                {roleLabel[user?.role || 'operator']}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            title="Sair"
            className="w-full flex items-center justify-center h-9 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all group relative"
          >
            <LogOut size={18} />
            <span className="absolute left-14 bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
              Sair
            </span>
          </button>
        </div>
      </aside>

      {/* ── Mobile: bottom tab bar (esconde quando chat aberto) ── */}
      {!mobileChatOpen && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex items-center justify-around safe-area-bottom">
          {allItems.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 py-2 px-3 flex-1 transition-colors',
                activeView === id ? 'text-primary-600' : 'text-slate-400'
              )}
            >
              <Icon size={22} strokeWidth={activeView === id ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          ))}
          <button
            onClick={logout}
            className="flex flex-col items-center justify-center gap-0.5 py-2 px-3 flex-1 text-slate-400 transition-colors"
          >
            <LogOut size={22} strokeWidth={1.8} />
            <span className="text-[10px] font-medium leading-none">Sair</span>
          </button>
        </nav>
      )}
    </>
  );
}
