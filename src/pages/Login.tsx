import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Shield, Smartphone, Lock, User, AlertCircle, CheckCircle } from 'lucide-react';

type LoginStep = 'credentials' | 'change_password' | '2fa';

export default function Login() {
  const { login, changePassword, verify2FA, requirePasswordChange, require2FA } = useAuth();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [loginVal, setLoginVal] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(loginVal, password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Erro ao fazer login');
      return;
    }
    if (requirePasswordChange) setStep('change_password');
    else if (require2FA) setStep('2fa');
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (newPassword === '12345678') {
      setError('Use uma senha diferente da senha padrão.');
      return;
    }
    changePassword(newPassword);
  };

  const handle2FA = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = verify2FA(twoFACode);
    if (!ok) setError('Código inválido. Tente novamente.');
  };

  const passwordStrength = (p: string) => {
    if (p.length === 0) return null;
    if (p.length < 6) return { level: 1, label: 'Fraca', color: 'bg-red-500' };
    if (p.length < 8) return { level: 2, label: 'Regular', color: 'bg-yellow-500' };
    if (/[A-Z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) return { level: 4, label: 'Forte', color: 'bg-accent-500' };
    return { level: 3, label: 'Boa', color: 'bg-primary-500' };
  };

  const strength = passwordStrength(newPassword);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      {/* Header bar */}
      <div className="bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-accent-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">NC</span>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium tracking-wider uppercase">Iniciativa - Next Gen</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Shield size={14} className="text-accent-500" />
          <span>Conexão segura</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-600 to-accent-500 rounded-2xl shadow-lg mb-4">
              <span className="text-white font-bold text-2xl">N</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
              Nex<span className="text-primary-600">-Chat</span>
            </h1>
            <p className="text-slate-500 mt-1 text-sm">Plataforma de atendimento inteligente</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            {step === 'credentials' && (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-slate-800">Bem-vindo de volta</h2>
                  <p className="text-slate-500 text-sm mt-1">Faça login para continuar</p>
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Login ou E-mail</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={loginVal}
                        onChange={(e) => setLoginVal(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                        placeholder="seu.login ou email@exemplo.com"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                        placeholder="••••••••"
                        required
                      />
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                      <AlertCircle size={16} className="shrink-0" />
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white py-2.5 rounded-xl font-medium text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-60"
                  >
                    {loading ? 'Entrando...' : 'Entrar'}
                  </button>
                </form>
              </>
            )}

            {step === 'change_password' && (
              <>
                <div className="mb-6">
                  <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center mb-3">
                    <Lock size={20} className="text-yellow-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-800">Redefinir senha</h2>
                  <p className="text-slate-500 text-sm mt-1">Por segurança, defina uma nova senha no primeiro acesso.</p>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Nova senha</label>
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                        placeholder="Mínimo 8 caracteres"
                        required
                      />
                      <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {strength && (
                      <div className="mt-2">
                        <div className="flex gap-1">
                          {[1,2,3,4].map((i) => (
                            <div key={i} className={`h-1 flex-1 rounded-full ${i <= strength.level ? strength.color : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <p className={`text-xs mt-1 ${strength.level >= 3 ? 'text-accent-600' : 'text-slate-500'}`}>{strength.label}</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar senha</label>
                    <div className="relative">
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-4 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                        placeholder="Repita a nova senha"
                        required
                      />
                      {confirmPassword && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {confirmPassword === newPassword
                            ? <CheckCircle size={16} className="text-accent-500" />
                            : <AlertCircle size={16} className="text-red-500" />}
                        </div>
                      )}
                    </div>
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                      <AlertCircle size={16} className="shrink-0" />
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white py-2.5 rounded-xl font-medium text-sm transition-all shadow-md hover:shadow-lg"
                  >
                    Redefinir senha e entrar
                  </button>
                </form>
              </>
            )}

            {step === '2fa' && (
              <>
                <div className="mb-6">
                  <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center mb-3">
                    <Smartphone size={20} className="text-primary-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-800">Autenticação de 2 fatores</h2>
                  <p className="text-slate-500 text-sm mt-1">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
                </div>
                <form onSubmit={handle2FA} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      value={twoFACode}
                      onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full text-center text-2xl tracking-[0.5em] py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                      placeholder="000000"
                      maxLength={6}
                      required
                    />
                    <p className="text-xs text-slate-400 text-center mt-2">Digite o código de 6 dígitos gerado pelo seu app autenticador.</p>
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white py-2.5 rounded-xl font-medium text-sm transition-all shadow-md"
                  >
                    Verificar
                  </button>
                  <button type="button" onClick={() => setStep('credentials')} className="w-full text-slate-500 text-sm hover:text-slate-700 transition">
                    Voltar ao login
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            © {new Date().getFullYear()} Iniciativa - Next Gen · Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
