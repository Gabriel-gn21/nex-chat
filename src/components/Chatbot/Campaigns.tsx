import React, { useState } from 'react';
import { Plus, X, Trash2, Play, Pause, Send, Users, CheckCheck, Eye } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Campaign, CampaignStatus } from '../../types';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<CampaignStatus, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'Agendado', color: 'bg-yellow-100 text-yellow-700' },
  running: { label: 'Executando', color: 'bg-primary-100 text-primary-700' },
  completed: { label: 'Concluído', color: 'bg-accent-100 text-accent-700' },
  paused: { label: 'Pausado', color: 'bg-orange-100 text-orange-700' },
};

export default function Campaigns() {
  const { campaigns, channels, templates, addCampaign, updateCampaign, deleteCampaign } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', templateId: '', channelId: '', scheduledAt: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addCampaign({
      ...form,
      status: form.scheduledAt ? 'scheduled' : 'draft',
      audience: [],
      sentCount: 0, deliveredCount: 0, readCount: 0,
    });
    setShowModal(false);
    setForm({ name: '', templateId: '', channelId: '', scheduledAt: '' });
  };

  const approvedTemplates = templates.filter((t) => t.status === 'approved');

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Campanhas</h2>
          <p className="text-sm text-slate-500 mt-0.5">Envios em massa usando templates aprovados</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md">
          <Plus size={16} />
          Nova campanha
        </button>
      </div>

      <div className="space-y-4">
        {campaigns.map((camp) => {
          const ch = channels.find((c) => c.id === camp.channelId);
          const tmpl = templates.find((t) => t.id === camp.templateId);
          const deliveryRate = camp.sentCount ? Math.round(camp.deliveredCount / camp.sentCount * 100) : 0;
          const readRate = camp.sentCount ? Math.round(camp.readCount / camp.sentCount * 100) : 0;
          const cfg = statusConfig[camp.status];

          return (
            <div key={camp.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-800">{camp.name}</h3>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', cfg.color)}>{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {ch && <span>Canal: <span className="text-primary-600 font-medium">{ch.name}</span></span>}
                    {tmpl && <span>Template: <code className="text-slate-600">{tmpl.name}</code></span>}
                    {camp.scheduledAt && <span>Agendado: {format(new Date(camp.scheduledAt), "dd/MM/yyyy HH:mm")}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {camp.status === 'draft' && (
                    <button onClick={() => updateCampaign(camp.id, { status: 'running' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-100 text-accent-700 rounded-lg text-xs font-medium hover:bg-accent-200 transition">
                      <Play size={12} />Disparar
                    </button>
                  )}
                  {camp.status === 'running' && (
                    <button onClick={() => updateCampaign(camp.id, { status: 'paused' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-200 transition">
                      <Pause size={12} />Pausar
                    </button>
                  )}
                  {camp.status === 'paused' && (
                    <button onClick={() => updateCampaign(camp.id, { status: 'running' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-100 text-primary-700 rounded-lg text-xs font-medium hover:bg-primary-200 transition">
                      <Play size={12} />Retomar
                    </button>
                  )}
                  <button onClick={() => deleteCampaign(camp.id)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {camp.sentCount > 0 && (
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-50">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1"><Send size={12} />Enviados</div>
                    <p className="font-bold text-slate-800">{camp.sentCount.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-primary-500 text-xs mb-1"><CheckCheck size={12} />Entregues</div>
                    <p className="font-bold text-slate-800">{camp.deliveredCount.toLocaleString()} <span className="text-xs text-slate-400 font-normal">({deliveryRate}%)</span></p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-accent-500 text-xs mb-1"><Eye size={12} />Lidos</div>
                    <p className="font-bold text-slate-800">{camp.readCount.toLocaleString()} <span className="text-xs text-slate-400 font-normal">({readRate}%)</span></p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {campaigns.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Send size={40} strokeWidth={1} className="mx-auto mb-3" />
            <p>Nenhuma campanha criada</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Nova campanha</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome da campanha</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ex: Promoção Junho 2024" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Template</label>
                <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })} required
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Selecionar template aprovado</option>
                  {approvedTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {approvedTemplates.length === 0 && (
                  <p className="text-xs text-orange-600 mt-1">Nenhum template aprovado disponível.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal de envio</label>
                <select value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })} required
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Selecionar canal</option>
                  {channels.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Agendamento <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition">
                  Criar campanha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
