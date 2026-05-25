import React, { useState, useEffect } from 'react';
import {
  Users, Shield, Clock, Plus, X, Trash2, Edit3,
  CheckCircle, Loader2, AlertCircle, KeyRound, UsersRound, Plug, Eye, EyeOff,
  ClipboardList, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, GripVertical,
  Sparkles, Hash, ArrowLeft,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { useApp, SERVER_URL, apiFetch } from '../contexts/AppContext';
import { User, UserRole, SessionConfig, AttendanceGroup, TabulationConfig, TabulationField, TabulationFieldType, TabulationAIProvider } from '../types';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type SettingsTab = 'users' | 'groups' | 'security' | 'session' | 'integrations' | 'tabulation';

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'users',        label: 'Usuários',            icon: Users },
  { id: 'groups',       label: 'Grupos de atend.',    icon: UsersRound },
  { id: 'security',     label: 'Segurança (2FA)',      icon: Shield },
  { id: 'session',      label: 'Sessão',               icon: Clock },
  { id: 'integrations', label: 'Integrações',          icon: Plug },
  { id: 'tabulation',   label: 'Tabulações',           icon: ClipboardList },
];

const ROLE_CFG: Record<UserRole, { label: string; color: string; desc: string }> = {
  superadmin: { label: 'Super Admin', color: 'bg-purple-100 text-purple-700', desc: 'Acesso total ao sistema' },
  admin:      { label: 'Admin',       color: 'bg-primary-100 text-primary-700', desc: 'Gerencia usuários e configurações' },
  operator:   { label: 'Operador',    color: 'bg-accent-100 text-accent-700',   desc: 'Atendimento e visualização' },
};

export default function Settings() {
  const {
    user: currentUser, users, addUser, updateUser, deleteUser,
    sessionConfig, saveSessionConfig,
  } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('users');

  const canManage = currentUser?.role !== 'operator';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-6 py-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">Configurações</h1>
        <p className="text-sm text-slate-500">Usuários, segurança e sessões</p>
      </div>

      <div className="bg-white border-b border-slate-100 px-6">
        <div className="flex gap-0">
          {TABS.filter((t) => t.id !== 'session' || currentUser?.role !== 'operator').map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={clsx('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition',
                tab === id ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              <Icon size={16} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'users'        && <UsersTab canManage={canManage} />}
        {tab === 'groups'       && <GroupsTab canManage={canManage} />}
        {tab === 'security'     && <SecurityTab />}
        {tab === 'session'      && <SessionTab config={sessionConfig} onSave={saveSessionConfig} />}
        {tab === 'integrations' && <IntegrationsTab />}
        {tab === 'tabulation'   && <TabulationTab canManage={canManage} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// USERS TAB
// ═══════════════════════════════════════════════════════════════════════════
function UsersTab({ canManage }: { canManage: boolean }) {
  const { user: currentUser, users, addUser, updateUser, deleteUser } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', email: '', login: '', role: 'operator' as UserRole });

  const openAdd  = () => { setEditing(null); setForm({ name: '', email: '', login: '', role: 'operator' }); setShowModal(true); };
  const openEdit = (u: User) => { setEditing(u); setForm({ name: u.name, email: u.email, login: u.login, role: u.role }); setShowModal(true); };

  const canAct = (u: User) => {
    if (u.id === currentUser?.id) return false;
    if (currentUser?.role === 'superadmin') return true;
    if (currentUser?.role === 'admin' && u.role === 'operator') return true;
    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) updateUser(editing.id, form);
    else addUser({ ...form, password: '12345678', firstAccess: true, twoFactorEnabled: false, active: true });
    setShowModal(false);
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{users.length} usuário(s)</p>
        {canManage && (
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md">
            <Plus size={16} />Novo usuário
          </button>
        )}
      </div>

      {users.map((u) => (
        <div key={u.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-center shrink-0">
              <span className="text-primary-700 font-bold text-sm">
                {u.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-slate-800">{u.name}</p>
                <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_CFG[u.role].color)}>
                  {ROLE_CFG[u.role].label}
                </span>
                {!u.active    && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Inativo</span>}
                {u.firstAccess && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">1º acesso</span>}
                {u.twoFactorEnabled && <span className="text-xs px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 flex items-center gap-1"><Shield size={10} />2FA</span>}
                {u.id === currentUser?.id && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">você</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span>{u.email}</span>
                <code className="text-slate-400">{u.login}</code>
                <span>desde {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true, locale: ptBR })}</span>
              </div>
            </div>
          </div>
          {canAct(u) && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => updateUser(u.id, { active: !u.active })}
                className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  u.active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-accent-50 text-accent-700 hover:bg-accent-100')}>
                {u.active ? 'Desativar' : 'Ativar'}
              </button>
              <button onClick={() => openEdit(u)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center transition">
                <Edit3 size={16} />
              </button>
              {currentUser?.role === 'superadmin' && (
                <button onClick={() => deleteUser(u.id)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {showModal && (
        <UserModal
          editing={editing}
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
          currentRole={currentUser?.role ?? 'operator'}
        />
      )}
    </div>
  );
}

function UserModal({ editing, form, setForm, onSubmit, onClose, currentRole }: {
  editing: User | null;
  form: { name: string; email: string; login: string; role: UserRole };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  currentRole: UserRole;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{editing ? 'Editar usuário' : 'Novo usuário'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="field-label">Nome completo</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input" />
          </div>
          <div>
            <label className="field-label">E-mail</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="input" />
          </div>
          <div>
            <label className="field-label">Login</label>
            <input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required className="input font-mono" />
          </div>
          <div>
            <label className="field-label">Perfil</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className="input">
              {currentRole === 'superadmin' && <option value="superadmin">Super Admin</option>}
              {currentRole !== 'operator'   && <option value="admin">Admin</option>}
              <option value="operator">Operador</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">{ROLE_CFG[form.role].desc}</p>
          </div>
          {!editing && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs text-blue-700">
                Senha inicial: <code className="font-mono font-bold">12345678</code> — o usuário deverá alterá-la no primeiro acesso.
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button type="submit" className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition">
              {editing ? 'Salvar' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUPS TAB
// ═══════════════════════════════════════════════════════════════════════════
function GroupsTab({ canManage }: { canManage: boolean }) {
  const { users } = useAuth();
  const { groups, addGroup, updateGroup, deleteGroup } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<AttendanceGroup | null>(null);
  const [form, setForm]           = useState({ name: '', description: '', memberIds: [] as string[] });

  const openAdd  = () => { setEditing(null); setForm({ name: '', description: '', memberIds: [] }); setShowModal(true); };
  const openEdit = (g: AttendanceGroup) => { setEditing(g); setForm({ name: g.name, description: g.description ?? '', memberIds: g.memberIds }); setShowModal(true); };

  const toggleMember = (uid: string) =>
    setForm(f => ({ ...f, memberIds: f.memberIds.includes(uid) ? f.memberIds.filter(id => id !== uid) : [...f.memberIds, uid] }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) updateGroup(editing.id, form);
    else addGroup(form);
    setShowModal(false);
  };

  const activeUsers = users.filter(u => u.active);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{groups.length} grupo(s) de atendimento</p>
        {canManage && (
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md">
            <Plus size={16} /> Novo grupo
          </button>
        )}
      </div>

      {groups.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 flex flex-col items-center text-slate-400 gap-3">
          <UsersRound size={36} strokeWidth={1.5} />
          <p className="text-sm">Nenhum grupo criado. Crie grupos para organizar os atendimentos por departamento.</p>
        </div>
      )}

      {groups.map(g => {
        const members = activeUsers.filter(u => g.memberIds.includes(u.id));
        return (
          <div key={g.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                <UsersRound size={20} className="text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{g.name}</p>
                {g.description && <p className="text-sm text-slate-500 mt-0.5">{g.description}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {members.length === 0
                    ? <span className="text-xs text-orange-500">Nenhum membro</span>
                    : members.map(u => (
                      <span key={u.id} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                        {u.name}
                      </span>
                    ))}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {members.length} membro(s) · criado {formatDistanceToNow(new Date(g.createdAt), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => openEdit(g)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center transition">
                  <Edit3 size={16} />
                </button>
                <button onClick={() => deleteGroup(g.id)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-slate-800">{editing ? 'Editar grupo' : 'Novo grupo de atendimento'}</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="field-label">Nome do grupo</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  required className="input" placeholder="Ex: Suporte Técnico, Vendas..." autoFocus />
              </div>
              <div>
                <label className="field-label">Descrição <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="input" placeholder="Finalidade do grupo..." />
              </div>
              <div>
                <label className="field-label">Membros</label>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {activeUsers.map(u => (
                    <label key={u.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition">
                      <input type="checkbox" checked={form.memberIds.includes(u.id)}
                        onChange={() => toggleMember(u.id)}
                        className="w-4 h-4 rounded accent-primary-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_CFG[u.role].color)}>
                        {ROLE_CFG[u.role].label}
                      </span>
                    </label>
                  ))}
                  {activeUsers.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-6">Nenhum usuário ativo</p>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">{form.memberIds.length} membro(s) selecionado(s)</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={!form.name.trim()}
                  className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition">
                  {editing ? 'Salvar' : 'Criar grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY TAB (real TOTP)
// ═══════════════════════════════════════════════════════════════════════════
type TwoFAStep = 'idle' | 'setup' | 'confirm' | 'done' | 'disable';

function SecurityTab() {
  const { user: currentUser, setup2FA, confirm2FA, disable2FA } = useAuth();
  const [step, setStep] = useState<TwoFAStep>('idle');
  const [secretBuf, setSecretBuf] = useState('');
  const [uriBuf, setUriBuf]       = useState('');
  const [code, setCode]           = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const startSetup = () => {
    const { secret, uri } = setup2FA();
    setSecretBuf(secret);
    setUriBuf(uri);
    setCode('');
    setError('');
    setStep('setup');
  };

  const handleConfirm = () => {
    setError('');
    setLoading(true);
    // small timeout to let UI breathe
    setTimeout(() => {
      const ok = confirm2FA(secretBuf, code);
      setLoading(false);
      if (ok) setStep('done');
      else setError('Código inválido. Verifique o app autenticador e tente novamente.');
    }, 300);
  };

  const handleDisable = () => {
    setError('');
    setLoading(true);
    setTimeout(() => {
      const ok = disable2FA(code);
      setLoading(false);
      if (ok) { setStep('idle'); setCode(''); }
      else setError('Código inválido.');
    }, 300);
  };

  return (
    <div className="max-w-xl space-y-5">
      {/* 2FA Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
            <KeyRound size={22} className="text-primary-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-800 mb-0.5">Autenticação de dois fatores (2FA)</h3>
            <p className="text-sm text-slate-500 mb-4">
              Use um app TOTP como <strong>Google Authenticator</strong>, <strong>Authy</strong> ou <strong>1Password</strong>.
            </p>

            {step === 'idle' && !currentUser?.twoFactorEnabled && (
              <button onClick={startSetup}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition">
                Ativar 2FA
              </button>
            )}

            {step === 'idle' && currentUser?.twoFactorEnabled && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-accent-600">
                  <CheckCircle size={18} />
                  <span className="text-sm font-medium">2FA ativado nesta conta</span>
                </div>
                <button onClick={() => { setStep('disable'); setCode(''); setError(''); }}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition">
                  Desativar 2FA
                </button>
              </div>
            )}

            {step === 'setup' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 font-medium">1. Escaneie o QR code com seu app:</p>
                <div className="flex justify-center">
                  <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl inline-block shadow-sm">
                    <QRCodeSVG value={uriBuf} size={180} />
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Ou insira a chave manualmente no app:</p>
                  <code className="text-sm text-primary-700 font-mono tracking-widest break-all">{secretBuf}</code>
                </div>
                <p className="text-sm text-slate-600 font-medium">2. Digite o código de 6 dígitos gerado:</p>
                <TotpInput value={code} onChange={setCode} />
                {error && <ErrorBanner msg={error} />}
                <div className="flex gap-3">
                  <button onClick={() => setStep('idle')} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                  <button onClick={handleConfirm} disabled={code.length !== 6 || loading}
                    className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2">
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    Confirmar e ativar
                  </button>
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="text-center space-y-3">
                <CheckCircle size={40} className="text-accent-500 mx-auto" />
                <p className="font-semibold text-slate-800">2FA ativado com sucesso!</p>
                <p className="text-sm text-slate-500">Na próxima vez que fizer login, precisará inserir o código do app.</p>
                <button onClick={() => setStep('idle')} className="px-5 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium">Concluir</button>
              </div>
            )}

            {step === 'disable' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">Insira o código do seu app para confirmar a desativação:</p>
                <TotpInput value={code} onChange={setCode} />
                {error && <ErrorBanner msg={error} />}
                <div className="flex gap-3">
                  <button onClick={() => setStep('idle')} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                  <button onClick={handleDisable} disabled={code.length !== 6 || loading}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2">
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    Confirmar desativação
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Password policy card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent-100 flex items-center justify-center shrink-0">
            <Shield size={22} className="text-accent-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 mb-2">Políticas de senha</h3>
            <ul className="text-sm text-slate-500 space-y-1.5">
              <li className="flex items-center gap-2"><CheckCircle size={14} className="text-accent-500" />Mínimo de 8 caracteres</li>
              <li className="flex items-center gap-2"><CheckCircle size={14} className="text-accent-500" />Senha padrão obrigatoriamente alterada no 1º acesso</li>
              <li className="flex items-center gap-2"><CheckCircle size={14} className="text-accent-500" />Recomendado: maiúsculas + números + símbolos</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION TAB
// ═══════════════════════════════════════════════════════════════════════════
function SessionTab({ config, onSave }: { config: SessionConfig; onSave: (c: SessionConfig) => void }) {
  const [form, setForm] = useState<SessionConfig>(config);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const minToLabel = (m: number) => {
    if (m < 60)  return `${m} minutos`;
    const h = m / 60;
    return Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h ${m % 60}min`;
  };

  const presets = [30, 60, 120, 240, 480, 720, 1440];

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
            <Clock size={22} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Tempo de sessão ativa</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Define por quanto tempo um usuário permanece logado após fechar o navegador. A sessão é verificada a cada reabertura.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {(Object.entries(form) as [keyof SessionConfig, number][]).map(([role, mins]) => (
            <div key={role} className="flex items-start gap-4">
              <div className="w-28 shrink-0">
                <span className={clsx('text-xs px-2 py-1 rounded-lg font-semibold', ROLE_CFG[role].color)}>
                  {ROLE_CFG[role].label}
                </span>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={30} max={1440} step={30}
                    value={mins}
                    onChange={(e) => setForm({ ...form, [role]: Number(e.target.value) })}
                    className="flex-1 accent-primary-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 w-20 text-right shrink-0">
                    {minToLabel(mins)}
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {presets.map((p) => (
                    <button key={p} type="button"
                      onClick={() => setForm({ ...form, [role]: p })}
                      className={clsx('px-2 py-0.5 rounded-md text-xs transition',
                        mins === p ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                      {minToLabel(p)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div className="pt-2 flex items-center gap-3">
            <button type="submit"
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition flex items-center gap-2">
              {saved ? <CheckCircle size={15} /> : null}
              {saved ? 'Salvo!' : 'Salvar configurações'}
            </button>
            <p className="text-xs text-slate-400">
              Alterações aplicam-se ao próximo login de cada perfil.
            </p>
          </div>
        </form>
      </div>

      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex gap-3">
        <AlertCircle size={18} className="text-yellow-600 shrink-0 mt-0.5" />
        <div className="text-xs text-yellow-700">
          <p className="font-semibold mb-0.5">Sobre a segurança da sessão</p>
          <p>A sessão é armazenada de forma criptografada no navegador do usuário. Ao expirar, o usuário é redirecionado para o login automaticamente. Recomenda-se tempos menores para operadores que acessam de dispositivos compartilhados.</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATIONS TAB
// ═══════════════════════════════════════════════════════════════════════════
function IntegrationsTab() {
  const [token,    setToken]    = useState('');
  const [showTok,  setShowTok]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');
  const [isConfigured, setIsConfigured] = useState(false);

  // Verifica se já há token configurado no servidor
  useEffect(() => {
    apiFetch(`${SERVER_URL}/api/config`)
      .then(r => r.json())
      .then(d => setIsConfigured(!!d.mercadoPagoConfigured))
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) { setError('Cole o Access Token do Mercado Pago.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch(`${SERVER_URL}/api/config`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mercadoPagoToken: token.trim() }),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      setIsConfigured(true);
      setToken('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Erro ao salvar o token. Verifique se o servidor está online.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remover o token do Mercado Pago?')) return;
    await apiFetch(`${SERVER_URL}/api/config`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mercadoPagoToken: '' }),
    }).catch(() => {});
    setIsConfigured(false);
    setSaved(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Integrações</h2>
        <p className="text-sm text-slate-500 mt-0.5">Conecte serviços externos para expandir as funcionalidades da plataforma.</p>
      </div>

      {/* Card Mercado Pago */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center shrink-0 text-xl">💳</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800">Mercado Pago — PIX</h3>
              {isConfigured ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Configurado ✓</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Não configurado</span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Gere cobranças PIX com QR Code diretamente na tela de atendimento e envie ao cliente via WhatsApp.
            </p>
          </div>
        </div>

        {isConfigured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
              <CheckCircle size={15} className="shrink-0" />
              Access Token configurado com sucesso. O botão PIX já está disponível nas conversas.
            </div>
            <button
              onClick={handleRemove}
              className="text-xs text-red-500 hover:text-red-700 hover:underline transition"
            >
              Remover token
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Access Token de Produção
              </label>
              <div className="relative">
                <input
                  type={showTok ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="APP_USR-0000000000000000-000000-xxxxxxxx..."
                  className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowTok(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showTok ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Obtenha em{' '}
                <a href="https://www.mercadopago.com.br/developers" target="_blank" rel="noreferrer"
                  className="text-primary-600 hover:underline">
                  mercadopago.com.br/developers
                </a>
                {' '}→ Suas integrações → Credenciais de produção → Access Token.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" />Salvando…</>
                : saved
                ? <><CheckCircle size={14} />Salvo!</>
                : 'Salvar token'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABULATION TAB
// ═══════════════════════════════════════════════════════════════════════════
const FIELD_TYPE_LABELS: Record<TabulationFieldType, string> = {
  select:      'Seleção',
  text:        'Texto',
  textarea:    'Área de texto',
  number:      'Número',
  pod_product: 'Produto Pod Sales',
};

const EMPTY_FIELD = (): TabulationField => ({
  id:       `f_${Date.now()}`,
  label:    '',
  type:     'text',
  required: false,
  options:  [],
});

function TabulationTab({ canManage }: { canManage: boolean }) {
  const { tabulationConfigs, saveTabulationConfig, addTabulationConfig, deleteTabulationConfig, channels } = useApp();
  // null = list view; string = editing that config id
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingCfg = editingId ? tabulationConfigs.find(c => c.id === editingId) ?? null : null;

  const handleCreate = async () => {
    await addTabulationConfig({
      name: 'Nova tabulação',
      channelIds: [],
      enabled: true,
      fields: [],
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta tabulação?')) return;
    await deleteTabulationConfig(id);
    if (editingId === id) setEditingId(null);
  };

  if (editingCfg) {
    return (
      <TabulationConfigEditor
        cfg={editingCfg}
        channels={channels}
        canManage={canManage}
        onSave={async (updated) => { await saveTabulationConfig(updated); setEditingId(null); }}
        onBack={() => setEditingId(null)}
        onDelete={() => handleDelete(editingCfg.id)}
      />
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {tabulationConfigs.length} tabulação(ões) configurada(s)
        </p>
        {canManage && (
          <button onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md">
            <Plus size={16} /> Nova tabulação
          </button>
        )}
      </div>

      {tabulationConfigs.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 flex flex-col items-center text-slate-400 gap-3">
          <ClipboardList size={36} strokeWidth={1.5} />
          <p className="text-sm text-center">
            Nenhuma tabulação. Crie uma para coletar informações ao encerrar conversas.
          </p>
        </div>
      )}

      {tabulationConfigs.map(cfg => {
        const channelNames = (cfg.channelIds ?? [])
          .map(id => channels.find(c => c.id === id)?.name ?? id)
          .filter(Boolean);

        return (
          <div key={cfg.id}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start justify-between gap-4 hover:border-primary-200 transition cursor-pointer group"
            onClick={() => setEditingId(cfg.id)}
          >
            <div className="flex items-start gap-4 min-w-0">
              <div className={clsx(
                'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
                cfg.enabled ? 'bg-primary-100' : 'bg-slate-100'
              )}>
                <ClipboardList size={20} className={cfg.enabled ? 'text-primary-600' : 'text-slate-400'} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-800">{cfg.name}</p>
                  <span className={clsx(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    cfg.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  )}>
                    {cfg.enabled ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cfg.fields.length} campo(s)
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {channelNames.length === 0 ? (
                    <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Hash size={10} /> Fallback global
                    </span>
                  ) : channelNames.map(name => (
                    <span key={name} className="text-xs bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 rounded-full">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition" onClick={e => e.stopPropagation()}>
                <button onClick={() => setEditingId(cfg.id)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center transition">
                  <Edit3 size={16} />
                </button>
                <button onClick={() => handleDelete(cfg.id)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Editor completo de uma tabulação ────────────────────────────────────────
function TabulationConfigEditor({
  cfg: initialCfg, channels, canManage, onSave, onBack, onDelete,
}: {
  cfg: TabulationConfig;
  channels: import('../types').Channel[];
  canManage: boolean;
  onSave: (cfg: TabulationConfig) => Promise<void>;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [cfg,     setCfg]     = useState<TabulationConfig>(initialCfg);
  const [editing, setEditing] = useState<TabulationField | null>(null);
  const [saved,   setSaved]   = useState(false);
  const [saving,  setSaving]  = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(cfg);
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const fields = [...cfg.fields];
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    [fields[idx], fields[target]] = [fields[target], fields[idx]];
    setCfg(c => ({ ...c, fields }));
  };

  const removeField = (id: string) => setCfg(c => ({ ...c, fields: c.fields.filter(f => f.id !== id) }));

  const saveField = (f: TabulationField) => {
    setCfg(c => {
      const exists = c.fields.some(x => x.id === f.id);
      return { ...c, fields: exists ? c.fields.map(x => x.id === f.id ? f : x) : [...c.fields, f] };
    });
    setEditing(null);
  };

  const toggleChannel = (channelId: string) => {
    setCfg(c => {
      const ids = c.channelIds ?? [];
      return {
        ...c,
        channelIds: ids.includes(channelId) ? ids.filter(id => id !== channelId) : [...ids, channelId],
      };
    });
  };

  const otherSelectFields = cfg.fields.filter(f => f.type === 'select' && f.id !== editing?.id);

  return (
    <div className="max-w-2xl space-y-5">
      {/* Breadcrumb */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-primary-600 transition -mb-1">
        <ArrowLeft size={16} /> Voltar às tabulações
      </button>

      {/* Nome + ativar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Nome da tabulação</label>
            <input
              value={cfg.name}
              onChange={e => setCfg(c => ({ ...c, name: e.target.value }))}
              disabled={!canManage}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Ex: Pod Sales, Suporte, Vendas..."
            />
          </div>
          <button
            onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
            className="flex items-center gap-2 text-sm font-medium transition shrink-0"
          >
            {cfg.enabled
              ? <ToggleRight size={32} className="text-primary-600" />
              : <ToggleLeft  size={32} className="text-slate-300" />}
            <span className={cfg.enabled ? 'text-primary-700' : 'text-slate-400'}>
              {cfg.enabled ? 'Ativo' : 'Inativo'}
            </span>
          </button>
        </div>
      </div>

      {/* Canais vinculados */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
            <Hash size={17} className="text-sky-600" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-700 text-sm">Canais vinculados</h4>
            <p className="text-xs text-slate-500">
              Selecione para quais canais esta tabulação será exibida. Sem seleção = fallback global.
            </p>
          </div>
        </div>
        <div className="p-4 space-y-2">
          {channels.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nenhum canal cadastrado.</p>
          ) : channels.map(ch => {
            const checked = (cfg.channelIds ?? []).includes(ch.id);
            return (
              <label key={ch.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-50 transition border border-transparent hover:border-slate-100">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleChannel(ch.id)}
                  disabled={!canManage}
                  className="w-4 h-4 rounded accent-primary-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{ch.name}</p>
                  <p className="text-xs text-slate-500">{ch.phoneNumber || ch.evolutionInstanceName || '—'}</p>
                </div>
                {checked && (
                  <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">vinculado</span>
                )}
              </label>
            );
          })}
          {(cfg.channelIds ?? []).length === 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-1">
              <AlertCircle size={13} className="shrink-0" />
              Nenhum canal selecionado — esta tabulação será usada como fallback global para canais sem tabulação específica.
            </div>
          )}
        </div>
      </div>

      {/* Campos */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h4 className="font-semibold text-slate-700 text-sm">Campos do formulário</h4>
          {canManage && (
            <button
              onClick={() => setEditing(EMPTY_FIELD())}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition"
            >
              <Plus size={14} /> Novo campo
            </button>
          )}
        </div>

        {cfg.fields.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Nenhum campo configurado. Clique em "Novo campo" para começar.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {cfg.fields.map((field, idx) => (
              <div key={field.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group">
                <GripVertical size={15} className="text-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-slate-700 truncate">{field.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                      {FIELD_TYPE_LABELS[field.type]}
                    </span>
                    {field.required && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium">Obrigatório</span>
                    )}
                    {field.showWhen && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium truncate max-w-[200px]">
                        Se "{cfg.fields.find(f => f.id === field.showWhen!.fieldId)?.label ?? field.showWhen.fieldId}" = "{field.showWhen.value}"
                      </span>
                    )}
                  </div>
                  {field.type === 'select' && field.options && field.options.length > 0 && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {field.options.join(' · ')}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20">
                      <ChevronUp size={14} />
                    </button>
                    <button onClick={() => move(idx, 1)} disabled={idx === cfg.fields.length - 1}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20">
                      <ChevronDown size={14} />
                    </button>
                    <button onClick={() => setEditing(field)}
                      className="p-1 rounded text-slate-400 hover:text-primary-600">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => removeField(field.id)}
                      className="p-1 rounded text-slate-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* IA */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-purple-600" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-700 text-sm">Análise por IA <span className="text-slate-400 font-normal text-xs ml-1">(opcional)</span></h4>
            <p className="text-xs text-slate-500">A IA lê a conversa e pré-preenche os campos antes do operador confirmar</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Provedor de IA</label>
            <select
              value={cfg.aiConfig?.provider ?? ''}
              onChange={e => {
                const p = e.target.value as TabulationAIProvider | '';
                setCfg(c => ({
                  ...c,
                  aiConfig: p ? { provider: p, apiKey: c.aiConfig?.apiKey ?? '', model: c.aiConfig?.model } : undefined,
                }));
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Não usar IA</option>
              <option value="openai">OpenAI (GPT)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>
          {cfg.aiConfig?.provider && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">API Key</label>
                <AIKeyInput
                  value={cfg.aiConfig.apiKey}
                  onChange={v => setCfg(c => ({ ...c, aiConfig: { ...c.aiConfig!, apiKey: v } }))}
                  placeholder={cfg.aiConfig.provider === 'openai' ? 'sk-...' : cfg.aiConfig.provider === 'anthropic' ? 'sk-ant-...' : 'AIza...'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Modelo <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={cfg.aiConfig.model ?? ''}
                  onChange={e => setCfg(c => ({ ...c, aiConfig: { ...c.aiConfig!, model: e.target.value || undefined } }))}
                  placeholder={cfg.aiConfig.provider === 'openai' ? 'Padrão: gpt-4o-mini' : cfg.aiConfig.provider === 'anthropic' ? 'Padrão: claude-haiku-4-5' : 'Padrão: gemini-1.5-flash'}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                🔒 A API Key é armazenada apenas no servidor e nunca exposta ao navegador.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Ações */}
      {canManage && (
        <div className="flex items-center justify-between">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition shadow-sm">
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle size={15} /> : null}
            {saved ? 'Salvo!' : 'Salvar configuração'}
          </button>
          <button onClick={onDelete}
            className="flex items-center gap-2 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-xl text-sm transition">
            <Trash2 size={15} /> Excluir tabulação
          </button>
        </div>
      )}

      {editing && (
        <FieldEditor
          field={editing}
          selectFields={otherSelectFields}
          onSave={saveField}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ─── AI Key Input (show/hide) ────────────────────────────────────────────────
function AIKeyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pr-10 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

// ─── Editor de campo ──────────────────────────────────────────────────────────
function FieldEditor({
  field, selectFields, onSave, onClose,
}: {
  field: TabulationField;
  selectFields: TabulationField[];
  onSave: (f: TabulationField) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<TabulationField>({ ...field, options: field.options ?? [] });
  const [newOption, setNewOption] = useState('');
  const [err, setErr] = useState('');

  const setField = (patch: Partial<TabulationField>) => setF(prev => ({ ...prev, ...patch }));

  const addOption = () => {
    const v = newOption.trim();
    if (!v) return;
    if (f.options?.includes(v)) return;
    setField({ options: [...(f.options ?? []), v] });
    setNewOption('');
  };

  const removeOption = (o: string) => setField({ options: f.options?.filter(x => x !== o) });

  const handleSave = () => {
    if (!f.label.trim()) { setErr('Informe o rótulo do campo.'); return; }
    if (f.type === 'select' && (!f.options || f.options.length < 1)) { setErr('Adicione ao menos uma opção.'); return; }
    onSave({ ...f, label: f.label.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">
            {field.label ? 'Editar campo' : 'Novo campo'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Rótulo */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Rótulo *</label>
            <input
              type="text" value={f.label}
              onChange={e => setField({ label: e.target.value })}
              placeholder="Ex: Resultado do atendimento"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
            <select
              value={f.type}
              onChange={e => setField({ type: e.target.value as TabulationFieldType, options: e.target.value === 'select' ? (f.options ?? []) : [] })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {(Object.entries(FIELD_TYPE_LABELS) as [TabulationFieldType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Opções (select) */}
          {f.type === 'select' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Opções *</label>
              <div className="space-y-1.5 mb-2">
                {f.options?.map(o => (
                  <div key={o} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 text-sm">
                    <span className="flex-1 text-slate-700">{o}</span>
                    <button onClick={() => removeOption(o)} className="text-slate-400 hover:text-red-500">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text" value={newOption}
                  onChange={e => setNewOption(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  placeholder="Nova opção…"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={addOption}
                  className="px-3 py-2 bg-primary-600 text-white rounded-xl text-sm hover:bg-primary-700 transition"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Placeholder */}
          {f.type !== 'select' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Placeholder</label>
              <input
                type="text" value={f.placeholder ?? ''}
                onChange={e => setField({ placeholder: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          {/* Obrigatório */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setField({ required: !f.required })}
              className={clsx(
                'w-10 h-5.5 rounded-full transition relative cursor-pointer',
                f.required ? 'bg-primary-600' : 'bg-slate-200'
              )}
              style={{ height: '22px', width: '40px' }}
            >
              <span className={clsx(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                f.required ? 'left-5' : 'left-0.5'
              )} />
            </div>
            <span className="text-sm text-slate-700">Campo obrigatório</span>
          </label>

          {/* Exibição condicional */}
          {selectFields.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Exibir somente quando <span className="text-slate-400">(opcional)</span>
              </label>
              <div className="flex gap-2">
                <select
                  value={f.showWhen?.fieldId ?? ''}
                  onChange={e => setField({ showWhen: e.target.value ? { fieldId: e.target.value, value: f.showWhen?.value ?? '' } : undefined })}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Sempre exibir</option>
                  {selectFields.map(sf => (
                    <option key={sf.id} value={sf.id}>{sf.label}</option>
                  ))}
                </select>
                {f.showWhen && (
                  <select
                    value={f.showWhen.value}
                    onChange={e => setField({ showWhen: { ...f.showWhen!, value: e.target.value } })}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Selecione…</option>
                    {selectFields.find(sf => sf.id === f.showWhen?.fieldId)?.options?.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {err && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
              <AlertCircle size={13} /> {err}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition">
            Salvar campo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared small components ──────────────────────────────────────────────────
function TotpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text" inputMode="numeric" value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className="w-full text-center text-2xl tracking-[0.5em] py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition font-mono"
      placeholder="000000" maxLength={6}
      autoFocus
    />
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
      <AlertCircle size={15} className="shrink-0" />{msg}
    </div>
  );
}
