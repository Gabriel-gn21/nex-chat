import { User } from '../types';

// ─── Usuários iniciais ───────────────────────────────────────────────────────
// Somente o superadmin de bootstrap. Todos os demais usuários devem ser
// criados via painel de Configurações. Novos usuários recebem a senha padrão
// "12345678" e são forçados a alterá-la no primeiro acesso.
export const INITIAL_USERS: User[] = [
  {
    id: '1',
    name: 'Gabriel Gomes',
    email: 'gabriel.gnascimento@hotmail.com',
    login: 'gabriel.nascimento',
    password: '12345678',
    role: 'superadmin',
    firstAccess: false,
    twoFactorEnabled: false,
    createdAt: '2024-01-01T00:00:00Z',
    active: true,
  },
];

// ─── Dados de relatório ───────────────────────────────────────────────────────
export const REPORT_ATTENDANCE = [
  { date: '04/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
  { date: '05/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
  { date: '06/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
  { date: '07/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
  { date: '08/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
  { date: '09/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
  { date: '10/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
  { date: '11/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
  { date: '12/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
  { date: '13/05', atendimentos: 0, resolvidos: 0, tempo_medio: 0 },
];

export const REPORT_OPERATORS: { nome: string; atendimentos: number; resolvidos: number; tempo_medio: number; satisfacao: number }[] = [];

export const REPORT_CHATBOT = [
  { etapa: 'Iniciados', valor: 0 },
  { etapa: 'Completaram menu', valor: 0 },
  { etapa: 'Resolvidos pelo bot', valor: 0 },
  { etapa: 'Transferidos', valor: 0 },
  { etapa: 'Abandonados', valor: 0 },
];
