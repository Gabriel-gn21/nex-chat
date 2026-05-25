import React, { useState } from 'react';
import { Plus, X, Trash2, Eye, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Template, TemplateCategory } from '../../types';
import clsx from 'clsx';

const statusBadge = (s: Template['status']) => {
  if (s === 'approved') return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 font-medium"><CheckCircle size={11} />Aprovado</span>;
  if (s === 'rejected') return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"><AlertCircle size={11} />Rejeitado</span>;
  return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium"><Clock size={11} />Pendente</span>;
};

const categoryLabel: Record<TemplateCategory, string> = {
  marketing: 'Marketing',
  utility: 'Utilidade',
  authentication: 'Autenticação',
};

export default function Templates() {
  const { templates, channels, addTemplate, deleteTemplate } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [preview, setPreview] = useState<Template | null>(null);
  const [form, setForm] = useState({
    name: '', category: 'utility' as TemplateCategory,
    language: 'pt_BR', header: '', body: '', footer: '', channelId: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTemplate({ ...form, status: 'pending', buttons: [] });
    setShowModal(false);
    setForm({ name: '', category: 'utility', language: 'pt_BR', header: '', body: '', footer: '', channelId: '' });
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Templates</h2>
          <p className="text-sm text-slate-500 mt-0.5">Mensagens pré-aprovadas pela Meta para envio ativo</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md">
          <Plus size={16} />
          Novo template
        </button>
      </div>

      <div className="grid gap-4">
        {templates.map((t) => {
          const ch = channels.find((c) => c.id === t.channelId);
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <code className="font-mono text-sm font-semibold text-slate-700">{t.name}</code>
                    {statusBadge(t.status)}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{categoryLabel[t.category]}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-600">{t.language}</span>
                  </div>
                  {t.header && <p className="text-xs text-slate-500 mb-1"><span className="font-medium">Header:</span> {t.header}</p>}
                  <p className="text-sm text-slate-700 line-clamp-2">{t.body}</p>
                  {t.footer && <p className="text-xs text-slate-400 mt-1">{t.footer}</p>}
                  {ch && <p className="text-xs text-slate-400 mt-2">Canal: <span className="text-primary-600 font-medium">{ch.name}</span></p>}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button onClick={() => setPreview(t)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center transition">
                    <Eye size={16} />
                  </button>
                  <button onClick={() => deleteTemplate(t.id)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {templates.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p>Nenhum template cadastrado</p>
          </div>
        )}
      </div>

      {/* New template modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-slate-800">Novo template</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome (snake_case)</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s/g, '_') })} required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                    placeholder="nome_do_template" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TemplateCategory })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="utility">Utilidade</option>
                    <option value="marketing">Marketing</option>
                    <option value="authentication">Autenticação</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Idioma</label>
                  <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="pt_BR">Português (BR)</option>
                    <option value="en_US">English (US)</option>
                    <option value="es">Español</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal</label>
                  <select value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })} required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">Selecionar canal</option>
                    {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Header <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input type="text" value={form.header} onChange={(e) => setForm({ ...form, header: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Título da mensagem" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Corpo da mensagem <span className="text-xs text-slate-400 font-normal">Use {'{{1}}'} para variáveis</span></label>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required rows={4}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder="Olá {{1}}, sua mensagem aqui..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Footer <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input type="text" value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Rodapé da mensagem" />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex gap-2">
                <AlertCircle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-700">O template será enviado para aprovação da Meta. O processo pode levar até 24h.</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition">
                  Enviar para aprovação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Preview: {preview.name}</h3>
              <button onClick={() => setPreview(null)} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <div className="bg-slate-100 rounded-2xl p-1 max-w-[280px] mx-auto">
                <div className="bg-white rounded-xl p-3 shadow-sm">
                  {preview.header && <p className="font-bold text-slate-800 text-sm mb-2">{preview.header}</p>}
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{preview.body}</p>
                  {preview.footer && <p className="text-xs text-slate-400 mt-2 border-t border-slate-100 pt-2">{preview.footer}</p>}
                  <div className="flex justify-end mt-2">
                    <span className="text-xs text-slate-400">10:00 ✓✓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
