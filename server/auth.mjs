/**
 * auth.mjs — Módulo de Autenticação e Segurança do Nex-Chat
 *
 * Implementa:
 *  - Armazenamento seguro de senhas com bcrypt (custo 12)
 *  - Tokens JWT com expiração configurável
 *  - Autenticação de dois fatores (2FA) via TOTP (RFC 6238)
 *  - Proteção contra força bruta (rate limit + lockout)
 *  - Recuperação de senha com token criptograficamente seguro
 *  - Logs de auditoria persistentes em arquivo (audit.log)
 *  - Invalidação de sessão no logout (blacklist em memória + arquivo)
 */

import bcrypt     from 'bcryptjs';
import jwt        from 'jsonwebtoken';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { TOTP, generateSecret: otpGenerateSecret, generateURI } = require('otplib');
import crypto     from 'crypto';
import fs         from 'fs';
import path       from 'path';
import { fileURLToPath } from 'url';
import { store, save } from './store.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ─── Configurações ────────────────────────────────────────────────────────────
const JWT_SECRET     = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';      // sessão expira em 8h
const BCRYPT_ROUNDS  = 12;                                        // custo recomendado OWASP
const MAX_ATTEMPTS   = 5;                                         // tentativas antes do bloqueio
const LOCKOUT_MS     = 15 * 60 * 1000;                           // 15 min de bloqueio
const RECOVERY_TTL   = 30 * 60 * 1000;                           // token de recuperação: 30 min

// ─── Diretório e arquivo de logs ──────────────────────────────────────────────
const LOGS_DIR  = path.join(__dir, 'logs');
const AUDIT_LOG = path.join(LOGS_DIR, 'audit.log');
const USERS_FILE = path.join(__dir, 'users.json');

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ─── Log de auditoria ─────────────────────────────────────────────────────────
export function auditLog(action, details = {}) {
  const entry = JSON.stringify({
    ts:     new Date().toISOString(),
    action,
    ...details,
  });
  fs.appendFileSync(AUDIT_LOG, entry + '\n', 'utf8');
  console.log(`[audit] ${action}`, details);
}

// ─── Armazenamento de usuários ────────────────────────────────────────────────
let users = {};

function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); return; }
    catch { /* usa padrão */ }
  }
  // Cria usuário admin padrão na primeira execução
  // Senha padrão: 12345678 — DEVE ser alterada em produção
  const defaultHash = bcrypt.hashSync('12345678', BCRYPT_ROUNDS);
  users = {
    'gabriel.nascimento': {
      username:    'gabriel.nascimento',
      passwordHash: defaultHash,
      role:        'superadmin',
      twoFactorEnabled: false,
      twoFactorSecret:  null,
      createdAt:   new Date().toISOString(),
      // LGPD: consentimento e dados pessoais mínimos
      consentGiven:    true,
      consentDate:     new Date().toISOString(),
      consentVersion:  '1.0',
      personalData: {
        purpose:     'Acesso ao sistema de atendimento Nex-Chat',
        dataFields:  ['username', 'role'],
        retentionDays: 365,
      },
    },
  };
  saveUsers();
  auditLog('SYSTEM_INIT', { msg: 'Usuário admin padrão criado. Senha deve ser alterada.' });
}

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

loadUsers();

// ─── Blacklist de tokens revogados (logout) ───────────────────────────────────
// Mantida em memória e persistida em arquivo para sobreviver reinicializações
const REVOKED_FILE = path.join(__dir, 'logs', 'revoked_tokens.json');
let revokedTokens = new Set();

try {
  if (fs.existsSync(REVOKED_FILE)) {
    const data = JSON.parse(fs.readFileSync(REVOKED_FILE, 'utf8'));
    // Remove tokens já expirados para não crescer indefinidamente
    const now = Date.now();
    revokedTokens = new Set(data.filter(({ exp }) => exp * 1000 > now).map(({ jti }) => jti));
  }
} catch { /* inicio limpo */ }

function revokeToken(decoded) {
  revokedTokens.add(decoded.jti);
  // Persiste lista filtrada
  const data = [...revokedTokens].map(jti => ({ jti, exp: decoded.exp }));
  fs.writeFileSync(REVOKED_FILE, JSON.stringify(data), 'utf8');
}

export function isTokenRevoked(jti) {
  return revokedTokens.has(jti);
}

// ─── Rate limiting (anti força-bruta) ────────────────────────────────────────
// Mapa: username -> { attempts, lockedUntil }
const loginAttempts = new Map();

function checkRateLimit(username) {
  const now = Date.now();
  const rec = loginAttempts.get(username) || { attempts: 0, lockedUntil: 0 };

  if (rec.lockedUntil > now) {
    const remaining = Math.ceil((rec.lockedUntil - now) / 1000);
    throw Object.assign(new Error(`Conta bloqueada. Tente novamente em ${remaining}s`), { status: 429 });
  }
  return rec;
}

function recordFailedAttempt(username) {
  const rec = loginAttempts.get(username) || { attempts: 0, lockedUntil: 0 };
  rec.attempts += 1;
  if (rec.attempts >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.attempts = 0;
    auditLog('ACCOUNT_LOCKED', { username, lockoutMinutes: LOCKOUT_MS / 60000 });
  }
  loginAttempts.set(username, rec);
}

function clearFailedAttempts(username) {
  loginAttempts.delete(username);
}

// ─── Hash de senha ────────────────────────────────────────────────────────────
/** Gera hash bcrypt com salt único e custo 12 */
export async function hashPassword(plaintext) {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(plaintext, salt);
}

/** Verifica senha contra hash armazenado */
export async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

// ─── Tokens de recuperação de senha ──────────────────────────────────────────
// Mapa em memória: token -> { username, expiresAt }
const recoveryTokens = new Map();

export function generateRecoveryToken(username) {
  if (!users[username]) throw new Error('Usuário não encontrado');
  // Token criptograficamente seguro de 48 bytes (96 hex chars)
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = Date.now() + RECOVERY_TTL;
  recoveryTokens.set(token, { username, expiresAt });
  auditLog('PASSWORD_RECOVERY_REQUESTED', { username });
  return token;
}

export function consumeRecoveryToken(token, newPassword) {
  const rec = recoveryTokens.get(token);
  if (!rec) {
    auditLog('PASSWORD_RECOVERY_FAILED', { reason: 'token_not_found' });
    throw Object.assign(new Error('Token inválido ou já utilizado'), { status: 400 });
  }
  if (Date.now() > rec.expiresAt) {
    recoveryTokens.delete(token);
    auditLog('PASSWORD_RECOVERY_FAILED', { reason: 'token_expired', username: rec.username });
    throw Object.assign(new Error('Token expirado'), { status: 400 });
  }
  // Invalida o token imediatamente após uso
  recoveryTokens.delete(token);
  const hash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  users[rec.username].passwordHash = hash;
  saveUsers();
  auditLog('PASSWORD_RECOVERY_SUCCESS', { username: rec.username });
  return rec.username;
}

// ─── 2FA — TOTP (RFC 6238) ───────────────────────────────────────────────────
const totp = new TOTP();
totp.options = { window: 1 }; // tolera ±30s de drift de relógio

export function generate2FASecret(username) {
  const secret = otpGenerateSecret();
  users[username].twoFactorSecret = secret;
  users[username].twoFactorEnabled = false; // ainda não confirmado
  saveUsers();
  // Gera URL otpauth:// para escaneamento no Google Authenticator
  const otpAuthUrl = generateURI({ secret, label: username, issuer: 'Nex-Chat', type: 'totp' });
  return { secret, otpAuthUrl };
}

export function verify2FASetup(username, token) {
  const secret = users[username]?.twoFactorSecret;
  if (!secret) throw new Error('2FA não configurado para este usuário');
  const valid = totp.verify({ token, secret });
  if (valid) {
    users[username].twoFactorEnabled = true;
    saveUsers();
    auditLog('2FA_ENABLED', { username });
  }
  return valid;
}

export function verify2FAToken(username, token) {
  const secret = users[username]?.twoFactorSecret;
  if (!secret) return false;
  return totp.verify({ token, secret });
}

// ─── Login ────────────────────────────────────────────────────────────────────
/**
 * Autentica um usuário.
 * Se 2FA estiver ativo, exige o campo `totpToken`.
 * Retorna um JWT assinado em caso de sucesso.
 */
export async function login(username, password, totpToken, ip = 'unknown') {
  // 1. Rate limit
  checkRateLimit(username);

  // 2. Usuário existe?
  const user = users[username];
  if (!user) {
    // Evita timing attack: sempre faz hash comparison (dummy)
    await bcrypt.compare(password, '$2a$12$invalidhashpadding000000000000000000000000000000000000000');
    recordFailedAttempt(username);
    auditLog('LOGIN_FAILED', { username, reason: 'user_not_found', ip });
    throw Object.assign(new Error('Credenciais inválidas'), { status: 401 });
  }

  // 3. Senha correta?
  const pwdOk = await bcrypt.compare(password, user.passwordHash);
  if (!pwdOk) {
    recordFailedAttempt(username);
    auditLog('LOGIN_FAILED', { username, reason: 'wrong_password', ip });
    throw Object.assign(new Error('Credenciais inválidas'), { status: 401 });
  }

  // 4. 2FA (se habilitado)
  if (user.twoFactorEnabled) {
    if (!totpToken) {
      auditLog('LOGIN_2FA_REQUIRED', { username, ip });
      throw Object.assign(new Error('Token 2FA obrigatório'), { status: 403, require2FA: true });
    }
    const ok2fa = verify2FAToken(username, totpToken);
    if (!ok2fa) {
      recordFailedAttempt(username);
      auditLog('LOGIN_2FA_FAILED', { username, ip });
      throw Object.assign(new Error('Token 2FA inválido'), { status: 401 });
    }
    auditLog('LOGIN_2FA_OK', { username, ip });
  }

  // 5. Sucesso — gera JWT
  clearFailedAttempts(username);
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { username, role: user.role, jti },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  auditLog('LOGIN_SUCCESS', { username, role: user.role, ip });
  return { token, username, role: user.role, expiresIn: JWT_EXPIRES_IN };
}

// ─── Logout (invalida JWT) ────────────────────────────────────────────────────
export function logout(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    revokeToken(decoded);
    auditLog('LOGOUT', { username: decoded.username });
    return true;
  } catch {
    return false;
  }
}

// ─── Middleware de autenticação JWT ───────────────────────────────────────────
export function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const raw  = auth.startsWith('Bearer ') ? auth.slice(7) : auth;

  if (!raw) return res.status(401).json({ error: 'Token de autenticação ausente' });

  try {
    const decoded = jwt.verify(raw, JWT_SECRET);
    if (isTokenRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Sessão encerrada (logout)' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    auditLog('AUTH_REJECTED', { reason: err.message, ip: req.ip });
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// ─── CRUD de usuários (para superadmin) ──────────────────────────────────────
export function listUsers() {
  return Object.values(users).map(u => ({
    username:        u.username,
    role:            u.role,
    twoFactorEnabled: u.twoFactorEnabled,
    createdAt:       u.createdAt,
    consentGiven:    u.consentGiven,
    consentDate:     u.consentDate,
  }));
}

export async function createUser(username, password, role = 'operator') {
  if (users[username]) throw new Error('Usuário já existe');
  const hash = await hashPassword(password);
  users[username] = {
    username,
    passwordHash: hash,
    role,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    createdAt: new Date().toISOString(),
    consentGiven: false,
    consentDate: null,
    consentVersion: null,
    personalData: {
      purpose: 'Acesso ao sistema de atendimento Nex-Chat',
      dataFields: ['username', 'role'],
      retentionDays: 365,
    },
  };
  saveUsers();
  auditLog('USER_CREATED', { username, role });
}

export async function changePassword(username, currentPassword, newPassword) {
  const user = users[username];
  if (!user) throw new Error('Usuário não encontrado');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw Object.assign(new Error('Senha atual incorreta'), { status: 401 });
  user.passwordHash = await hashPassword(newPassword);
  saveUsers();
  auditLog('PASSWORD_CHANGED', { username });
}

// ─── LGPD: acesso, exportação e exclusão de dados pessoais ───────────────────
export function getLGPDData(username) {
  const user = users[username];
  if (!user) throw new Error('Usuário não encontrado');
  return {
    username:      user.username,
    role:          user.role,
    createdAt:     user.createdAt,
    consent:       { given: user.consentGiven, date: user.consentDate, version: user.consentVersion },
    personalData:  user.personalData,
    dataRetained:  ['username', 'role', 'createdAt', 'consentDate'],
  };
}

export function exportLGPDData(username) {
  const base = getLGPDData(username);
  const conversations = Object.values(store.conversations)
    .filter(() => false) // operadores não têm conversas próprias — phone contacts only
    .map(c => ({ id: c.id, createdAt: c.createdAt }));
  auditLog('LGPD_DATA_EXPORT', { username });
  return { ...base, conversations };
}

export function deleteUserData(username, requestedBy) {
  if (!users[username]) throw new Error('Usuário não encontrado');
  if (username === requestedBy && users[username].role === 'superadmin') {
    throw new Error('Superadmin não pode se auto-excluir');
  }
  auditLog('LGPD_DATA_DELETION', { username, requestedBy });
  delete users[username];
  saveUsers();
}

export function updateConsent(username, version, given) {
  if (!users[username]) throw new Error('Usuário não encontrado');
  users[username].consentGiven   = given;
  users[username].consentDate    = new Date().toISOString();
  users[username].consentVersion = version;
  saveUsers();
  auditLog('CONSENT_UPDATED', { username, version, given });
}

// ─── Leitura de logs de auditoria ─────────────────────────────────────────────
export function readAuditLog(limit = 100) {
  if (!fs.existsSync(AUDIT_LOG)) return [];
  const lines = fs.readFileSync(AUDIT_LOG, 'utf8').trim().split('\n').filter(Boolean);
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return entries.slice(-limit).reverse(); // mais recentes primeiro
}
