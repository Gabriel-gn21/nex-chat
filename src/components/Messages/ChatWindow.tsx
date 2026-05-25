import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Paperclip, Smile, MoreVertical, UserCheck, CheckCheck, Check, Clock,
  Bot, User, WifiOff, QrCode, X, Copy, Loader2, AlertCircle, CheckCircle2,
  ImageOff, FileText, Music2, Video, Download, ZoomIn, ClipboardList, Sparkles, RotateCcw,
  Image, MapPin, Mic, Car,
} from 'lucide-react';
import { useApp, SERVER_URL, apiFetch } from '../../contexts/AppContext';
import { Message, TabulationField } from '../../types';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusIcon = (s: Message['status']) => {
  if (s === 'sent')      return <Check size={12} className="text-primary-200 shrink-0" />;
  if (s === 'delivered') return <CheckCheck size={12} className="text-primary-200 shrink-0" />;
  if (s === 'read')      return <CheckCheck size={12} className="text-sky-300 shrink-0" />;
  return <Clock size={12} className="text-primary-300 shrink-0" />;
};

// Converte URL de mídia do WhatsApp (que requer auth/CORS) para proxy local
function mediaProxyUrl(content: string): string {
  if (!content) return content;
  // Já é base64 data URI - usa direto
  if (content.startsWith('data:')) return content;
  // URL externa → proxia pelo servidor para contornar CORS e auth do CDN
  if (content.startsWith('http')) {
    return `${SERVER_URL}/api/media-proxy?url=${encodeURIComponent(content)}`;
  }
  return content;
}

// ─── MessageContent ───────────────────────────────────────────────────────────
function MessageContent({ msg, isOut }: { msg: Message; isOut: boolean }) {
  const [imgError, setImgError] = useState(false);
  const [lightbox,  setLightbox] = useState(false);

  if (msg.type === 'image') {
    const src = mediaProxyUrl(msg.content);
    if (imgError) {
      return (
        <div className={clsx(
          'flex flex-col items-center justify-center gap-1.5 w-48 h-32 rounded-lg',
          isOut ? 'bg-primary-700' : 'bg-slate-100'
        )}>
          <ImageOff size={24} className={isOut ? 'text-primary-300' : 'text-slate-400'} />
          <span className={clsx('text-xs', isOut ? 'text-primary-300' : 'text-slate-400')}>
            Imagem indisponível
          </span>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              'text-xs underline flex items-center gap-1',
              isOut ? 'text-primary-200' : 'text-primary-600'
            )}
          >
            <Download size={11} /> Abrir link
          </a>
        </div>
      );
    }
    return (
      <>
        <div className="relative group cursor-pointer" onClick={() => setLightbox(true)}>
          <img
            src={src}
            alt="imagem"
            onError={() => setImgError(true)}
            className="max-w-[240px] max-h-[300px] rounded-lg object-cover block"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition flex items-center justify-center">
            <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition drop-shadow" />
          </div>
        </div>
        {lightbox && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setLightbox(false)}
          >
            <button
              className="absolute top-4 right-4 text-white bg-black/40 rounded-full p-1.5 hover:bg-black/60 transition"
              onClick={() => setLightbox(false)}
            >
              <X size={20} />
            </button>
            <img
              src={src}
              alt="imagem ampliada"
              className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  if (msg.type === 'audio') {
    return (
      <div className={clsx('flex items-center gap-2 py-1', isOut ? 'text-primary-100' : 'text-slate-600')}>
        <Music2 size={16} className="shrink-0" />
        <audio
          controls
          src={mediaProxyUrl(msg.content)}
          className="h-8 w-48"
          style={{ colorScheme: isOut ? 'dark' : 'light' }}
        />
      </div>
    );
  }

  if (msg.type === 'document') {
    const filename = msg.content.split('/').pop()?.split('?')[0] || 'documento';
    return (
      <a
        href={mediaProxyUrl(msg.content)}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          'flex items-center gap-2 py-1 underline-offset-2 hover:underline',
          isOut ? 'text-primary-100' : 'text-primary-600'
        )}
      >
        <FileText size={16} className="shrink-0" />
        <span className="text-xs truncate max-w-[180px]">{filename}</span>
        <Download size={13} className="shrink-0 opacity-70" />
      </a>
    );
  }

  if ((msg.type as string) === 'video') {
    const src = mediaProxyUrl(msg.content);
    return (
      <video
        controls
        src={src}
        className="max-w-[240px] max-h-[300px] rounded-lg block"
        preload="metadata"
      />
    );
  }

  if ((msg.type as string) === 'location') {
    // formato: "lat,lng (nome)" ou "lat,lng"
    const match = msg.content.match(/^(-?[\d.]+),(-?[\d.]+)(?:\s+\((.+)\))?/);
    const lat  = match?.[1] ?? '0';
    const lng  = match?.[2] ?? '0';
    const name = match?.[3] ?? '';
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    return (
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="block group">
        <div className={clsx(
          'w-52 rounded-xl overflow-hidden border',
          isOut ? 'border-[#b7f0b1]' : 'border-slate-200'
        )}>
          {/* Mini mapa via OpenStreetMap */}
          <div className="relative h-28 bg-slate-100 overflow-hidden">
            <img
              src={`https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=300x150&markers=${lat},${lng},red`}
              alt="mapa"
              className="w-full h-full object-cover group-hover:opacity-90 transition"
              onError={e => {
                const t = e.currentTarget as HTMLImageElement;
                t.style.display = 'none';
                t.parentElement!.classList.add('flex','items-center','justify-center');
                t.insertAdjacentHTML('afterend', `<span class="text-slate-400 text-xs">Mapa indisponível</span>`);
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-md flex items-center justify-center">
                <MapPin size={12} className="text-white" fill="white" />
              </div>
            </div>
          </div>
          <div className={clsx(
            'flex items-center gap-2 px-2.5 py-2',
            isOut ? 'bg-[#d9fdd3]' : 'bg-white'
          )}>
            <MapPin size={14} className="text-red-500 shrink-0" />
            <span className="text-xs text-slate-700 truncate">
              {name || `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`}
            </span>
          </div>
        </div>
      </a>
    );
  }

  // texto padrão
  return <p className="whitespace-pre-wrap leading-relaxed text-[14px] break-all">{msg.content}</p>;
}

// ─── Modal Tabulação ──────────────────────────────────────────────────────────
function TabulationModal({
  conversationId,
  fields,
  hasAI,
  testMode,
  onTestModeChange,
  onConfirm,
  onSkip,
  podProducts = [],
}: {
  conversationId: string;
  fields: TabulationField[];
  hasAI: boolean;
  testMode: boolean;
  onTestModeChange: (v: boolean) => void;
  onConfirm: (data: Record<string, string | number>, testMode: boolean) => void;
  onSkip: (testMode: boolean) => void;
  podProducts?: string[];
}) {
  const [values,         setValues]         = useState<Record<string, string>>({});
  const [errors,         setErrors]         = useState<Record<string, string>>({});
  const [aiLoading,      setAiLoading]      = useState(false);
  const [aiSuggested,    setAiSuggested]    = useState<Set<string>>(new Set());
  const [aiError,        setAiError]        = useState('');
  const [freshProducts,  setFreshProducts]  = useState<string[]>(podProducts);

  // Busca lista atualizada do Pod Sales ao abrir o modal
  useEffect(() => {
    apiFetch(`${SERVER_URL}/api/pod-products`)
      .then(r => r.json())
      .then((prods: string[]) => { if (Array.isArray(prods) && prods.length > 0) setFreshProducts(prods); })
      .catch(() => {}); // mantém a lista anterior em caso de falha
  }, []);

  const isVisible = (f: TabulationField) => {
    if (!f.showWhen) return true;
    return values[f.showWhen.fieldId] === f.showWhen.value;
  };

  const setValue = (id: string, val: string) => {
    setValues(v => ({ ...v, [id]: val }));
    setErrors(e => { const x = { ...e }; delete x[id]; return x; });
    // Se o operador edita um campo pré-preenchido pela IA, remove a marcação
    setAiSuggested(s => { const x = new Set(s); x.delete(id); return x; });
  };

  const handleAI = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res  = await apiFetch(`${SERVER_URL}/api/tabulation/analyze`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ conversationId }),
      });
      const text = await res.text();
      let data: { suggestion?: Record<string, string | number>; error?: string };
      try { data = JSON.parse(text); }
      catch { throw new Error(`Servidor retornou resposta inválida (${res.status}). Verifique se o servidor está rodando.`); }
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      const suggestion = (data.suggestion ?? {}) as Record<string, string | number>;
      const newValues: Record<string, string> = {};
      const suggested = new Set<string>();
      for (const [k, v] of Object.entries(suggestion)) {
        newValues[k] = String(v);
        suggested.add(k);
      }
      setValues(prev => ({ ...prev, ...newValues }));
      setAiSuggested(suggested);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setAiLoading(false);
    }
  };

  const clearAI = () => {
    setValues({});
    setAiSuggested(new Set());
  };

  const handleConfirm = () => {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (!isVisible(f)) continue;
      if (f.required && !String(values[f.id] ?? '').trim()) {
        errs[f.id] = 'Campo obrigatório';
      }
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const data: Record<string, string | number> = {};
    for (const f of fields) {
      if (!isVisible(f)) continue;
      const v = values[f.id] ?? '';
      if (!v) continue;
      data[f.id] = f.type === 'number' ? parseFloat(v.replace(',', '.')) || 0 : v;
    }
    onConfirm(data, testMode);
  };

  const hasSuggestions = aiSuggested.size > 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
              <ClipboardList size={18} className="text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Tabulação do atendimento</h3>
              <p className="text-xs text-slate-500">Preencha antes de encerrar a conversa</p>
            </div>
          </div>

          {/* Botão IA */}
          {hasAI && (
            <button
              onClick={handleAI}
              disabled={aiLoading}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition shrink-0',
                hasSuggestions
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              )}
              title="Deixar a IA analisar a conversa e pré-preencher os campos"
            >
              {aiLoading
                ? <><Loader2 size={13} className="animate-spin" />Analisando…</>
                : <><Sparkles size={13} />{hasSuggestions ? 'Re-analisar' : 'Pré-preencher com IA'}</>
              }
            </button>
          )}
        </div>

        {/* Banner IA ativa */}
        {hasSuggestions && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50 border-b border-purple-100">
            <div className="flex items-center gap-2 text-xs text-purple-700">
              <Sparkles size={13} className="shrink-0" />
              <span>Campos pré-preenchidos pela IA - revise antes de confirmar</span>
            </div>
            <button
              onClick={clearAI}
              className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-700 shrink-0 ml-2"
            >
              <RotateCcw size={11} /> Limpar
            </button>
          </div>
        )}

        {/* Erro IA */}
        {aiError && (
          <div className="flex items-center gap-2 mx-5 mt-3 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
            <AlertCircle size={13} /> {aiError}
          </div>
        )}

        {/* Fields */}
        <div className="overflow-y-auto p-5 space-y-4">
          {fields.map(f => {
            if (!isVisible(f)) return null;
            const err   = errors[f.id];
            const isAI  = aiSuggested.has(f.id);
            const ringClass = isAI
              ? 'border-purple-300 ring-2 ring-purple-100'
              : err ? 'border-red-400' : 'border-slate-200';

            return (
              <div key={f.id}>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 mb-1.5">
                  {f.label}
                  {f.required && <span className="text-red-500">*</span>}
                  {isAI && (
                    <span className="flex items-center gap-0.5 text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full font-medium">
                      <Sparkles size={9} /> IA
                    </span>
                  )}
                </label>

                {f.type === 'select' && (
                  <select
                    value={values[f.id] ?? ''}
                    onChange={e => setValue(f.id, e.target.value)}
                    className={clsx('w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition', ringClass)}
                  >
                    <option value="">Selecione…</option>
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}

                {f.type === 'text' && (
                  <input
                    type="text" value={values[f.id] ?? ''}
                    onChange={e => setValue(f.id, e.target.value)}
                    placeholder={f.placeholder}
                    className={clsx('w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition', ringClass)}
                  />
                )}

                {f.type === 'number' && (
                  <input
                    type="text" inputMode="decimal" value={values[f.id] ?? ''}
                    onChange={e => setValue(f.id, e.target.value.replace(/[^0-9,\.]/g, ''))}
                    placeholder={f.placeholder ?? '0,00'}
                    className={clsx('w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition', ringClass)}
                  />
                )}

                {f.type === 'textarea' && (
                  <textarea
                    rows={3} value={values[f.id] ?? ''}
                    onChange={e => setValue(f.id, e.target.value)}
                    placeholder={f.placeholder}
                    className={clsx('w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none transition', ringClass)}
                  />
                )}

                {f.type === 'pod_product' && (
                  freshProducts.length > 0 ? (
                    <select
                      value={values[f.id] ?? ''}
                      onChange={e => setValue(f.id, e.target.value)}
                      className={clsx('w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition', ringClass)}
                    >
                      <option value="">Selecione o produto…</option>
                      {freshProducts.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text" value={values[f.id] ?? ''}
                      onChange={e => setValue(f.id, e.target.value)}
                      placeholder="Nenhum produto cadastrado - digite manualmente"
                      className={clsx('w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition', ringClass)}
                    />
                  )
                )}

                {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
              </div>
            );
          })}
        </div>

        {/* Modo Teste */}
        <div className="px-5 py-3 border-t border-slate-100 bg-amber-50/60">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={testMode}
              onChange={e => onTestModeChange(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
            <span className="text-xs text-amber-800 font-medium">
              🧪 Modo Teste - bot reinicia imediatamente na próxima mensagem
            </span>
          </label>
          {testMode && (
            <p className="text-[11px] text-amber-600 mt-1 ml-6">
              A janela de 24 h será ignorada. Use só durante testes de fluxo.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
          <button
            onClick={() => onSkip(testMode)}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition"
          >
            Resolver sem preencher
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2"
          >
            <CheckCheck size={15} /> Resolver
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal PIX ────────────────────────────────────────────────────────────────
interface PixResult {
  paymentId: number;
  amount: number;
  qrCode: string;
  qrCodeImage: string;
}

function PixModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [amount,      setAmount]      = useState('');
  const [description, setDescription] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [sending,     setSending]     = useState(false);
  const [error,       setError]       = useState('');
  const [result,      setResult]      = useState<PixResult | null>(null);
  const [copied,      setCopied]      = useState(false);
  const [sent,        setSent]        = useState(false);

  const handleGenerate = async () => {
    if (!amount) { setError('Informe o valor.'); return; }
    const num = parseFloat(amount.replace(',', '.'));
    if (!num || num <= 0) { setError('Valor inválido.'); return; }
    setError('');
    setLoading(true);
    try {
      const res  = await apiFetch(`${SERVER_URL}/api/pix/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: num, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar PIX');
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.qrCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSend = async () => {
    if (!result) return;
    setSending(true);
    setError('');
    try {
      const res = await apiFetch(`${SERVER_URL}/api/pix/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          conversationId,
          qrCodeImage: result.qrCodeImage,
          qrCode:      result.qrCode,
          amount:      result.amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar');
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  const amountFmt = result
    ? result.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <QrCode size={16} className="text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Gerar PIX</h3>
              <p className="text-xs text-slate-500">Mercado Pago</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center transition">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {sent ? (
            <div className="flex flex-col items-center py-4 gap-2">
              <CheckCircle2 size={40} className="text-green-500" />
              <p className="font-medium text-slate-700">PIX enviado ao cliente!</p>
            </div>
          ) : result ? (
            <>
              <div className="flex flex-col items-center gap-3">
                <img
                  src={`data:image/png;base64,${result.qrCodeImage}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 rounded-xl border border-slate-200 shadow-sm"
                />
                <p className="text-lg font-bold text-green-600">{amountFmt}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">Código Copia e Cola</p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-600 font-mono truncate">
                    {result.qrCode.slice(0, 40)}…
                  </div>
                  <button
                    onClick={handleCopy}
                    className={clsx(
                      'px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition shrink-0',
                      copied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {copied ? <><CheckCircle2 size={13} />Copiado</> : <><Copy size={13} />Copiar</>}
                  </button>
                </div>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
                  <AlertCircle size={13} /> {error}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setResult(null); setAmount(''); setDescription(''); }}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  Novo PIX
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2"
                >
                  {sending
                    ? <><Loader2 size={14} className="animate-spin" />Enviando…</>
                    : <><Send size={14} />Enviar ao cliente</>}
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Valor (R$)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9,\.]/g, ''))}
                    placeholder="0,00"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Descrição <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Pedido #123"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
                  <AlertCircle size={13} /> {error}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2"
                >
                  {loading
                    ? <><Loader2 size={14} className="animate-spin" />Gerando…</>
                    : <><QrCode size={14} />Gerar QR Code</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal Corrida (Uber / 99) ────────────────────────────────────────────────
const DEFAULT_ORIGIN = 'Avenida Boa Vista, 1077 - 08693000 Boa Vista Suzano - SP';

function RideModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [origin,      setOrigin]      = useState(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState('');
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiError,     setAiError]     = useState('');
  const [opening,     setOpening]     = useState<'uber' | '99' | null>(null);
  const [copied,      setCopied]      = useState<'origin' | 'dest' | null>(null);
  const [aiUsed,      setAiUsed]      = useState(false);

  const handleExtract = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res  = await apiFetch(`${SERVER_URL}/api/ride/extract-address`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ conversationId }),
      });
      const text = await res.text();
      let data: { found?: boolean; address?: string; error?: string };
      try { data = JSON.parse(text); }
      catch { throw new Error(`Servidor retornou resposta inválida (${res.status}).`); }
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      if (data.found && data.address) {
        setDestination(data.address);
        setAiUsed(true);
      } else {
        setAiError('Nenhum endereço de destino encontrado na conversa. Preencha manualmente.');
      }
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setAiLoading(false);
    }
  };

  // Geocodifica um endereço via Nominatim (OpenStreetMap, sem API key)
  const geocode = async (address: string): Promise<{ lat: string; lng: string } | null> => {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`,
        { headers: { 'User-Agent': 'NexChat/1.0' } }
      );
      const j = await r.json();
      if (j[0]) return { lat: j[0].lat, lng: j[0].lon };
    } catch { /* ignora - usa só formatted_address */ }
    return null;
  };

  const handleUber = async () => {
    if (!destination.trim() || !origin.trim()) return;
    setOpening('uber');
    try {
      const enc      = encodeURIComponent;
      const ogAddr   = enc(origin.trim());
      const dgAddr   = enc(destination.trim());

      // Geocodifica para enriquecer com lat/lng (mais preciso no app)
      const [ogeo, dgeo] = await Promise.allSettled([
        geocode(origin.trim()),
        geocode(destination.trim()),
      ]);
      const og = ogeo.status === 'fulfilled' ? ogeo.value : null;
      const dg = dgeo.status === 'fulfilled' ? dgeo.value : null;

      // Monta o trecho de coordenadas (só se geocodificou com sucesso)
      const pickupCoords  = og ? `&pickup[latitude]=${og.lat}&pickup[longitude]=${og.lng}` : '';
      const dropoffCoords = dg ? `&dropoff[latitude]=${dg.lat}&dropoff[longitude]=${dg.lng}` : '';

      const deepLinkPath =
        `?action=setPickup` +
        pickupCoords  + `&pickup[formatted_address]=${ogAddr}` +
        dropoffCoords + `&dropoff[formatted_address]=${dgAddr}`;

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isMobile) {
        // 1ª tentativa: abre direto no app instalado (uber://)
        window.location.href = `uber://${deepLinkPath}`;
        // Fallback após 1,5s: se o app não abriu, usa a versão mobile do site
        // (m.uber.com/ul/ aceita os parâmetros corretamente em browsers mobile)
        setTimeout(() => {
          window.open(`https://m.uber.com/ul/${deepLinkPath}`, '_blank');
        }, 1500);
      } else {
        // Desktop: Uber ignora parâmetros → usa Google Maps com a rota
        // (o Maps pré-preenche origem e destino e o usuário pode pedir Uber de lá)
        const mapsParams = new URLSearchParams({
          api:         '1',
          origin:      origin.trim(),
          destination: destination.trim(),
          travelmode:  'driving',
        });
        window.open(`https://www.google.com/maps/dir/?${mapsParams}`, '_blank');
      }
    } finally {
      setOpening(null);
    }
  };

  const handle99 = async () => {
    if (!destination.trim() || !origin.trim()) return;
    setOpening('99');
    try {
      // O 99 não possui deep link web com endereços pré-preenchidos.
      // Abrimos o Google Maps com a rota - no Android ele exibe botão
      // para abrir diretamente no 99 (ou Uber) instalado no celular.
      const params = new URLSearchParams({
        api:         '1',
        origin:      origin.trim(),
        destination: destination.trim(),
        travelmode:  'driving',
      });
      window.open(
        `https://www.google.com/maps/dir/?${params.toString()}`,
        '_blank'
      );
    } finally {
      setOpening(null);
    }
  };

  const copyText = (text: string, which: 'origin' | 'dest') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const canOpen = !!destination.trim() && !!origin.trim();
  const isGeocoding = opening !== null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
              <Car size={16} className="text-sky-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Solicitar Corrida</h3>
              <p className="text-xs text-slate-500">Uber · 99 via Maps</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center transition">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Origem */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              📍 Origem
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={origin}
                onChange={e => setOrigin(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
              />
              <button
                onClick={() => copyText(origin, 'origin')}
                title="Copiar"
                className={clsx(
                  'px-2.5 py-2 rounded-xl text-xs flex items-center gap-1 transition shrink-0',
                  copied === 'origin'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {copied === 'origin' ? <CheckCircle2 size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Destino */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700">
                🏁 Destino
              </label>
              <button
                onClick={handleExtract}
                disabled={aiLoading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition"
              >
                {aiLoading
                  ? <><Loader2 size={11} className="animate-spin" />Extraindo…</>
                  : <><Sparkles size={11} />{aiUsed ? 'Re-extrair' : 'Extrair da conversa'}</>
                }
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={destination}
                onChange={e => { setDestination(e.target.value); if (aiUsed) setAiUsed(false); }}
                placeholder="Ex: Rua das Flores, 123 - São Paulo - SP"
                className={clsx(
                  'flex-1 px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition',
                  aiUsed ? 'border-purple-300 ring-2 ring-purple-100' : 'border-slate-200'
                )}
              />
              <button
                onClick={() => copyText(destination, 'dest')}
                disabled={!destination}
                title="Copiar"
                className={clsx(
                  'px-2.5 py-2 rounded-xl text-xs flex items-center gap-1 transition shrink-0',
                  copied === 'dest'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40'
                )}
              >
                {copied === 'dest' ? <CheckCircle2 size={13} /> : <Copy size={13} />}
              </button>
            </div>
            {aiUsed && (
              <p className="text-[11px] text-purple-600 mt-1 flex items-center gap-1">
                <Sparkles size={10} /> Preenchido pela IA - revise antes de abrir o app
              </p>
            )}
          </div>

          {/* Erro IA */}
          {aiError && (
            <div className={clsx(
              'flex items-start gap-2 text-xs rounded-xl px-3 py-2 border',
              aiError.toLowerCase().includes('rate limit') || aiError.includes('429')
                ? 'text-orange-700 bg-orange-50 border-orange-200'
                : aiError.toLowerCase().includes('sobrecarregada') || aiError.includes('503')
                  ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
                  : 'text-red-700 bg-red-50 border-red-200'
            )}>
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
          )}

          {/* Botões apps */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleUber}
              disabled={!canOpen || isGeocoding}
              className="flex-1 py-2.5 bg-black hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2"
            >
              {opening === 'uber'
                ? <><Loader2 size={14} className="animate-spin" />Abrindo…</>
                : <><Car size={14} />Uber</>
              }
            </button>
            <button
              onClick={handle99}
              disabled={!canOpen || isGeocoding}
              className="flex-1 py-2.5 bg-[#F5A623] hover:bg-[#e09520] disabled:opacity-40 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2"
            >
              {opening === '99'
                ? <><Loader2 size={14} className="animate-spin" />Abrindo…</>
                : <><Car size={14} />99 / Maps</>
              }
            </button>
          </div>

          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            No celular: Uber abre direto no app com endereços preenchidos. No computador: ambos abrem o Google Maps com a rota.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── ChatWindow ───────────────────────────────────────────────────────────────
export default function ChatWindow({ onBack }: { onBack?: () => void }) {
  const { activeConversation, sendMessage, updateConversationStatus, serverOnline, getTabulationForChannel, podProducts } = useApp();
  const tabulationConfig = activeConversation ? getTabulationForChannel(activeConversation.channelId) : null;
  const [text,           setText]           = useState('');
  const [sending,        setSending]        = useState(false);
  const [showPix,        setShowPix]        = useState(false);
  const [showTabulation, setShowTabulation] = useState(false);
  const [testMode,       setTestMode]       = useState(false);
  const [showRide,       setShowRide]       = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [podToast,       setPodToast]       = useState<{ type: 'success' | 'error' | 'warning'; msg: string } | null>(null);
  const [attachLoading,  setAttachLoading]  = useState(false);
  const [attachError,    setAttachError]    = useState('');
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const fileInputImg    = useRef<HTMLInputElement>(null);
  const fileInputAudio  = useRef<HTMLInputElement>(null);
  const fileInputDoc    = useRef<HTMLInputElement>(null);
  const attachMenuRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  if (!activeConversation) {
    return (
      // No mobile a lista cobre tudo; esse placeholder só aparece no desktop
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-slate-50 text-slate-400">
        <div className="w-20 h-20 bg-white rounded-3xl shadow-md flex items-center justify-center mb-4">
          <User size={36} strokeWidth={1} className="text-slate-300" />
        </div>
        <p className="font-medium text-slate-600">Selecione uma conversa</p>
        <p className="text-sm mt-1">Escolha uma conversa na lista para visualizar as mensagens</p>
      </div>
    );
  }

  const { contact, messages, status } = activeConversation;

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    try { await sendMessage(activeConversation.id, content); }
    finally { setSending(false); }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Upload de arquivo (imagem, vídeo, áudio, documento) ─────────────────────
  const handleFileUpload = async (type: 'image' | 'video' | 'audio' | 'document', file: File) => {
    setShowAttachMenu(false);
    setAttachError('');
    const MAX_MB = type === 'video' ? 50 : 16;
    if (file.size > MAX_MB * 1024 * 1024) {
      setAttachError(`Arquivo muito grande (máx ${MAX_MB} MB)`);
      return;
    }
    setAttachLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiFetch(`${SERVER_URL}/api/conversations/${activeConversation.id}/send-media`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type, base64, mimetype: file.type, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar mídia');
    } catch (e: unknown) {
      setAttachError(e instanceof Error ? e.message : 'Erro ao enviar');
    } finally {
      setAttachLoading(false);
    }
  };

  // ── Envio de localização via Geolocation API ─────────────────────────────────
  const handleLocation = () => {
    setShowAttachMenu(false);
    setAttachError('');
    if (!navigator.geolocation) {
      setAttachError('Geolocalização não suportada neste navegador');
      return;
    }
    setAttachLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await apiFetch(`${SERVER_URL}/api/conversations/${activeConversation.id}/send-media`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ type: 'location', lat: coords.latitude, lng: coords.longitude, locationName: '' }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Erro ao enviar localização');
        } catch (e: unknown) {
          setAttachError(e instanceof Error ? e.message : 'Erro ao enviar localização');
        } finally {
          setAttachLoading(false);
        }
      },
      (err) => { setAttachLoading(false); setAttachError(`Localização negada: ${err.message}`); },
      { timeout: 10000 }
    );
  };

  // Agrupa por data e marca se mensagem consecutiva do mesmo remetente
  const grouped = messages.reduce<{ date: string; msgs: (Message & { isFirst: boolean; isLast: boolean })[] }[]>((acc, msg, i) => {
    const d = format(new Date(msg.timestamp), "dd 'de' MMMM", { locale: ptBR });
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const isFirst = !prev || prev.direction !== msg.direction ||
      format(new Date(prev.timestamp), "dd 'de' MMMM", { locale: ptBR }) !== d;
    const isLast  = !next || next.direction !== msg.direction ||
      format(new Date(next.timestamp), "dd 'de' MMMM", { locale: ptBR }) !== d;

    const enriched = { ...msg, isFirst, isLast };
    const last = acc[acc.length - 1];
    if (last && last.date === d) last.msgs.push(enriched);
    else acc.push({ date: d, msgs: [enriched] });
    return acc;
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0 min-h-0 overflow-hidden relative">
      {/* Modal PIX */}
      {showPix && (
        <PixModal
          conversationId={activeConversation.id}
          onClose={() => setShowPix(false)}
        />
      )}

      {/* Toast integração Pod Sales */}
      {podToast && (
        <div className={clsx(
          'absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all',
          podToast.type === 'success'
            ? 'bg-green-600 text-white'
            : podToast.type === 'warning'
            ? 'bg-amber-500 text-white'
            : 'bg-orange-600 text-white'
        )}>
          {podToast.msg}
          <button onClick={() => setPodToast(null)} className="ml-1 opacity-70 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Modal Corrida */}
      {showRide && (
        <RideModal
          conversationId={activeConversation.id}
          onClose={() => setShowRide(false)}
        />
      )}

      {/* Modal Tabulação */}
      {showTabulation && tabulationConfig?.fields && (
        <TabulationModal
          conversationId={activeConversation.id}
          fields={tabulationConfig.fields}
          hasAI={!!(tabulationConfig?.aiConfig?.apiKey)}
          testMode={testMode}
          onTestModeChange={setTestMode}
          podProducts={podProducts}
          onConfirm={async (data, tm) => {
            setShowTabulation(false);
            setTestMode(false);
            const res = await updateConversationStatus(activeConversation.id, 'resolved', data, tm);
            // Feedback da integração com Pod Sales
            if (res?.podSale) {
              const podSaleAny = res.podSale as Record<string, unknown>;
              const newProds: string[] = (podSaleAny.newProducts as string[] | undefined) ?? [];
              if (newProds.length > 0) {
                setPodToast({
                  type: 'warning',
                  msg: `✅ Venda salva! Produto${newProds.length > 1 ? 's' : ''} novo${newProds.length > 1 ? 's' : ''} criado${newProds.length > 1 ? 's' : ''} sem preço: ${newProds.join(', ')}. Cadastre no Pod Sales.`,
                });
                setTimeout(() => setPodToast(null), 10000);
              } else {
                setPodToast({ type: 'success', msg: '✅ Venda registrada no Pod Sales!' });
                setTimeout(() => setPodToast(null), 5000);
              }
            } else if (res?.podError) {
              setPodToast({ type: 'error', msg: `⚠️ Conversa encerrada, mas falha ao salvar no Pod Sales: ${res.podError}` });
              setTimeout(() => setPodToast(null), 8000);
            }
          }}
          onSkip={async (tm) => {
            setShowTabulation(false);
            setTestMode(false);
            await updateConversationStatus(activeConversation.id, 'resolved', undefined, tm);
          }}
        />
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shadow-sm gap-2 min-w-0 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Botão voltar - só aparece no mobile */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden w-8 h-8 flex items-center justify-center text-primary-600 hover:bg-primary-50 rounded-full transition shrink-0 -ml-1"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-200 to-accent-200 flex items-center justify-center overflow-hidden">
              {contact.avatar
                ? <img
                    src={contact.avatar}
                    alt={contact.name}
                    className="w-full h-full object-cover"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                : <span className="text-primary-700 font-semibold text-sm">
                    {contact.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </span>
              }
            </div>
            <span className={clsx('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white', {
              'bg-accent-500':  status === 'open',
              'bg-primary-500': status === 'in_progress',
              'bg-slate-400':   status === 'resolved',
              'bg-purple-500':  status === 'bot',
            })} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate leading-tight">{contact.name}</p>
            <p className="text-xs text-slate-400 truncate leading-tight">{contact.phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!serverOnline && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">
              <WifiOff size={11} /> Offline
            </span>
          )}
          {status === 'bot' && (
            <button
              onClick={() => updateConversationStatus(activeConversation.id, 'in_progress')}
              title="Assumir atendimento"
              className="flex items-center gap-1 px-2 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200 transition">
              <Bot size={13} />
              <span className="hidden md:inline">Assumir</span>
            </button>
          )}
          {status === 'open' && (
            <button
              onClick={() => updateConversationStatus(activeConversation.id, 'in_progress')}
              title="Iniciar atendimento"
              className="flex items-center gap-1 px-2 py-1.5 bg-accent-100 text-accent-700 rounded-lg text-xs font-medium hover:bg-accent-200 transition">
              <UserCheck size={13} />
              <span className="hidden md:inline">Iniciar</span>
            </button>
          )}
          {status === 'in_progress' && (
            <>
              {/* Toggle Modo Teste */}
              <button
                onClick={() => setTestMode(t => !t)}
                title={testMode ? 'Modo Teste ativo - bot reinicia ao resolver' : 'Ativar Modo Teste'}
                className={clsx(
                  'flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition',
                  testMode
                    ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                    : 'text-slate-400 hover:bg-slate-100'
                )}
              >
                🧪<span className="hidden md:inline">{testMode ? 'Teste ON' : 'Teste'}</span>
              </button>

              <button
                onClick={() => {
                  if (tabulationConfig?.enabled && tabulationConfig.fields.length > 0) {
                    setShowTabulation(true);
                  } else {
                    updateConversationStatus(activeConversation.id, 'resolved', undefined, testMode);
                    setTestMode(false);
                  }
                }}
                title="Resolver conversa"
                className="flex items-center gap-1 px-2 py-1.5 bg-accent-100 text-accent-700 rounded-lg text-xs font-medium hover:bg-accent-200 transition">
                <CheckCheck size={13} />
                <span className="hidden md:inline">Resolver</span>
              </button>
            </>
          )}
          <button className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition">
            <MoreVertical size={15} />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 bg-[#efeae2] min-h-0"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cfc8' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
      >
        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            {/* Separador de data */}
            <div className="flex items-center justify-center my-3">
              <span className="bg-white/80 text-slate-500 text-xs px-3 py-0.5 rounded-full shadow-sm border border-slate-200/60 backdrop-blur-sm">
                {date}
              </span>
            </div>

            {/* Mensagens do dia */}
            <div className="space-y-0.5">
              {msgs.map((msg) => {
                const isOut = msg.direction === 'outgoing';
                const isMedia = ['image','audio','document','video','location'].includes(msg.type as string);

                return (
                  <div
                    key={msg.id}
                    className={clsx(
                      'flex',
                      isOut ? 'justify-end' : 'justify-start',
                      msg.isFirst && !msg.isLast && 'mb-0',
                      msg.isLast  && 'mb-1.5',
                    )}
                  >
                    <div
                      className={clsx(
                        'relative max-w-[65%] shadow-sm text-sm',
                        // Padding: menor para media, normal para texto
                        isMedia ? 'p-1' : 'px-3 py-1.5',
                        // Cores
                        isOut
                          ? 'bg-[#d9fdd3] text-slate-800'
                          : 'bg-white text-slate-800',
                        // Bordas arredondadas estilo WhatsApp
                        isOut ? [
                          'rounded-tl-2xl rounded-bl-2xl rounded-tr-2xl',
                          msg.isLast ? 'rounded-br-sm' : 'rounded-br-2xl',
                        ] : [
                          'rounded-tr-2xl rounded-br-2xl rounded-bl-2xl',
                          msg.isLast ? 'rounded-tl-sm' : 'rounded-tl-2xl',
                        ],
                      )}
                    >
                      <MessageContent msg={msg} isOut={isOut} />

                      {/* Timestamp + status - inline no final do texto */}
                      <div className={clsx(
                        'flex items-center gap-0.5 select-none',
                        isMedia
                          ? 'absolute bottom-2 right-2 bg-black/40 rounded-full px-1.5 py-0.5'
                          : 'justify-end mt-0.5 -mb-0.5',
                      )}>
                        <span className={clsx(
                          'text-[10px] leading-none',
                          isMedia ? 'text-white' : isOut ? 'text-slate-400' : 'text-slate-400'
                        )}>
                          {format(new Date(msg.timestamp), 'HH:mm')}
                        </span>
                        {isOut && (
                          <span className={isMedia ? '[&_svg]:text-white' : ''}>
                            {statusIcon(msg.status)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] border-t border-slate-200 bg-[#f0f2f5] shrink-0">
        {/* Inputs de arquivo ocultos */}
        <input ref={fileInputImg}   type="file" accept="image/*,video/*"  className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleFileUpload(f.type.startsWith('video/') ? 'video' : 'image', f); } e.target.value = ''; }} />
        <input ref={fileInputAudio} type="file" accept="audio/*"           className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleFileUpload('audio', f); } e.target.value = ''; }} />
        <input ref={fileInputDoc}   type="file"                            className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleFileUpload('document', f); } e.target.value = ''; }} />

        {/* Erro de anexo */}
        {attachError && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 mb-2">
            <AlertCircle size={13} /> {attachError}
            <button onClick={() => setAttachError('')} className="ml-auto"><X size={12} /></button>
          </div>
        )}

        {status === 'resolved' ? (
          <div className="flex items-center justify-center py-2 text-slate-500 text-sm">
            <CheckCheck size={15} className="mr-2 text-accent-500" />
            Atendimento encerrado
          </div>
        ) : (
          <div className="flex items-end gap-2 relative">

            {/* Menu de anexos */}
            {showAttachMenu && (
              <div
                ref={attachMenuRef}
                className="absolute bottom-10 left-0 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 px-1.5 z-30 flex flex-col gap-0.5 min-w-[175px]"
              >
                {/* Overlay para fechar ao clicar fora */}
                <div className="fixed inset-0 z-[-1]" onClick={() => setShowAttachMenu(false)} />

                {[
                  { label: 'Imagem / Vídeo', color: 'bg-green-500',  icon: <Image   size={16} className="text-white" />, action: () => fileInputImg.current?.click()   },
                  { label: 'Áudio',          color: 'bg-purple-500', icon: <Mic     size={16} className="text-white" />, action: () => fileInputAudio.current?.click() },
                  { label: 'Documento',      color: 'bg-blue-500',   icon: <FileText size={16} className="text-white" />, action: () => fileInputDoc.current?.click()  },
                  { label: 'Localização',    color: 'bg-red-500',    icon: <MapPin  size={16} className="text-white" />, action: handleLocation                        },
                ].map(({ label, color, icon, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-50 transition text-left w-full"
                  >
                    <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0', color)}>
                      {icon}
                    </div>
                    <span className="text-sm text-slate-700">{label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Botão Paperclip */}
            <button
              onClick={() => setShowAttachMenu(v => !v)}
              title="Anexar"
              className={clsx(
                'w-8 h-8 flex items-center justify-center rounded-full transition shrink-0',
                showAttachMenu
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-500 hover:text-primary-600 hover:bg-white'
              )}
            >
              {attachLoading
                ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                : <Paperclip size={18} />}
            </button>

            <button
              onClick={() => setShowPix(true)}
              title="Gerar PIX"
              className="w-8 h-8 text-slate-500 hover:text-green-600 flex items-center justify-center rounded-full hover:bg-white transition shrink-0"
            >
              <QrCode size={18} />
            </button>

            <button
              onClick={() => setShowRide(true)}
              title="Solicitar corrida (Uber / 99)"
              className="w-8 h-8 text-slate-500 hover:text-sky-600 flex items-center justify-center rounded-full hover:bg-white transition shrink-0"
            >
              <Car size={18} />
            </button>
            <div className="flex-1 bg-white rounded-2xl flex items-end gap-2 px-3 py-1.5 shadow-sm">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Digite uma mensagem..."
                rows={1}
                className="flex-1 bg-transparent text-sm resize-none focus:outline-none text-slate-800 placeholder-slate-400 max-h-28 leading-relaxed"
                style={{ minHeight: '22px' }}
              />
              <button className="text-slate-400 hover:text-primary-600 transition shrink-0 mb-0.5">
                <Smile size={18} />
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="w-8 h-8 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition shrink-0 shadow-md"
            >
              {sending
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send size={15} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
