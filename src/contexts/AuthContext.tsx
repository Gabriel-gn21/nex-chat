import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User, AuthState, SessionConfig, DEFAULT_SESSION_CONFIG } from '../types';
import { INITIAL_USERS } from '../data/mockData';
import { generateTOTPSecret, getTOTPUri, validateTOTP } from '../utils/totp';

// ─── Storage keys ────────────────────────────────────────────────────────────
const USERS_KEY = 'nex_users';
const SESSION_KEY = 'nex_session';            // persisted across browser closes
const SESSION_CFG_KEY = 'nex_session_cfg';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const saveJSON = (key: string, value: unknown) =>
  localStorage.setItem(key, JSON.stringify(value));

const loadUsers = (): User[] => {
  const stored = loadJSON<User[]>(USERS_KEY, []);
  if (stored.length === 0) {
    saveJSON(USERS_KEY, INITIAL_USERS);
    return INITIAL_USERS;
  }
  return stored;
};

interface StoredSession {
  user: User;
  expiresAt: string; // ISO
}

const isSessionValid = (s: StoredSession): boolean =>
  new Date(s.expiresAt) > new Date();

const buildExpiry = (role: User['role'], cfg: SessionConfig): string => {
  const mins = cfg[role] ?? 120;
  return new Date(Date.now() + mins * 60_000).toISOString();
};

// ─── Context type ─────────────────────────────────────────────────────────────
interface AuthContextType extends AuthState {
  login: (loginOrEmail: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  changePassword: (newPassword: string) => void;
  /** Returns null if already authed without 2FA, or pending user for 2FA */
  verify2FA: (code: string) => boolean;
  /** Generates a new TOTP secret for the current user and returns the otpauth URI */
  setup2FA: () => { secret: string; uri: string };
  /** Validate the first code from the authenticator app and save the secret */
  confirm2FA: (secret: string, code: string) => boolean;
  /** Disable 2FA after confirming identity */
  disable2FA: (code: string) => boolean;
  sessionConfig: SessionConfig;
  saveSessionConfig: (cfg: SessionConfig) => void;
  users: User[];
  addUser: (u: Omit<User, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>(loadUsers);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>(() =>
    loadJSON(SESSION_CFG_KEY, DEFAULT_SESSION_CONFIG)
  );

  // ── Restore persisted session ───────────────────────────────────────────
  const [authState, setAuthState] = useState<AuthState>(() => {
    const stored = loadJSON<StoredSession | null>(SESSION_KEY, null);
    if (stored && isSessionValid(stored)) {
      const u = stored.user;
      return {
        user: u,
        isAuthenticated: true,
        requirePasswordChange: false,
        require2FA: false,
      };
    }
    return { user: null, isAuthenticated: false, requirePasswordChange: false, require2FA: false };
  });

  // ── Persist session changes ─────────────────────────────────────────────
  const persistSession = useCallback(
    (user: User) => {
      const session: StoredSession = {
        user,
        expiresAt: buildExpiry(user.role, sessionConfig),
      };
      saveJSON(SESSION_KEY, session);
    },
    [sessionConfig]
  );

  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
  }, []);

  // ── Expiry check on focus / visibility ─────────────────────────────────
  useEffect(() => {
    const check = () => {
      if (!authState.isAuthenticated) return;
      const stored = loadJSON<StoredSession | null>(SESSION_KEY, null);
      if (!stored || !isSessionValid(stored)) {
        setAuthState({ user: null, isAuthenticated: false, requirePasswordChange: false, require2FA: false });
        clearSession();
      }
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [authState.isAuthenticated, clearSession]);

  // ── Login ───────────────────────────────────────────────────────────────
  const login = useCallback(
    async (loginOrEmail: string, password: string) => {
      const found = users.find(
        (u) =>
          (u.login === loginOrEmail || u.email === loginOrEmail) &&
          u.password === password &&
          u.active
      );
      if (!found) return { success: false, error: 'Credenciais inválidas ou usuário inativo.' };

      const newState: AuthState = {
        user: found,
        isAuthenticated: !found.twoFactorEnabled && !found.firstAccess,
        requirePasswordChange: found.firstAccess,
        require2FA: found.twoFactorEnabled,
      };
      setAuthState(newState);

      // Persist only when fully authenticated (no 2FA / no first-access pending)
      if (newState.isAuthenticated) persistSession(found);
      return { success: true };
    },
    [users, persistSession]
  );

  // ── Logout ─────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setAuthState({ user: null, isAuthenticated: false, requirePasswordChange: false, require2FA: false });
    clearSession();
  }, [clearSession]);

  // ── Change password (first access) ─────────────────────────────────────
  const changePassword = useCallback(
    (newPassword: string) => {
      if (!authState.user) return;
      const updated = users.map((u) =>
        u.id === authState.user!.id ? { ...u, password: newPassword, firstAccess: false } : u
      );
      setUsers(updated);
      saveJSON(USERS_KEY, updated);
      const updatedUser = { ...authState.user, password: newPassword, firstAccess: false };
      const newState: AuthState = {
        user: updatedUser,
        isAuthenticated: !updatedUser.twoFactorEnabled,
        requirePasswordChange: false,
        require2FA: updatedUser.twoFactorEnabled,
      };
      setAuthState(newState);
      if (newState.isAuthenticated) persistSession(updatedUser);
    },
    [authState.user, users, persistSession]
  );

  // ── Verify 2FA at login ─────────────────────────────────────────────────
  const verify2FA = useCallback(
    (code: string): boolean => {
      if (!authState.user?.twoFactorSecret) return false;
      const ok = validateTOTP(authState.user.twoFactorSecret, code);
      if (ok) {
        const newState: AuthState = { ...authState, isAuthenticated: true, require2FA: false };
        setAuthState(newState);
        persistSession(authState.user);
      }
      return ok;
    },
    [authState, persistSession]
  );

  // ── Setup 2FA — generate new secret ────────────────────────────────────
  const setup2FA = useCallback((): { secret: string; uri: string } => {
    const secret = generateTOTPSecret();
    const uri = getTOTPUri(secret, authState.user?.email ?? 'user@nexchat');
    return { secret, uri };
  }, [authState.user]);

  // ── Confirm 2FA — validate first code and save secret ──────────────────
  const confirm2FA = useCallback(
    (secret: string, code: string): boolean => {
      if (!authState.user) return false;
      const ok = validateTOTP(secret, code);
      if (ok) {
        const updated = users.map((u) =>
          u.id === authState.user!.id ? { ...u, twoFactorEnabled: true, twoFactorSecret: secret } : u
        );
        setUsers(updated);
        saveJSON(USERS_KEY, updated);
        const updatedUser = { ...authState.user, twoFactorEnabled: true, twoFactorSecret: secret };
        const newState = { ...authState, user: updatedUser };
        setAuthState(newState);
        persistSession(updatedUser);
      }
      return ok;
    },
    [authState, users, persistSession]
  );

  // ── Disable 2FA ─────────────────────────────────────────────────────────
  const disable2FA = useCallback(
    (code: string): boolean => {
      if (!authState.user?.twoFactorSecret) return false;
      const ok = validateTOTP(authState.user.twoFactorSecret, code);
      if (ok) {
        const updated = users.map((u) =>
          u.id === authState.user!.id
            ? { ...u, twoFactorEnabled: false, twoFactorSecret: undefined }
            : u
        );
        setUsers(updated);
        saveJSON(USERS_KEY, updated);
        const updatedUser = { ...authState.user, twoFactorEnabled: false, twoFactorSecret: undefined };
        setAuthState({ ...authState, user: updatedUser });
        persistSession(updatedUser);
      }
      return ok;
    },
    [authState, users, persistSession]
  );

  // ── Session config ──────────────────────────────────────────────────────
  const saveSessionConfig = useCallback((cfg: SessionConfig) => {
    setSessionConfig(cfg);
    saveJSON(SESSION_CFG_KEY, cfg);
  }, []);

  // ── User management ─────────────────────────────────────────────────────
  const addUser = useCallback(
    (userData: Omit<User, 'id' | 'createdAt'>) => {
      const u: User = { ...userData, id: String(Date.now()), createdAt: new Date().toISOString() };
      const updated = [...users, u];
      setUsers(updated);
      saveJSON(USERS_KEY, updated);
    },
    [users]
  );

  const updateUser = useCallback(
    (id: string, updates: Partial<User>) => {
      const updated = users.map((u) => (u.id === id ? { ...u, ...updates } : u));
      setUsers(updated);
      saveJSON(USERS_KEY, updated);
      if (authState.user?.id === id) {
        const updatedUser = { ...authState.user, ...updates };
        const newState = { ...authState, user: updatedUser };
        setAuthState(newState);
        persistSession(updatedUser);
      }
    },
    [users, authState, persistSession]
  );

  const deleteUser = useCallback(
    (id: string) => {
      const updated = users.filter((u) => u.id !== id);
      setUsers(updated);
      saveJSON(USERS_KEY, updated);
    },
    [users]
  );

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login, logout, changePassword,
        verify2FA, setup2FA, confirm2FA, disable2FA,
        sessionConfig, saveSessionConfig,
        users, addUser, updateUser, deleteUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
