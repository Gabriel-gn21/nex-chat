import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, Plus, Pencil, Trash2, TrendingUp, TrendingDown,
  AlertTriangle, Download, X, Check, RefreshCw, History,
} from 'lucide-react';
import { SERVER_URL } from '../contexts/AppContext';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── tipos ────────────────────────────────────────────────────────────────────
interface Product {
  id: string; name: string; category: string; unit: string;
  quantity: number; min_alert: number; price: number;
  created_at: string; updated_at: string;
}

interface Movement {
  id: string; product_id: string; product_name: string;
  type: 'in' | 'out'; quantity: number; balance: number;
  reason: string; created_at: string;
}

const UNITS = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pc', 'par', 'm', 'fardo'];

const API = `${SERVER_URL}/api/stock`;

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtR = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDt = (iso: string) => {
  try { return format(new Date(iso), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return iso; }
};

// ─── modal de produto ─────────────────────────────────────────────────────────
const emptyForm = () => ({ name:'', category:'', unit:'un', quantity:'0', min_alert:'0', price:'0' });

function ProductModal({ product, onSave, onClose }: {
  product: Product | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const [form,    setForm]    = useState(product
    ? { name: product.name, category: product.category, unit: product.unit,
        quantity: String(product.quantity), min_alert: String(product.min_alert), price: String(product.price) }
    : emptyForm());
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = {
        name: form.name.trim(), category: form.category.trim(), unit: form.unit,
        quantity: Number(form.quantity), min_alert: Number(form.min_alert), price: Number(form.price),
      };
      const res = await fetch(product ? `${API}/products/${product.id}` : `${API}/products`, {
        method: product ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erro ao salvar'); }
      onSave();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally { setSaving(false); }
  };

  const f = (field: keyof typeof form, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{product ? 'Editar produto' : 'Novo produto'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nome *</label>
            <input value={form.name} onChange={e => f('name', e.target.value)} required
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Ex: Gás 13kg Ultragaz" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Categoria</label>
              <input value={form.category} onChange={e => f('category', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Ex: Gás, Água" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Unidade</label>
              <select value={form.unit} onChange={e => f('unit', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {product ? 'Qtd. atual' : 'Qtd. inicial'}
              </label>
              <input type="number" min="0" step="0.01" value={form.quantity}
                onChange={e => f('quantity', e.target.value)} disabled={!!product}
                className={clsx('w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500',
                  product ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed' : 'border-slate-200')} />
              {product && <p className="text-[10px] text-slate-400 mt-0.5">Use + / – para ajustar</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Alerta mínimo</label>
              <input type="number" min="0" step="0.01" value={form.min_alert}
                onChange={e => f('min_alert', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Preço (R$)</label>
              <input type="number" min="0" step="0.01" value={form.price}
                onChange={e => f('price', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition">
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── modal de ajuste ──────────────────────────────────────────────────────────
function AdjustModal({ product, onSave, onClose }: {
  product: Product;
  onSave: () => void;
  onClose: () => void;
}) {
  const [delta,  setDelta]  = useState('');
  const [reason, setReason] = useState('');
  const [dir,    setDir]    = useState<'in' | 'out'>('in');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(delta);
    if (!qty || qty <= 0) return;
    setSaving(true);
    await fetch(`${API}/products/${product.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: dir === 'in' ? qty : -qty, reason }),
    });
    setSaving(false);
    onSave();
  };

  const preview = dir === 'in'
    ? product.quantity + (Number(delta) || 0)
    : Math.max(0, product.quantity - (Number(delta) || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Ajustar estoque</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500">Produto</p>
            <p className="font-semibold text-slate-800">{product.name}</p>
            <p className="text-sm text-slate-500 mt-0.5">Estoque atual: <strong>{fmt(product.quantity)} {product.unit}</strong></p>
          </div>

          <div className="flex gap-2">
            {(['in', 'out'] as const).map(d => (
              <button key={d} type="button" onClick={() => setDir(d)}
                className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition border',
                  dir === d
                    ? d === 'in' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
                {d === 'in' ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                {d === 'in' ? 'Entrada' : 'Saída'}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Quantidade</label>
            <input type="number" min="0.01" step="0.01" value={delta}
              onChange={e => setDelta(e.target.value)} required
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo (opcional)</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Ex: Compra, Venda, Ajuste de inventário…" />
          </div>

          {delta && Number(delta) > 0 && (
            <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
              Novo saldo: <strong className={clsx(preview <= product.min_alert ? 'text-red-600' : 'text-emerald-600')}>
                {fmt(preview)} {product.unit}
              </strong>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !delta || Number(delta) <= 0}
              className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition">
              {saving ? 'Salvando…' : <><Check size={14} className="inline mr-1" />Confirmar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── página principal ─────────────────────────────────────────────────────────
export default function Stock() {
  const [products,   setProducts]   = useState<Product[]>([]);
  const [movements,  setMovements]  = useState<Movement[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<'products' | 'movements'>('products');
  const [showModal,  setShowModal]  = useState(false);
  const [editProd,   setEditProd]   = useState<Product | null>(null);
  const [adjustProd, setAdjustProd] = useState<Product | null>(null);
  const [search,     setSearch]     = useState('');
  const [catFilter,  setCatFilter]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([
        fetch(`${API}/products`).then(r => r.json()),
        fetch(`${API}/movements?limit=300`).then(r => r.json()),
      ]);
      setProducts(Array.isArray(p) ? p : []);
      setMovements(Array.isArray(m) ? m : []);
    } catch { /* servidor offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir produto e todo o histórico de movimentações?')) return;
    await fetch(`${API}/products/${id}`, { method: 'DELETE' });
    load();
  };

  const doExport = (format: 'csv' | 'txt') => {
    window.open(`${API}/export?format=${format}`, '_blank');
  };

  // ── métricas ─────────────────────────────────────────────────────────────
  const lowStock    = products.filter(p => p.quantity <= p.min_alert && p.min_alert > 0);
  const outOfStock  = products.filter(p => p.quantity === 0);
  const totalValue  = products.reduce((s, p) => s + p.quantity * p.price, 0);
  const categories  = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  const filteredProducts = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
      || p.category.toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const qtyColor = (p: Product) => {
    if (p.quantity === 0) return 'text-red-600 font-bold';
    if (p.min_alert > 0 && p.quantity <= p.min_alert) return 'text-orange-500 font-semibold';
    return 'text-emerald-600 font-semibold';
  };

  const typeLabel = (t: string) => t === 'in' ? 'Entrada' : 'Saída';
  const typeColor = (t: string) => t === 'in'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-red-100 text-red-700';

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto p-6 space-y-5">

        {/* ── header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Package size={22} className="text-primary-600" /> Controle de Estoque
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Gerencie produtos e movimentações</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => doExport('csv')}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-sm text-slate-600 transition">
              <Download size={14} /> CSV
            </button>
            <button onClick={() => doExport('txt')}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-sm text-slate-600 transition">
              <Download size={14} /> TXT
            </button>
            <button onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-sm text-slate-600 transition">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { setEditProd(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-sm">
              <Plus size={15} /> Novo produto
            </button>
          </div>
        </div>

        {/* ── métricas ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Produtos',       value: products.length,        color: 'text-slate-700',  bg: 'bg-slate-100' },
            { label: 'Zerados',        value: outOfStock.length,      color: outOfStock.length  ? 'text-red-600'    : 'text-slate-400', bg: outOfStock.length  ? 'bg-red-50'    : 'bg-slate-50' },
            { label: 'Abaixo mínimo',  value: lowStock.length,        color: lowStock.length    ? 'text-orange-600' : 'text-slate-400', bg: lowStock.length    ? 'bg-orange-50' : 'bg-slate-50' },
            { label: 'Valor total',    value: fmtR(totalValue),       color: 'text-emerald-700', bg: 'bg-emerald-50' },
          ].map(c => (
            <div key={c.label} className={`${c.bg} rounded-2xl p-4`}>
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className={`text-xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* ── alertas ── */}
        {(lowStock.length > 0 || outOfStock.length > 0) && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={15} className="text-orange-500" />
              <span className="text-sm font-semibold text-orange-700">Atenção ao estoque</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[...outOfStock, ...lowStock.filter(p => p.quantity > 0)].map(p => (
                <span key={p.id} className={clsx('text-xs px-2.5 py-1 rounded-full font-medium',
                  p.quantity === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700')}>
                  {p.name}: {fmt(p.quantity)} {p.unit} {p.quantity === 0 ? '(zerado)' : `(mín: ${p.min_alert})`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── tabs ── */}
        <div className="flex gap-1 border-b border-slate-200">
          {(['products', 'movements'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px flex items-center gap-1.5',
                tab === t ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              {t === 'products' ? <><Package size={14} /> Produtos</> : <><History size={14} /> Movimentações</>}
            </button>
          ))}
        </div>

        {/* ── aba produtos ── */}
        {tab === 'products' && (
          <div className="space-y-3">
            {/* filtros */}
            <div className="flex gap-3 flex-wrap">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar produto…"
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white w-56" />
              {categories.length > 0 && (
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  <option value="">Todas categorias</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>

            {loading ? (
              <div className="text-center py-16 text-slate-400 text-sm">Carregando…</div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Package size={36} strokeWidth={1} className="mx-auto mb-2" />
                <p>{products.length === 0 ? 'Nenhum produto cadastrado.' : 'Nenhum produto encontrado.'}</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {['Nome', 'Categoria', 'Qtd.', 'Un.', 'Alerta', 'Preço', 'Atualizado', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredProducts.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                        <td className="px-4 py-3 text-slate-500">{p.category || ' - '}</td>
                        <td className="px-4 py-3">
                          <span className={qtyColor(p)}>{fmt(p.quantity)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{p.unit}</td>
                        <td className="px-4 py-3 text-slate-500">{p.min_alert > 0 ? fmt(p.min_alert) : ' - '}</td>
                        <td className="px-4 py-3 text-slate-600">{p.price > 0 ? fmtR(p.price) : ' - '}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{fmtDt(p.updated_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setAdjustProd(p)}
                              className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition text-xs font-bold"
                              title="Ajustar quantidade">±</button>
                            <button onClick={() => { setEditProd(p); setShowModal(true); }}
                              className="w-7 h-7 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center transition">
                              <Pencil size={13} /></button>
                            <button onClick={() => handleDelete(p.id)}
                              className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition">
                              <Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── aba movimentações ── */}
        {tab === 'movements' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {movements.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <History size={36} strokeWidth={1} className="mx-auto mb-2" />
                <p>Nenhuma movimentação registrada ainda.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['Data/Hora', 'Produto', 'Tipo', 'Quantidade', 'Saldo', 'Motivo'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movements.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtDt(m.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{m.product_name}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', typeColor(m.type))}>
                          {typeLabel(m.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        <span className={m.type === 'in' ? 'text-emerald-600' : 'text-red-600'}>
                          {m.type === 'in' ? '+' : '–'}{fmt(m.quantity)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmt(m.balance)}</td>
                      <td className="px-4 py-3 text-slate-500">{m.reason || ' - '}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── nota de integração chatbot ── */}
        <div className="bg-slate-100 rounded-2xl p-4 text-xs text-slate-500">
          <p className="font-semibold text-slate-600 mb-1">Integração com chatbot</p>
          <p>Para reduzir automaticamente o estoque após uma venda, adicione um nó <strong>Chamada de API</strong> no fluxo do bot com:</p>
          <code className="block mt-1.5 bg-white px-3 py-2 rounded-lg text-slate-700 leading-relaxed">
            POST {SERVER_URL}/api/stock/sell<br />
            {'{'} "productName": "{'{tipo_pedido}'}", "quantity": 1, "reason": "Venda via bot" {'}'}
          </code>
        </div>
      </div>

      {/* ── modais ── */}
      {showModal && (
        <ProductModal
          product={editProd}
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
        />
      )}
      {adjustProd && (
        <AdjustModal
          product={adjustProd}
          onSave={() => { setAdjustProd(null); load(); }}
          onClose={() => setAdjustProd(null)}
        />
      )}
    </div>
  );
}
