import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Wifi, WifiOff, Trash2, Edit3, X,
  CheckCircle, AlertCircle, Loader2, ExternalLink, Copy, Info, Eye, Link2,
  QrCode, Smartphone, RefreshCcw,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Channel } from '../../types';
import { verifyMetaPhone } from '../../utils/meta';
import clsx from 'clsx';

// ─── helpers ──────────────────────────────────────────────────────────────────
const copyText = (t: string) => navigator.clipboard.writeText(t).catch(() => {});

const QUALITY_COLOR: Record<string, string> = {
  GREEN:   'text-accent-600 bg-accent-100',
  YELLOW:  'text-yellow-600 bg-yellow-100',
  RED:     'text-red-600 bg-red-100',
  UNKNOWN: 'text-slate-500 bg-slate-100',
};

/** Canal é considerado "vinculado" se já passou da etapa de configuração */
const isLinked = (ch: Channel) =>
  ch.connectionType === 'qrcode'
    ? ch.status !== 'pending'
    : Boolean(ch.phoneNumberId);

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyChannels({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <Wifi size={32} className="text-slate-400" strokeWidth={1.5} />
      </div>
      <h3 className="font-semibold text-slate-700 text-lg mb-1">Nenhum canal cadastrado</h3>
      <p className="text-slate-500 text-sm max-w-xs">
        Crie um canal e, depois, vincule um número WhatsApp Business para ativá-lo.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md"
      >
        <Plus size={16} /> Criar canal
      </button>
    </div>
  );
}

// ─── Modal mode ────────────────────────────────────────────────────────────────
type ModalMode = 'create' | 'link' | 'view' | 'reconnect';
interface ModalState { mode: ModalMode; channel?: Channel }

// ─── Main component ────────────────────────────────────────────────────────────
export default function Channels() {
  const { channels, addChannel, updateChannel, deleteChannel } = useApp();
  const [modal, setModal] = useState<ModalState | null>(null);
  const close = () => setModal(null);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Canais</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Números WhatsApp Business vinculados via Meta API ou QR Code
          </p>
        </div>
        {channels.length > 0 && (
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md"
          >
            <Plus size={16} /> Novo canal
          </button>
        )}
      </div>

      <WebhookInfoCard />

      {channels.length === 0 ? (
        <EmptyChannels onAdd={() => setModal({ mode: 'create' })} />
      ) : (
        <div className="grid gap-4 mt-4">
          {channels.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              onView={() => setModal({ mode: 'view', channel: ch })}
              onLink={() => setModal({ mode: 'link', channel: ch })}
              onReconnect={() => setModal({ mode: 'reconnect', channel: ch })}
              onDelete={() => deleteChannel(ch.id)}
              onToggle={() =>
                updateChannel(ch.id, { status: ch.status === 'active' ? 'inactive' : 'active' })
              }
            />
          ))}
        </div>
      )}

      {modal?.mode === 'create' && (
        <CreateModal
          onClose={close}
          onSave={(name) => {
            addChannel({
              name,
              phoneNumber: '', phoneNumberId: '', wabaId: '', accessToken: '',
              verifiedName: '', qualityRating: 'UNKNOWN', metaStatus: '',
              status: 'pending',
            });
            close();
          }}
        />
      )}

      {modal?.mode === 'link' && modal.channel && (
        <LinkModal
          channel={modal.channel}
          onClose={close}
          onSave={(data) => { updateChannel(modal.channel!.id, data); close(); }}
        />
      )}

      {modal?.mode === 'reconnect' && modal.channel && (
        <LinkModal
          channel={modal.channel}
          initialMode="qrcode"
          onClose={close}
          onSave={(data) => { updateChannel(modal.channel!.id, data); close(); }}
        />
      )}

      {modal?.mode === 'view' && modal.channel && (
        <ViewModal channel={modal.channel} onClose={close} />
      )}
    </div>
  );
}

// ─── Webhook info card ─────────────────────────────────────────────────────────
function WebhookInfoCard() {
  const url = `${window.location.origin}/api/webhook/whatsapp`;
  const [copied, setCopied] = useState(false);
  const copy = () => { copyText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="bg-primary-50 border border-primary-200 rounded-2xl p-4 mb-2 flex gap-3">
      <Info size={18} className="text-primary-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-primary-800 mb-0.5">Configure o Webhook no Meta Business Manager</p>
        <p className="text-xs text-primary-700 mb-2">
          Para receber mensagens, configure esta URL no BM › WhatsApp › Configuração › Webhook:
        </p>
        <div className="flex items-center gap-2 bg-white border border-primary-200 rounded-xl px-3 py-2">
          <code className="text-xs text-primary-700 flex-1 truncate">{url}</code>
          <button onClick={copy} className="shrink-0 text-primary-500 hover:text-primary-700 transition">
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <p className="text-xs text-primary-600 mt-1.5">
          Inscreva nos eventos:{' '}
          <code className="bg-primary-100 rounded px-1">messages</code>{' '}
          <code className="bg-primary-100 rounded px-1">message_deliveries</code>{' '}
          <code className="bg-primary-100 rounded px-1">message_reads</code>
        </p>
      </div>
      <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
        target="_blank" rel="noopener noreferrer"
        className="shrink-0 text-primary-500 hover:text-primary-700 transition mt-0.5" title="Documentação Meta">
        <ExternalLink size={16} />
      </a>
    </div>
  );
}

// ─── Channel card ──────────────────────────────────────────────────────────────
function ChannelCard({
  channel: ch, onView, onLink, onDelete, onToggle, onReconnect,
}: {
  channel: Channel; onView: () => void; onLink: () => void;
  onDelete: () => void; onToggle: () => void; onReconnect: () => void;
}) {
  const linked = isLinked(ch);
  const isQR   = ch.connectionType === 'qrcode';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className={clsx(
          'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
          ch.status === 'active' ? 'bg-accent-100' : ch.status === 'pending' ? 'bg-yellow-100' : 'bg-slate-100',
        )}>
          {ch.status === 'active'
            ? (isQR ? <Smartphone size={22} className="text-accent-600" /> : <Wifi size={22} className="text-accent-600" />)
            : ch.status === 'pending'
              ? <Link2 size={22} className="text-yellow-600" />
              : <WifiOff size={22} className="text-slate-400" />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800">{ch.name}</p>
            <StatusBadge status={ch.status} />
            {isQR && linked && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium flex items-center gap-1">
                <QrCode size={10} /> QR Code
              </span>
            )}
            {linked && ch.qualityRating && ch.qualityRating !== 'UNKNOWN' && !isQR && (
              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', QUALITY_COLOR[ch.qualityRating] ?? QUALITY_COLOR.UNKNOWN)}>
                {ch.qualityRating}
              </span>
            )}
          </div>

          {linked ? (
            <>
              <p className="text-sm text-slate-600 font-medium mt-0.5">
                {ch.phoneNumber}
                {ch.verifiedName && <span className="text-slate-400 font-normal"> · {ch.verifiedName}</span>}
              </p>
              {!isQR && (
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  <span>Phone ID: <code className="text-slate-500">{ch.phoneNumberId}</code></span>
                  <span>WABA: <code className="text-slate-500">{ch.wabaId}</code></span>
                </div>
              )}
              {isQR && ch.evolutionInstanceName && (
                <div className="text-xs text-slate-400 mt-1">
                  Instância: <code className="text-slate-500">{ch.evolutionInstanceName}</code>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-orange-500 mt-0.5 flex items-center gap-1">
              <AlertCircle size={13} />
              Número não vinculado — clique em &ldquo;Vincular número&rdquo; para ativar
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {linked ? (
          <>
            {isQR && (
              <button onClick={onReconnect} title="Reconectar QR Code"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-medium transition">
                <RefreshCcw size={13} /> Reconectar
              </button>
            )}
            <button onClick={onToggle}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition',
                ch.status === 'active' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-accent-50 text-accent-700 hover:bg-accent-100'
              )}>
              {ch.status === 'active' ? 'Desativar' : 'Ativar'}
            </button>
            <button onClick={onView} title="Ver detalhes"
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center transition">
              <Eye size={16} />
            </button>
          </>
        ) : (
          <button onClick={onLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 rounded-lg text-xs font-medium transition">
            <Edit3 size={13} /> Vincular número
          </button>
        )}
        <button onClick={onDelete} title="Excluir canal"
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Channel['status'] }) {
  if (status === 'active')
    return <span className="text-xs px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 font-medium">Ativo</span>;
  if (status === 'inactive')
    return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Inativo</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pendente</span>;
}

// ─── Modal: criar canal (apenas nome) ─────────────────────────────────────────
function CreateModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Criar canal</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={18} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(name.trim()); }} className="p-6 space-y-5">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800 flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-yellow-600" />
            <span>O canal será criado sem número vinculado. Edite-o depois para conectar via <strong>Meta API</strong> ou <strong>QR Code</strong>.</span>
          </div>
          <div>
            <label className="field-label">Nome do canal</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="input"
              placeholder="Ex: Suporte Principal" autoFocus />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button type="submit" disabled={!name.trim()}
              className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition">
              Criar canal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: vincular número — Meta API ou QR Code ─────────────────────────────
type LinkMode    = 'meta' | 'qrcode';
type VerifyState = 'idle' | 'loading' | 'ok' | 'error';
type QrState     = 'idle' | 'loading' | 'waiting' | 'connected' | 'error';

function LinkModal({
  channel, onClose, onSave, initialMode = 'meta',
}: {
  channel: Channel; onClose: () => void; onSave: (data: Partial<Channel>) => void;
  initialMode?: LinkMode;
}) {
  const [mode, setMode] = useState<LinkMode>(initialMode);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-semibold text-slate-800">Vincular número — {channel.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Escolha como conectar este canal</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={18} /></button>
        </div>

        {/* Mode tabs */}
        <div className="px-6 pt-5 pb-0 flex gap-2">
          <button
            onClick={() => setMode('meta')}
            className={clsx('flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 transition',
              mode === 'meta' ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-200 text-slate-600 hover:border-primary-300',
            )}>
            <Wifi size={15} /> Meta Cloud API
          </button>
          <button
            onClick={() => setMode('qrcode')}
            className={clsx('flex-1 py-2.5 rounded-xl text-sm font-medium border-2 flex items-center justify-center gap-2 transition',
              mode === 'qrcode' ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-200 text-slate-600 hover:border-purple-300',
            )}>
            <QrCode size={15} /> QR Code
          </button>
        </div>

        {mode === 'meta'   && <MetaLinkPanel   channel={channel} onClose={onClose} onSave={onSave} />}
        {mode === 'qrcode' && <QrCodeLinkPanel channel={channel} onClose={onClose} onSave={onSave} />}
      </div>
    </div>
  );
}

// ─── Meta Cloud API panel ──────────────────────────────────────────────────────
function MetaLinkPanel({
  channel, onClose, onSave,
}: {
  channel: Channel; onClose: () => void; onSave: (data: Partial<Channel>) => void;
}) {
  const [form, setForm] = useState({ phoneNumberId: '', wabaId: '', accessToken: '' });
  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [verifyError, setVerifyError] = useState('');
  const [metaInfo, setMetaInfo] = useState<{
    displayPhone: string; verifiedName: string; qualityRating: string; status: string;
  } | null>(null);

  const canVerify = form.phoneNumberId.trim() && form.accessToken.trim();

  const handleVerify = async () => {
    setVerifyState('loading'); setVerifyError(''); setMetaInfo(null);
    try {
      const info = await verifyMetaPhone(form.phoneNumberId.trim(), form.accessToken.trim());
      setMetaInfo(info); setVerifyState('ok');
    } catch (err: unknown) {
      setVerifyState('error');
      setVerifyError(err instanceof Error ? err.message : 'Erro ao verificar com a Meta');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyState !== 'ok' || !metaInfo) return;
    onSave({
      connectionType: 'meta',
      phoneNumberId: form.phoneNumberId.trim(),
      wabaId: form.wabaId.trim(),
      accessToken: form.accessToken.trim(),
      phoneNumber: metaInfo.displayPhone,
      verifiedName: metaInfo.verifiedName,
      qualityRating: metaInfo.qualityRating,
      metaStatus: metaInfo.status,
      status: 'active',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
        <p className="font-semibold text-slate-700">Como obter as credenciais:</p>
        <p>1. Acesse <a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">business.facebook.com</a> → WhatsApp → API Setup</p>
        <p>2. Copie o <strong>Phone Number ID</strong> e o <strong>WhatsApp Business Account ID</strong></p>
        <p>3. Crie um <strong>System User</strong> com permissão <code>whatsapp_business_messaging</code> e gere o token</p>
      </div>

      <div>
        <label className="field-label">Phone Number ID</label>
        <input value={form.phoneNumberId}
          onChange={(e) => { setForm({ ...form, phoneNumberId: e.target.value }); setVerifyState('idle'); setMetaInfo(null); }}
          required className="input font-mono" placeholder="123456789012345" />
      </div>
      <div>
        <label className="field-label">WhatsApp Business Account ID (WABA)</label>
        <input value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
          required className="input font-mono" placeholder="987654321098765" />
      </div>
      <div>
        <label className="field-label">Access Token <span className="text-slate-400 font-normal">(token permanente)</span></label>
        <input type="password" value={form.accessToken}
          onChange={(e) => { setForm({ ...form, accessToken: e.target.value }); setVerifyState('idle'); setMetaInfo(null); }}
          required className="input font-mono" placeholder="EAAxxxxxx..." />
      </div>

      <button type="button" onClick={handleVerify} disabled={!canVerify || verifyState === 'loading'}
        className="w-full py-2.5 border-2 border-primary-200 text-primary-700 rounded-xl text-sm font-medium hover:bg-primary-50 disabled:opacity-50 transition flex items-center justify-center gap-2">
        {verifyState === 'loading' && <Loader2 size={15} className="animate-spin" />}
        {verifyState === 'ok'      && <CheckCircle size={15} className="text-accent-500" />}
        {verifyState === 'error'   && <AlertCircle size={15} className="text-red-500" />}
        {verifyState === 'idle' ? 'Verificar credenciais com a Meta' :
         verifyState === 'loading' ? 'Verificando…' :
         verifyState === 'ok'   ? 'Verificado ✓' : 'Tentar novamente'}
      </button>

      {verifyState === 'ok' && metaInfo && (
        <div className="bg-accent-50 border border-accent-200 rounded-xl p-4 space-y-1.5">
          <p className="text-sm font-semibold text-accent-700 flex items-center gap-1.5"><CheckCircle size={16} /> Número verificado</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-slate-500">Número:</span><span className="font-medium">{metaInfo.displayPhone}</span>
            <span className="text-slate-500">Nome:</span><span className="font-medium">{metaInfo.verifiedName || '—'}</span>
            <span className="text-slate-500">Qualidade:</span>
            <span className={clsx('font-medium', QUALITY_COLOR[metaInfo.qualityRating]?.split(' ')[0])}>{metaInfo.qualityRating}</span>
          </div>
        </div>
      )}
      {verifyState === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{verifyError}</p>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
        <button type="submit" disabled={verifyState !== 'ok'}
          className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition">
          Salvar e ativar canal
        </button>
      </div>
    </form>
  );
}

// ─── QR Code / Evolution API panel ────────────────────────────────────────────
/** Credenciais padrão do docker-compose local (nex-chat/evolution-api/) */
const EVO_LOCAL_URL = 'http://localhost:8080';
const EVO_LOCAL_KEY = 'nex-evo-2024';

/**
 * Tenta extrair o QR Code de uma resposta da Evolution API v1 ou v2.
 * v2: resposta do /instance/create  → { qrcode: { base64 } }
 * v1: resposta do /instance/connect → { base64 }
 */
function extractQr(data: Record<string, unknown>): string | null {
  // v2 create response
  const qrcode = data.qrcode as Record<string, unknown> | undefined;
  if (typeof qrcode?.base64 === 'string') return qrcode.base64;
  // v1 / v2 connect response
  if (typeof data.base64 === 'string') return data.base64;
  return null;
}

function QrCodeLinkPanel({
  channel, onClose, onSave,
}: {
  channel: Channel; onClose: () => void; onSave: (data: Partial<Channel>) => void;
}) {
  const defaultInstance = channel.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);

  // ── form state ─────────────────────────────────────────────────────
  const [apiUrl,       setApiUrl]       = useState(EVO_LOCAL_URL);
  const [apiKey,       setApiKey]       = useState(EVO_LOCAL_KEY);
  const [instanceName, setInstanceName] = useState(defaultInstance);

  // ── flow state ─────────────────────────────────────────────────────
  const [qrState,       setQrState]       = useState<QrState>('idle');
  const [qrBase64,      setQrBase64]      = useState('');
  const [qrError,       setQrError]       = useState('');
  const [connectedPhone,setConnectedPhone]= useState('');
  const [qrExpiry,      setQrExpiry]      = useState<number | null>(null); // timestamp ms
  const [serverOk,      setServerOk]      = useState<boolean | null>(null);

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);

  useEffect(() => () => {
    if (pollRef.current)   clearInterval(pollRef.current);
    if (expiryRef.current) clearTimeout(expiryRef.current);
  }, []);

  const base = () => apiUrl.replace(/\/+$/, '');
  const hdrs = () => ({ apikey: apiKey, 'Content-Type': 'application/json' });

  // ── 1. Verificar servidor ─────────────────────────────────────────
  const checkServer = async () => {
    setServerOk(null);
    try {
      const res = await fetch(`${base()}/`, { signal: AbortSignal.timeout(5000) });
      setServerOk(res.ok || res.status < 500);
    } catch {
      setServerOk(false);
    }
  };

  // ── 2. Iniciar conexão ────────────────────────────────────────────
  const startConnect = async () => {
    setQrState('loading'); setQrError(''); setQrBase64('');
    try {
      // Se a instância já existe (reconexão), faz logout para limpar sessão
      // e vai direto para /instance/connect — sem tentar criar de novo.
      const existingInstance = channel.evolutionInstanceName;
      if (existingInstance && existingInstance === instanceName) {
        // Força logout para limpar sessão corrompida (ignora erro se já estava desconectado)
        await fetch(`${base()}/instance/logout/${instanceName}`, {
          method: 'DELETE', headers: hdrs(),
        }).catch(() => {});

        // Aguarda o Baileys liberar a sessão
        await new Promise((r) => setTimeout(r, 2_000));

        // Busca QR diretamente
        const res  = await fetch(`${base()}/instance/connect/${instanceName}`, { headers: hdrs() });
        const data = await res.json() as Record<string, unknown>;
        const qr   = extractQr(data);
        const state = (data as { instance?: { state?: string } }).instance?.state;

        if (!qr && state === 'open') { await handleConnected(); return; }
        if (!qr) throw new Error('Não foi possível obter o QR Code após reconexão.');

        setQrBase64(qr);
        setQrState('waiting');
        scheduleQrRefresh();
        startPolling();
        return;
      }

      // ── Nova instância ──────────────────────────────────────────────
      // Cria instância — v1 já retorna QR no create
      // v2 requer integration:WHATSAPP-BAILEYS (v1 ignora o campo)
      const createRes  = await fetch(`${base()}/instance/create`, {
        method: 'POST',
        headers: hdrs(),
        body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      });
      const createData = await createRes.json() as Record<string, unknown>;

      // Instância pode já existir (409/403) — segue para buscar QR
      const isAlreadyExists = createRes.status === 409 ||
        (createRes.status === 403 && JSON.stringify(createData).toLowerCase().includes('already in use'));

      if (!createRes.ok && !isAlreadyExists) {
        const resp     = createData.response as Record<string, unknown> | undefined;
        const msgField = (resp?.message ?? createData.message) as string | string[] | undefined;
        const msg      = Array.isArray(msgField) ? msgField[0] : (msgField ?? `Erro ${createRes.status}`);
        throw new Error(String(msg));
      }

      // Tenta extrair QR da resposta do create (v1 retorna direto)
      let qr: string | null = extractQr(createData);

      // Se não veio no create (v2 gera async), faz poll em /instance/connect
      if (!qr) {
        for (let i = 0; i < 10 && !qr; i++) {
          await new Promise((r) => setTimeout(r, 3_000));
          const res  = await fetch(`${base()}/instance/connect/${instanceName}`, { headers: hdrs() });
          const data = await res.json() as Record<string, unknown>;
          qr = extractQr(data);
          // Instância já estava conectada (reconexão)
          const state = (data as { instance?: { state?: string } }).instance?.state;
          if (!qr && state === 'open') { await handleConnected(); return; }
        }
      }

      if (!qr) throw new Error('Não foi possível obter o QR Code — verifique os logs do Docker.');

      setQrBase64(qr);
      setQrState('waiting');
      scheduleQrRefresh();
      startPolling();

    } catch (err: unknown) {
      setQrState('error');
      const msg = err instanceof Error ? err.message : 'Erro ao conectar com Evolution API';
      setQrError(
        msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('failed')
          ? 'Não foi possível conectar ao servidor. Verifique se a Evolution API está rodando em ' + base()
          : msg
      );
    }
  };

  // ── QR auto-refresh (QR expira em ~60 s) ─────────────────────────
  const scheduleQrRefresh = () => {
    if (expiryRef.current) clearTimeout(expiryRef.current);
    const expiresAt = Date.now() + 58_000; // 58 s
    setQrExpiry(expiresAt);
    expiryRef.current = setTimeout(async () => {
      if (pollRef.current) {
        // Ainda aguardando — renova QR
        try {
          const res  = await fetch(`${base()}/instance/connect/${instanceName}`, { headers: hdrs() });
          const data = await res.json() as Record<string, unknown>;
          const qr   = extractQr(data);
          if (qr) { setQrBase64(qr); scheduleQrRefresh(); }
        } catch { /* ignora */ }
      }
    }, 58_000);
  };

  // ── Polling de status ─────────────────────────────────────────────
  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${base()}/instance/connectionState/${instanceName}`, { headers: hdrs() });
        const data = await res.json() as { instance?: { state?: string } };
        if (data.instance?.state === 'open') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (expiryRef.current) clearTimeout(expiryRef.current);
          await handleConnected();
        }
      } catch { /* ignora falhas isoladas de poll */ }
    }, 3_000);
  };

  // ── Pós-conexão: busca número ─────────────────────────────────────
  const handleConnected = async () => {
    setQrState('connected');
    try {
      const res  = await fetch(`${base()}/instance/fetchInstances?instanceName=${instanceName}`, { headers: hdrs() });
      const data = await res.json() as Array<{ instance?: { ownerJid?: string; wuid?: string } }>;
      const jid  = data?.[0]?.instance?.ownerJid ?? data?.[0]?.instance?.wuid ?? '';
      const num  = jid.replace(/@.+/, '');
      // Formata como +55 (11) 99999-9999 se possível
      setConnectedPhone(num ? `+${num}` : 'Conectado com sucesso');
    } catch {
      setConnectedPhone('Conectado com sucesso');
    }
  };

  const handleCancel = () => {
    if (pollRef.current)   clearInterval(pollRef.current);
    if (expiryRef.current) clearTimeout(expiryRef.current);
    setQrState('idle'); setQrBase64(''); setQrExpiry(null);
  };

  const handleSave = async () => {
    // Configura webhook na Evolution API apontando para o servidor local
    const webhookUrl = 'http://host.docker.internal:3001/webhook';
    try {
      await fetch(`${apiUrl.replace(/\/+$/, '')}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          webhook_by_events: false,
          webhook_base64:    false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
        }),
      });
    } catch (e) {
      console.warn('[QR] Falha ao configurar webhook (não crítico):', e);
    }

    onSave({
      connectionType: 'qrcode',
      evolutionApiUrl: apiUrl,
      evolutionApiKey: apiKey,
      evolutionInstanceName: instanceName,
      phoneNumber: connectedPhone,
      verifiedName: '',
      qualityRating: 'UNKNOWN',
      metaStatus: 'open',
      status: 'active',
    });
  };

  const canStart = qrState === 'idle' && apiUrl.trim() && apiKey.trim() && instanceName.trim();

  // Conta regressiva até expirar QR
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (!qrExpiry) return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((qrExpiry - Date.now()) / 1000));
      setCountdown(left);
    }, 1000);
    return () => clearInterval(iv);
  }, [qrExpiry]);

  return (
    <div className="p-6 space-y-5">

      {/* ── Passo 0: banner informativo ── */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-xs text-purple-800 space-y-2">
        <p className="font-semibold text-purple-900 flex items-center gap-1.5">
          <QrCode size={14} /> Conexão via QR Code — Evolution API (Baileys)
        </p>
        <p>Funciona com a <strong>Evolution API</strong> rodando localmente via Docker.
          Os campos abaixo já estão preenchidos com as credenciais do <code>docker-compose</code>
          disponível em <code>nex-chat/evolution-api/</code>.</p>
        <a href="https://github.com/EvolutionAPI/evolution-api" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-purple-700 underline hover:text-purple-900">
          <ExternalLink size={11} /> Repositório oficial
        </a>
      </div>

      {/* ── Passo 1: campos de credenciais ── */}
      {qrState === 'idle' && (
        <>
          <div>
            <label className="field-label">URL da Evolution API</label>
            <input value={apiUrl} onChange={(e) => { setApiUrl(e.target.value); setServerOk(null); }}
              className="input font-mono" placeholder="http://localhost:8080" />
          </div>
          <div>
            <label className="field-label">API Key</label>
            <div className="relative">
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                className="input font-mono pr-10" placeholder="nex-evo-2024" />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Valor configurado em <code>AUTHENTICATION_API_KEY</code> no docker-compose.
            </p>
          </div>
          <div>
            <label className="field-label">Nome da instância</label>
            <input value={instanceName} onChange={(e) => setInstanceName(e.target.value.replace(/[^a-z0-9_]/g, ''))}
              className="input font-mono" placeholder="suporte_principal" />
            <p className="text-xs text-slate-400 mt-1">Apenas letras minúsculas, números e underscore.</p>
          </div>

          {/* Botão de checar servidor */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={checkServer} disabled={!apiUrl.trim()}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5">
              <Wifi size={12} /> Testar servidor
            </button>
            {serverOk === true  && <span className="text-xs text-accent-600 flex items-center gap-1"><CheckCircle size={12} /> Servidor acessível</span>}
            {serverOk === false && <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> Servidor não encontrado</span>}
          </div>
        </>
      )}

      {/* ── Loading ── */}
      {qrState === 'loading' && (
        <div className="flex flex-col items-center py-10 gap-3">
          <Loader2 size={36} className="animate-spin text-purple-600" />
          <p className="text-sm text-slate-600">Criando instância e gerando QR Code…</p>
        </div>
      )}

      {/* ── QR Code ── */}
      {qrState === 'waiting' && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative bg-white border-2 border-purple-300 rounded-2xl p-4 shadow-md">
            {qrBase64
              ? <img src={qrBase64} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
              : <div className="w-56 h-56 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-purple-400" /></div>
            }
            {countdown > 0 && countdown <= 15 && (
              <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center">
                <p className="text-sm font-semibold text-orange-600">Renovando QR… {countdown}s</p>
              </div>
            )}
          </div>
          <div className="text-center space-y-1">
            <div className="flex items-center gap-2 text-sm text-slate-600 justify-center">
              <Loader2 size={14} className="animate-spin text-purple-600 shrink-0" />
              Aguardando leitura do QR Code…
            </div>
            {qrExpiry && countdown > 15 && (
              <p className="text-xs text-slate-400">Expira em {countdown}s — será renovado automaticamente</p>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1 w-full">
            <p className="font-semibold text-slate-700">Como escanear:</p>
            <p>1. Abra o <strong>WhatsApp</strong> no celular</p>
            <p>2. Toque em <strong>⋮ → Dispositivos conectados → Conectar dispositivo</strong></p>
            <p>3. Aponte a câmera para o QR Code acima</p>
          </div>
          <button onClick={handleCancel}
            className="text-xs text-slate-400 hover:text-slate-600 underline transition">Cancelar</button>
        </div>
      )}

      {/* ── Conectado ── */}
      {qrState === 'connected' && (
        <div className="flex flex-col items-center gap-5 py-4">
          <div className="w-20 h-20 bg-accent-100 rounded-full flex items-center justify-center">
            <CheckCircle size={40} className="text-accent-600" />
          </div>
          <div className="text-center">
            <p className="font-bold text-accent-700 text-xl">WhatsApp conectado!</p>
            {connectedPhone && (
              <p className="text-slate-600 text-sm mt-1 font-mono">{connectedPhone}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">Instância: {instanceName}</p>
          </div>
          <div className="flex gap-3 w-full">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button onClick={handleSave}
              className="flex-1 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-xl text-sm font-medium transition shadow-md">
              Salvar canal
            </button>
          </div>
        </div>
      )}

      {/* ── Erro ── */}
      {qrState === 'error' && (
        <>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700 mb-1">Falha na conexão</p>
              <p className="text-xs text-red-600">{qrError}</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Verifique:</p>
            <p>• A Evolution API está rodando? (<code>docker compose up</code>)</p>
            <p>• A URL é <code>http://localhost:8080</code>?</p>
            <p>• A API Key bate com o <code>docker-compose.yml</code>?</p>
            <p>• O Docker Desktop está iniciado?</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={() => setQrState('idle')}
              className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition">
              Tentar novamente
            </button>
          </div>
        </>
      )}

      {/* ── Botões do estado idle ── */}
      {qrState === 'idle' && (
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
            Cancelar
          </button>
          <button type="button" onClick={startConnect} disabled={!canStart}
            className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2 shadow-md">
            <QrCode size={15} /> Gerar QR Code
          </button>
        </div>
      )}

      <div>
        <label className="field-label">Nome da instância</label>
        <input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} disabled={qrState !== 'idle'}
          className="input font-mono" placeholder="meu_canal_suporte" />
        <p className="text-xs text-slate-400 mt-1">Identificador único da conexão no servidor Evolution API.</p>
      </div>

      {/* Connect button */}
      {qrState === 'idle' && (
        <button onClick={startConnect} disabled={!canStart}
          className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition flex items-center justify-center gap-2">
          <QrCode size={15} /> Gerar QR Code
        </button>
      )}

      {/* Loading */}
      {qrState === 'loading' && (
        <div className="flex flex-col items-center py-8 gap-3">
          <Loader2 size={32} className="animate-spin text-purple-600" />
          <p className="text-sm text-slate-600">Conectando ao servidor…</p>
        </div>
      )}

      {/* QR Code */}
      {qrState === 'waiting' && qrBase64 && (
        <div className="flex flex-col items-center gap-4">
          <div className="bg-white border-2 border-purple-200 rounded-2xl p-4 shadow-md">
            <img src={qrBase64} alt="QR Code WhatsApp" className="w-52 h-52 object-contain" />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={14} className="animate-spin text-purple-600 shrink-0" />
            Aguardando leitura do QR Code no WhatsApp…
          </div>
          <p className="text-xs text-slate-400 text-center">
            Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
          </p>
          <button onClick={() => { clearInterval(pollRef.current!); setQrState('idle'); setQrBase64(''); }}
            className="text-xs text-slate-500 hover:text-slate-700 underline">Cancelar</button>
        </div>
      )}

      {/* Connected */}
      {qrState === 'connected' && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center">
            <CheckCircle size={32} className="text-accent-600" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-accent-700 text-lg">Conectado!</p>
            {connectedPhone && <p className="text-slate-600 text-sm mt-0.5">{connectedPhone}</p>}
          </div>
          <div className="flex gap-3 w-full pt-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={handleSave}
              className="flex-1 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-xl text-sm font-medium transition">
              Salvar canal
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {qrState === 'error' && (
        <>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{qrError}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
            <button onClick={() => setQrState('idle')}
              className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition">
              Tentar novamente
            </button>
          </div>
        </>
      )}

      {/* Cancel button for idle */}
      {qrState === 'idle' && (
        <button onClick={onClose}
          className="w-full py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
          Cancelar
        </button>
      )}
    </div>
  );
}

// ─── Modal: visualizar canal (somente leitura) ────────────────────────────────
function ViewModal({ channel: ch, onClose }: { channel: Channel; onClose: () => void }) {
  const [copiedToken, setCopiedToken] = useState(false);
  const isQR = ch.connectionType === 'qrcode';

  const copyToken = () => {
    copyText(isQR ? (ch.evolutionApiKey ?? '') : ch.accessToken);
    setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000);
  };

  type Row = { label: string; value: string; mono?: boolean; secret?: boolean; hide?: boolean };
  const rows: Row[] = isQR
    ? [
        { label: 'Nome',            value: ch.name },
        { label: 'Número',          value: ch.phoneNumber || '—' },
        { label: 'Instância',       value: ch.evolutionInstanceName ?? '—', mono: true },
        { label: 'URL Evolution',   value: ch.evolutionApiUrl ?? '—', mono: true },
        { label: 'API Key',         value: ch.evolutionApiKey ?? '', mono: true, secret: true },
        { label: 'Tipo de conexão', value: 'QR Code (Baileys/Evolution API)' },
      ]
    : [
        { label: 'Nome',            value: ch.name },
        { label: 'Número',          value: ch.phoneNumber || '—' },
        { label: 'Nome verificado', value: ch.verifiedName || '—' },
        { label: 'Phone Number ID', value: ch.phoneNumberId, mono: true },
        { label: 'WABA ID',         value: ch.wabaId, mono: true },
        { label: 'Access Token',    value: ch.accessToken, mono: true, secret: true },
        { label: 'Qualidade',       value: ch.qualityRating },
        { label: 'Status Meta',     value: ch.metaStatus },
      ];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-semibold text-slate-800">Detalhes do canal</h3>
            <p className="text-xs text-slate-500 mt-0.5">Apenas visualização — canal vinculado não pode ser editado</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-2 text-xs text-blue-700">
            <Info size={14} className="shrink-0 mt-0.5 text-blue-500" />
            Para alterar as credenciais, exclua este canal e crie um novo.
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
            {rows.filter((r) => !r.hide).map(({ label, value, mono, secret }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3 bg-white">
                <span className="text-xs text-slate-500 w-36 shrink-0">{label}</span>
                {secret ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <code className="text-xs text-slate-600 truncate flex-1">
                      {value ? `${value.slice(0, 12)}${'•'.repeat(Math.max(0, value.length - 12))}` : '—'}
                    </code>
                    <button onClick={copyToken} className="shrink-0 text-slate-400 hover:text-primary-600 transition" title="Copiar">
                      {copiedToken ? <CheckCircle size={13} className="text-accent-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                ) : (
                  <span className={clsx('text-sm text-slate-700 flex-1 truncate', mono && 'font-mono text-xs')}>
                    {value || '—'}
                  </span>
                )}
              </div>
            ))}
          </div>
          <button onClick={onClose}
            className="w-full mt-2 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
