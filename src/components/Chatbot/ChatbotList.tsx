import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Trash2, Edit3, Bot, Power, PowerOff, Copy, Pencil, Check, Clock } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Chatbot, ChatbotSchedule, FlowNode, FlowEdge } from '../../types';
import ChatbotBuilder from './ChatbotBuilder';
import clsx from 'clsx';
import { format } from 'date-fns';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function ScheduleEditor({ schedule, onChange }: {
  schedule: ChatbotSchedule | undefined;
  onChange: (s: ChatbotSchedule) => void;
}) {
  const s: ChatbotSchedule = schedule ?? { enabled: false, days: [1,2,3,4,5,6,0], startTime: '08:00', endTime: '23:59' };

  const toggleDay = (d: number) => {
    const days = s.days.includes(d) ? s.days.filter(x => x !== d) : [...s.days, d];
    onChange({ ...s, days });
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <div
          onClick={() => onChange({ ...s, enabled: !s.enabled })}
          className={clsx('w-9 h-5 rounded-full relative transition-colors cursor-pointer',
            s.enabled ? 'bg-primary-600' : 'bg-slate-300')}
        >
          <span className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
            s.enabled ? 'translate-x-4' : 'translate-x-0.5')} />
        </div>
        <span className="text-sm font-medium text-slate-700">Agendamento de horário</span>
      </label>

      {s.enabled && (
        <>
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Dias de atuação</p>
            <div className="flex gap-1 flex-wrap">
              {[1,2,3,4,5,6,0].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium transition border',
                    s.days.includes(d)
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-primary-400')}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Início</label>
              <input
                type="time"
                value={s.startTime}
                onChange={e => onChange({ ...s, startTime: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Fim</label>
              <input
                type="time"
                value={s.endTime}
                onChange={e => onChange({ ...s, endTime: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Intervalos que cruzam meia-noite são suportados (ex: 23:00 → 07:59).
            Fora deste horário, outro bot agendado para o mesmo canal assume.
          </p>
        </>
      )}
    </div>
  );
}

export default function ChatbotList() {
  const { chatbots, channels, addChatbot, updateChatbot, deleteChatbot } = useApp();
  const [showModal, setShowModal]         = useState(false);
  const [builderBot, setBuilderBot]       = useState<Chatbot | null>(null);
  const [form, setForm]                   = useState({ name: '', description: '', channelId: '' });
  const [editingId,   setEditingId]       = useState<string | null>(null);
  const [editingName, setEditingName]     = useState('');
  const [scheduleOpenId, setScheduleOpenId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const startEdit = (bot: Chatbot) => {
    setEditingId(bot.id);
    setEditingName(bot.name);
  };

  const commitEdit = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) updateChatbot(id, { name: trimmed });
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const newBot: Omit<Chatbot, 'id' | 'createdAt' | 'updatedAt'> = {
      ...form,
      status: 'draft',
      nodes: [
        { id: 'n_start', type: 'start', position: { x: 260, y: 80 }, data: { label: 'Início do fluxo' } },
      ],
      edges: [],
    };
    addChatbot(newBot);
    setShowModal(false);
    setForm({ name: '', description: '', channelId: '' });
  };

  const handleSaveFlow = (bot: Chatbot, nodes: FlowNode[], edges: FlowEdge[]) => {
    updateChatbot(bot.id, { nodes, edges, status: 'inactive' });
    setBuilderBot(null);
  };

  const openBuilder = (bot: Chatbot) => {
    setBuilderBot(bot);
  };

  const handleDuplicate = (bot: Chatbot) => {
    addChatbot({
      name:        `Cópia de ${bot.name}`,
      description: bot.description,
      channelId:   undefined,
      status:      'draft',
      nodes:       JSON.parse(JSON.stringify(bot.nodes)),
      edges:       JSON.parse(JSON.stringify(bot.edges)),
    });
  };

  return (
    <>
      {builderBot && (
        <ChatbotBuilder
          chatbot={builderBot}
          onSave={(nodes, edges) => handleSaveFlow(builderBot, nodes, edges)}
          onClose={() => setBuilderBot(null)}
        />
      )}

      <div className="p-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Chatbots</h2>
            <p className="text-sm text-slate-500 mt-0.5">Fluxos automatizados de atendimento</p>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md">
            <Plus size={16} />
            Novo chatbot
          </button>
        </div>

        <div className="grid gap-4">
          {chatbots.map((bot) => {
            const ch = channels.find((c) => c.id === bot.channelId);
            const nodeCount = bot.nodes.length;
            return (
              <div key={bot.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-4">
                    <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', bot.status === 'active' ? 'bg-accent-100' : 'bg-slate-100')}>
                      <Bot size={22} className={bot.status === 'active' ? 'text-accent-600' : 'text-slate-400'} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {editingId === bot.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              ref={editInputRef}
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter')  commitEdit(bot.id);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              onBlur={() => commitEdit(bot.id)}
                              className="px-2 py-0.5 text-sm font-semibold text-slate-800 border border-primary-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-52"
                            />
                            <button
                              onMouseDown={(e) => { e.preventDefault(); commitEdit(bot.id); }}
                              className="w-6 h-6 rounded-md bg-primary-100 text-primary-700 flex items-center justify-center hover:bg-primary-200 transition"
                            >
                              <Check size={12} strokeWidth={2.5} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            <h3 className="font-semibold text-slate-800">{bot.name}</h3>
                            <button
                              onClick={() => startEdit(bot)}
                              title="Renomear chatbot"
                              className="w-5 h-5 rounded-md text-slate-300 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center transition opacity-0 group-hover/name:opacity-100"
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
                        )}
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', {
                          'bg-accent-100 text-accent-700': bot.status === 'active',
                          'bg-slate-100 text-slate-500': bot.status === 'inactive',
                          'bg-yellow-100 text-yellow-700': bot.status === 'draft',
                        })}>
                          {bot.status === 'active' ? 'Ativo' : bot.status === 'inactive' ? 'Inativo' : 'Rascunho'}
                        </span>
                      </div>
                      {bot.description && <p className="text-sm text-slate-500 mt-0.5">{bot.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                        <select
                          value={bot.channelId ?? ''}
                          onChange={(e) => updateChatbot(bot.id, { channelId: e.target.value || undefined })}
                          className={clsx(
                            'px-2 py-0.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white',
                            ch ? 'border-slate-200 text-primary-600 font-medium' : 'border-orange-300 text-orange-500'
                          )}
                        >
                          <option value="">Sem canal vinculado</option>
                          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <span>{nodeCount} blocos</span>
                        <span>Atualizado {format(new Date(bot.updatedAt), 'dd/MM/yyyy')}</span>
                        {bot.schedule?.enabled && (
                          <span className="flex items-center gap-1 text-indigo-600 font-medium">
                            <Clock size={11} />
                            {bot.schedule.startTime}–{bot.schedule.endTime}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openBuilder(bot)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium hover:bg-primary-100 transition"
                    >
                      <Edit3 size={13} />
                      Editar fluxo
                    </button>
                    {bot.status !== 'draft' && (
                      <button
                        onClick={() => updateChatbot(bot.id, { status: bot.status === 'active' ? 'inactive' : 'active' })}
                        className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition', bot.status === 'active' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-accent-50 text-accent-700 hover:bg-accent-100')}
                      >
                        {bot.status === 'active' ? <><PowerOff size={13} />Desativar</> : <><Power size={13} />Ativar</>}
                      </button>
                    )}
                    <button
                      onClick={() => setScheduleOpenId(scheduleOpenId === bot.id ? null : bot.id)}
                      title="Configurar horário"
                      className={clsx('w-8 h-8 rounded-lg flex items-center justify-center transition',
                        bot.schedule?.enabled
                          ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                          : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50')}
                    >
                      <Clock size={16} />
                    </button>
                    <button
                      onClick={() => handleDuplicate(bot)}
                      title="Duplicar chatbot"
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition"
                    >
                      <Copy size={16} />
                    </button>
                    <button onClick={() => deleteChatbot(bot.id)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {scheduleOpenId === bot.id && (
                  <ScheduleEditor
                    schedule={bot.schedule}
                    onChange={(s) => updateChatbot(bot.id, { schedule: s })}
                  />
                )}
              </div>
            );
          })}
          {chatbots.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <Bot size={40} strokeWidth={1} className="mx-auto mb-3" />
              <p>Nenhum chatbot criado</p>
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Novo chatbot</h3>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome do chatbot</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Ex: Atendimento Geral" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição <span className="text-slate-400 font-normal">(opcional)</span></label>
                  <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Descreva a finalidade do chatbot" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal</label>
                  <select value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })} required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">Selecionar canal</option>
                    {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Todo atendimento receptivo deste canal passará pelo fluxo quando ativo.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                  <button type="submit" className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition">
                    Criar e editar fluxo
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
