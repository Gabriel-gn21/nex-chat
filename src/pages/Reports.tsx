import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp, Users, Bot, Clock, MessageSquare, CheckCircle, Calendar, RefreshCw, Wifi, ClipboardList, ShoppingCart, DollarSign } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { SERVER_URL, apiFetch } from '../contexts/AppContext';
import { TabulationConfig } from '../types';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ReportTab = 'attendance' | 'channels' | 'chatbot' | 'tabulation';

const tabs = [
  { id: 'attendance' as ReportTab, label: 'Visão de Atendimentos', icon: MessageSquare },
  { id: 'channels'   as ReportTab, label: 'Por Canal',             icon: Wifi },
  { id: 'chatbot'    as ReportTab, label: 'Analytics Chatbot',     icon: Bot },
  { id: 'tabulation' as ReportTab, label: 'Tabulações',            icon: ClipboardList },
];

const PERIOD_OPTIONS = [
  { label: 'Hoje',         value: 1  },
  { label: 'Últimos 7 dias',  value: 7  },
  { label: 'Últimos 10 dias', value: 10 },
  { label: 'Últimos 30 dias', value: 30 },
];

const BLUE       = '#2563eb';
const GREEN      = '#10b981';
const FUNNEL_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#10b981', '#f59e0b'];

interface ReportData {
  attendance: { date: string; atendimentos: number; resolvidos: number; tempo_medio: number }[];
  chatbot:    { etapa: string; valor: number }[];
  channels:   { nome: string; atendimentos: number; resolvidos: number; tempo_medio: number }[];
  summary:    { total: number; resolved: number; avgTime: number };
}

const EMPTY: ReportData = {
  attendance: [],
  chatbot:    [
    { etapa: 'Iniciados', valor: 0 },
    { etapa: 'Em andamento', valor: 0 },
    { etapa: 'Resolvidos pelo bot', valor: 0 },
    { etapa: 'Transferidos', valor: 0 },
    { etapa: 'Abandonados', valor: 0 },
  ],
  channels: [],
  summary:  { total: 0, resolved: 0, avgTime: 0 },
};

function StatCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string; sub: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-start gap-4">
      <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <MessageSquare size={36} strokeWidth={1} className="mb-3" />
      <p className="font-medium text-slate-500">Nenhum dado no período</p>
      <p className="text-sm mt-1">Os dados aparecerão conforme os atendimentos forem realizados.</p>
    </div>
  );
}

interface TabulationRecord {
  id: string;
  contactName: string;
  contactPhone: string;
  resolvedAt: string;
  tabulation: Record<string, string | number>;
  channelId: string;
}

export default function Reports() {
  const { groups, tabulationConfigs } = useApp();
  // Para relatórios: usa a primeira config como referência de campos
  const tabulationConfig = tabulationConfigs[0] ?? null;
  const [activeTab, setActiveTab] = useState<ReportTab>('attendance');
  const [days,      setDays]      = useState(10);
  const [groupId,   setGroupId]   = useState('');
  const [data,      setData]      = useState<ReportData>(EMPTY);
  const [loading,   setLoading]   = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tabulations,     setTabulations]     = useState<TabulationRecord[]>([]);
  const [tabLoading,      setTabLoading]      = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (groupId) params.set('groupId', groupId);
      const res  = await apiFetch(`${SERVER_URL}/api/reports?${params}`);
      const json = await res.json() as ReportData;
      setData(json);
      setLastUpdate(new Date());
    } catch {
      /* servidor offline */
    } finally {
      setLoading(false);
    }
  }, [days, groupId]);

  // Atualiza ao montar, ao trocar filtros e a cada 30s
  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 30_000);
    return () => clearInterval(interval);
  }, [fetchReports]);

  const fetchTabulations = useCallback(async () => {
    setTabLoading(true);
    try {
      const res  = await apiFetch(`${SERVER_URL}/api/tabulations?days=${days}`);
      const json = await res.json() as TabulationRecord[];
      setTabulations(json);
    } catch { /* offline */ } finally { setTabLoading(false); }
  }, [days]);

  useEffect(() => {
    if (activeTab === 'tabulation') fetchTabulations();
  }, [activeTab, fetchTabulations]);

  const periodLabel = PERIOD_OPTIONS.find(p => p.value === days)?.label ?? `${days} dias`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Relatórios</h1>
          <p className="text-sm text-slate-500">
            {lastUpdate
              ? `Atualizado às ${lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Carregando…'}
          </p>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3">
          {/* Grupo */}
          <select
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="">Todos os grupos</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          {/* Período */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  days === opt.value
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Refresh manual */}
          <button
            onClick={fetchReports}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 px-6">
        <div className="flex gap-0">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition',
                activeTab === id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'attendance' && (
          <AttendanceReport data={data} periodLabel={periodLabel} />
        )}
        {activeTab === 'channels' && (
          <ChannelsReport data={data} periodLabel={periodLabel} />
        )}
        {activeTab === 'chatbot' && (
          <ChatbotReport data={data} periodLabel={periodLabel} />
        )}
        {activeTab === 'tabulation' && (
          <TabulationReport
            records={tabulations}
            config={tabulationConfig}
            loading={tabLoading}
            onRefresh={fetchTabulations}
            periodLabel={periodLabel}
          />
        )}
      </div>
    </div>
  );
}

// ─── Visão de Atendimentos ────────────────────────────────────────────────────
function AttendanceReport({ data, periodLabel }: { data: ReportData; periodLabel: string }) {
  const { summary, attendance } = data;
  const resolvedPct = summary.total > 0 ? Math.round(summary.resolved / summary.total * 100) : 0;
  const hasData = attendance.some(d => d.atendimentos > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="Total de Atendimentos"
          value={String(summary.total)}
          sub={periodLabel}
          icon={MessageSquare}
          color="bg-primary-600"
        />
        <StatCard
          title="Resolvidos"
          value={String(summary.resolved)}
          sub={`${resolvedPct}% de resolução`}
          icon={CheckCircle}
          color="bg-accent-500"
        />
        <StatCard
          title="Tempo Médio"
          value={summary.avgTime > 0 ? `${summary.avgTime}min` : ' - '}
          sub="Da abertura ao encerramento"
          icon={Clock}
          color="bg-purple-500"
        />
      </div>

      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-4">Volume de Atendimentos por Dia</h3>
        {hasData ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={attendance}>
              <defs>
                <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={BLUE}  stopOpacity={0.2} />
                  <stop offset="95%" stopColor={BLUE}  stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={GREEN} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
              <Legend />
              <Area type="monotone" dataKey="atendimentos" name="Atendimentos" stroke={BLUE}  fill="url(#gradBlue)"  strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="resolvidos"   name="Resolvidos"   stroke={GREEN} fill="url(#gradGreen)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyState />}
      </div>

      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-4">Tempo Médio de Atendimento (min)</h3>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={attendance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} formatter={(v: number) => [`${v} min`, 'Tempo médio']} />
              <Line type="monotone" dataKey="tempo_medio" name="Tempo (min)" stroke="#a855f7" strokeWidth={2.5} dot={{ fill: '#a855f7', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyState />}
      </div>
    </div>
  );
}

// ─── Por Canal ────────────────────────────────────────────────────────────────
function ChannelsReport({ data, periodLabel }: { data: ReportData; periodLabel: string }) {
  const { channels, summary } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          title="Total de Atendimentos"
          value={String(summary.total)}
          sub={periodLabel}
          icon={MessageSquare}
          color="bg-primary-600"
        />
        <StatCard
          title="Canais Ativos"
          value={String(channels.length)}
          sub="Com atendimentos no período"
          icon={TrendingUp}
          color="bg-accent-500"
        />
      </div>

      {channels.length > 0 ? (
        <>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-4">Atendimentos por Canal</h3>
            <ResponsiveContainer width="100%" height={Math.max(channels.length * 60, 200)}>
              <BarChart data={channels} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="nome" type="category" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={130} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Legend />
                <Bar dataKey="atendimentos" name="Atendimentos" fill={BLUE}  radius={[0, 6, 6, 0]} />
                <Bar dataKey="resolvidos"   name="Resolvidos"   fill={GREEN} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-700">Detalhamento por Canal</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">#</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Canal</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Atend.</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Resolvidos</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Taxa</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">T. Médio</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch, i) => {
                  const pct = ch.atendimentos > 0 ? Math.round(ch.resolvidos / ch.atendimentos * 100) : 0;
                  return (
                    <tr key={ch.nome} className="border-t border-slate-50 hover:bg-slate-50 transition">
                      <td className="px-5 py-3 text-sm font-bold text-slate-400">#{i + 1}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-200 to-accent-200 flex items-center justify-center text-xs font-bold text-primary-700">
                            {ch.nome.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-slate-700">{ch.nome}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-medium text-slate-700">{ch.atendimentos}</td>
                      <td className="px-5 py-3 text-right text-sm text-accent-600 font-medium">{ch.resolvidos}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', pct >= 70 ? 'bg-accent-100 text-accent-700' : pct >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600')}>
                          {pct}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-slate-600">
                        {ch.tempo_medio > 0 ? `${ch.tempo_medio}min` : ' - '}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : <EmptyState />}
    </div>
  );
}

// ─── Analytics Chatbot ────────────────────────────────────────────────────────
function ChatbotReport({ data, periodLabel }: { data: ReportData; periodLabel: string }) {
  const { chatbot, summary } = data;
  const initiated    = chatbot[0]?.valor ?? 0;
  const resolvedBot  = chatbot[2]?.valor ?? 0;
  const transferred  = chatbot[3]?.valor ?? 0;
  const resolvedPct  = initiated > 0 ? Math.round(resolvedBot  / initiated * 100) : 0;
  const transferPct  = initiated > 0 ? Math.round(transferred  / initiated * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="Fluxos Iniciados"
          value={String(initiated)}
          sub={periodLabel}
          icon={Bot}
          color="bg-purple-500"
        />
        <StatCard
          title="Resolvidos pelo Bot"
          value={initiated > 0 ? `${resolvedPct}%` : ' - '}
          sub={`${resolvedBot} atendimentos`}
          icon={CheckCircle}
          color="bg-accent-500"
        />
        <StatCard
          title="Transferidos"
          value={String(transferred)}
          sub={initiated > 0 ? `${transferPct}% do total` : 'Sem dados ainda'}
          icon={Users}
          color="bg-primary-600"
        />
      </div>

      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-4">Funil de Atendimento do Chatbot</h3>
        {initiated > 0 ? (
          <div className="space-y-2.5">
            {chatbot.map((item, i) => {
              const pct = initiated > 0 ? Math.round((item.valor / initiated) * 100) : 0;
              return (
                <div key={item.etapa} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-44 shrink-0">{item.etapa}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-8 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                      style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%`, background: FUNNEL_COLORS[i] }}
                    >
                      {pct > 5 && <span className="text-white text-xs font-semibold">{item.valor}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 w-16 justify-end shrink-0">
                    {pct <= 5 && item.valor > 0 && <span className="text-xs font-medium text-slate-600">{item.valor}</span>}
                    <span className="text-sm font-semibold text-slate-500">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <EmptyState />}
      </div>

      {initiated > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-700 mb-4">Distribuição de Resultados</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chatbot}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="etapa" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="valor" name="Conversas" radius={[6, 6, 0, 0]}>
                {chatbot.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Tabulações ───────────────────────────────────────────────────────────────
function TabulationReport({
  records, config, loading, onRefresh, periodLabel,
}: {
  records: TabulationRecord[];
  config: TabulationConfig | null;
  loading: boolean;
  onRefresh: () => void;
  periodLabel: string;
}) {
  if (!config?.enabled) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
        <ClipboardList size={40} strokeWidth={1} />
        <p className="font-medium text-slate-500">Tabulação não está ativada</p>
        <p className="text-sm">Ative em Configurações → Tabulações para começar a coletar dados.</p>
      </div>
    );
  }

  // Campo "resultado" = primeiro campo do tipo select (ou id === 'resultado')
  const resultField = config.fields.find(f => f.id === 'resultado') ?? config.fields.find(f => f.type === 'select');
  const valorField  = config.fields.find(f => f.id === 'valor' || f.type === 'number');

  // Distribuição do campo resultado
  const distribution: Record<string, number> = {};
  let totalValor = 0;
  let vendas = 0;

  for (const r of records) {
    if (resultField) {
      const v = String(r.tabulation[resultField.id] ?? '');
      if (v) distribution[v] = (distribution[v] ?? 0) + 1;
    }
    if (valorField) {
      const v = Number(r.tabulation[valorField.id] ?? 0);
      if (v > 0) { totalValor += v; vendas++; }
    }
  }

  const distData = Object.entries(distribution)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const fillRate = records.length; // já filtrados

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tabulações preenchidas"
          value={String(fillRate)}
          sub={periodLabel}
          icon={ClipboardList}
          color="bg-primary-600"
        />
        {resultField && distData.length > 0 && (
          <StatCard
            title="Resultado mais comum"
            value={distData[0].name.length > 18 ? distData[0].name.slice(0, 16) + '…' : distData[0].name}
            sub={`${distData[0].value} ocorrência${distData[0].value > 1 ? 's' : ''}`}
            icon={CheckCircle}
            color="bg-accent-500"
          />
        )}
        {vendas > 0 && (
          <StatCard
            title="Vendas realizadas"
            value={String(vendas)}
            sub={periodLabel}
            icon={ShoppingCart}
            color="bg-emerald-500"
          />
        )}
        {totalValor > 0 && (
          <StatCard
            title="Receita estimada"
            value={totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            sub="Soma dos valores informados"
            icon={DollarSign}
            color="bg-green-600"
          />
        )}
      </div>

      {/* Distribuição do campo resultado */}
      {resultField && distData.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-700 mb-4">{resultField.label}</h3>
          <div className="space-y-2.5">
            {distData.map((item, i) => {
              const pct = fillRate > 0 ? Math.round(item.value / fillRate * 100) : 0;
              return (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-44 shrink-0 truncate">{item.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-7 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                      style={{ width: `${Math.max(pct, pct > 0 ? 5 : 0)}%`, background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
                    >
                      {pct > 8 && <span className="text-white text-xs font-semibold">{item.value}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 w-16 justify-end shrink-0">
                    {pct <= 8 && item.value > 0 && <span className="text-xs font-medium text-slate-600">{item.value}</span>}
                    <span className="text-sm font-semibold text-slate-500">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabela de registros */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700 text-sm">Registros de tabulação</h3>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {records.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            Nenhuma tabulação registrada no período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Data</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Contato</th>
                  {config.fields.map(f => (
                    <th key={f.id} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {format(new Date(r.resolvedAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700 text-xs">{r.contactName}</p>
                      <p className="text-slate-400 text-[10px]">{r.contactPhone}</p>
                    </td>
                    {config.fields.map(f => (
                      <td key={f.id} className="px-4 py-3 text-slate-600 text-xs max-w-[180px]">
                        {r.tabulation[f.id] != null
                          ? f.type === 'number'
                            ? Number(r.tabulation[f.id]).toLocaleString('pt-BR', f.id === 'valor' ? { style: 'currency', currency: 'BRL' } : {})
                            : String(r.tabulation[f.id])
                          : <span className="text-slate-300"> - </span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
