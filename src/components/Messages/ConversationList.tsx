import React, { useState, useRef, useEffect } from 'react';
import { Search, MessageSquarePlus, UsersRound, History, CheckCheck, SlidersHorizontal, X, Phone, Send, ChevronDown, WifiOff } from 'lucide-react';
import { Conversation } from '../../types';
import { useApp, SERVER_URL, apiFetch } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';

const statusColors = {
  open:        'bg-accent-500',
  in_progress: 'bg-primary-500',
  resolved:    'bg-slate-300',
  bot:         'bg-purple-500',
};

const statusLabels = {
  open:        'Aberto',
  in_progress: 'Em atend.',
  resolved:    'Resolvido',
  bot:         'Bot',
};

type ActiveFilter = 'all' | 'open' | 'in_progress' | 'bot';
type Section = 'active' | 'resolved';

const ACTIVE_TABS: { id: ActiveFilter; label: string }[] = [
  { id: 'all',         label: 'Todos'     },
  { id: 'open',        label: 'Abertos'   },
  { id: 'in_progress', label: 'Em atend.' },
  { id: 'bot',         label: 'Bot'       },
];

export default function ConversationList({ onSelect }: { onSelect?: () => void } = {}) {
  const { conversations, activeConversation, setActiveConversation, groups, channels, serverOnline } = useApp();
  const { user } = useAuth();

  const [section,        setSection]        = useState<Section>('active');
  const [activeTab,      setActiveTab]      = useState<ActiveFilter>('all');
  const [search,         setSearch]         = useState('');
  const [groupFilter,    setGroupFilter]    = useState<string>('all');
  const [showFilters,    setShowFilters]    = useState(false);
  const [showNewConv,    setShowNewConv]    = useState(false);

  const canFilterGroups = user?.role === 'superadmin' || user?.role === 'admin';

  const active   = conversations.filter(c => c.status !== 'resolved');
  const resolved = conversations.filter(c => c.status === 'resolved');

  const applySearch = (list: Conversation[]) =>
    list.filter(c =>
      c.contact.name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact.phone.includes(search)
    );

  const applyGroup = (list: Conversation[]) =>
    groupFilter === 'all'  ? list :
    groupFilter === 'none' ? list.filter(c => !c.groupId) :
                             list.filter(c => c.groupId === groupFilter);

  const filteredActive = applyGroup(applySearch(active))
    .filter(c => activeTab === 'all' || c.status === activeTab)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const filteredResolved = applyGroup(applySearch(resolved))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const unreadTotal  = active.reduce((acc, c) => acc + c.unreadCount, 0);
  const currentList  = section === 'active' ? filteredActive : filteredResolved;

  return (
    <div className="w-full flex flex-col bg-white h-full min-h-0 overflow-hidden border-r border-slate-100">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
        {/* Título + botões */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-800 text-base md:text-sm">Conversas</h2>
            {unreadTotal > 0 && (
              <span className="bg-primary-600 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-medium">
                {unreadTotal > 99 ? '99+' : unreadTotal}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canFilterGroups && groups.length > 0 && (
              <button
                onClick={() => setShowFilters(v => !v)}
                className={clsx(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition',
                  showFilters
                    ? 'bg-primary-100 text-primary-600'
                    : 'text-slate-400 hover:text-primary-600 hover:bg-primary-50'
                )}
                title="Filtrar por grupo"
              >
                <SlidersHorizontal size={16} />
              </button>
            )}
            <button
              onClick={() => setShowNewConv(true)}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center transition"
              title="Nova conversa"
            >
              <MessageSquarePlus size={18} />
            </button>
          </div>
        </div>

        {/* Barra de busca */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar conversa..."
            className="w-full pl-9 pr-8 py-2.5 md:py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtro de grupo - expansível */}
        {showFilters && canFilterGroups && groups.length > 0 && (
          <div className="relative mt-2">
            <UsersRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              className="w-full pl-8 pr-4 py-2.5 md:py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-600 appearance-none transition"
            >
              <option value="all">Todos os grupos</option>
              <option value="none">Sem grupo</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Seção: Ativos / Resolvidas ── */}
      <div className="grid grid-cols-2 border-b border-slate-100 shrink-0">
        {[
          { id: 'active'   as Section, icon: MessageSquarePlus, label: 'Ativos',    count: active.length   },
          { id: 'resolved' as Section, icon: History,           label: 'Resolvidas', count: resolved.length },
        ].map(({ id, icon: Icon, label, count }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={clsx(
              'py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition border-b-2',
              section === id
                ? id === 'active'
                  ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                  : 'border-slate-500 text-slate-700 bg-slate-50/80'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            )}
          >
            <Icon size={13} />
            {label}
            {count > 0 && (
              <span className={clsx(
                'text-[10px] rounded-full px-1.5 py-0.5 font-bold leading-none',
                section === id
                  ? id === 'active' ? 'bg-primary-600 text-white' : 'bg-slate-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              )}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Sub-tabs (apenas Ativos) ── */}
      {section === 'active' && (
        <div className="flex gap-1 px-3 py-2 border-b border-slate-100 overflow-x-auto scrollbar-none shrink-0">
          {ACTIVE_TABS.map(({ id, label }) => {
            const count = id === 'all' ? active.length : active.filter(c => c.status === id).length;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={clsx(
                  'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition font-medium shrink-0',
                  activeTab === id
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 bg-slate-50'
                )}
              >
                {label}
                {count > 0 && (
                  <span className={clsx(
                    'text-[9px] rounded-full px-1 leading-[14px] font-bold',
                    activeTab === id ? 'bg-white/30 text-white' : 'bg-slate-200 text-slate-500'
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Banner resolvidas ── */}
      {section === 'resolved' && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
          <CheckCheck size={13} className="text-slate-400 shrink-0" />
          <p className="text-xs text-slate-500">Histórico de atendimentos encerrados</p>
        </div>
      )}

      {/* ── Lista de conversas ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {currentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3 px-6 text-center">
            {!serverOnline && conversations.length === 0 ? (
              <>
                <WifiOff size={40} strokeWidth={1} className="text-orange-400" />
                <div>
                  <p className="text-sm font-medium text-orange-600">Servidor desconectado</p>
                  <p className="text-xs text-slate-400 mt-1">Verifique se o servidor esta rodando na porta 3001</p>
                </div>
              </>
            ) : section === 'resolved'
              ? <><History size={40} strokeWidth={1} /><p className="text-sm">Nenhuma conversa resolvida ainda</p></>
              : <><MessageSquarePlus size={40} strokeWidth={1} /><p className="text-sm">Nenhuma conversa ativa no momento</p></>
            }
          </div>
        ) : (
          currentList.map(conv => (
            <ConvItem
              key={conv.id}
              conv={conv}
              isActive={activeConversation?.id === conv.id}
              isResolved={conv.status === 'resolved'}
              onClick={() => { setActiveConversation(conv); onSelect?.(); }}
            />
          ))
        )}
      </div>

      {/* ── Modal: Nova Conversa ── */}
      {showNewConv && (
        <NewConversationModal
          channels={channels.filter(c => c.status === 'active' && (c.connectionType === 'qrcode' || !c.connectionType))}
          contacts={Array.from(
            new Map(
              conversations.map(c => [c.contact.phone, c.contact])
            ).values()
          )}
          onClose={() => setShowNewConv(false)}
          onCreated={(conv) => {
            setActiveConversation(conv);
            setShowNewConv(false);
            onSelect?.();
          }}
        />
      )}
    </div>
  );
}

// ─── Item de conversa ─────────────────────────────────────────────────────────
function ConvItem({
  conv, isActive, isResolved, onClick,
}: {
  conv: Conversation; isActive: boolean; isResolved: boolean; onClick: () => void;
}) {
  const { groups } = useApp();
  const msgs    = conv.messages ?? [];
  const lastMsg = conv.lastMessage ?? msgs[msgs.length - 1];
  const group   = conv.groupId ? groups.find(g => g.id === conv.groupId) : null;

  const timeLabel = isResolved
    ? format(new Date(conv.updatedAt), "dd/MM/yy", { locale: ptBR })
    : formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: false, locale: ptBR });

  // Preview da última mensagem (sem base64)
  const preview = (() => {
    if (!lastMsg) return 'Sem mensagens';
    const prefix = lastMsg.direction === 'outgoing' ? 'Você: ' : '';
    const t = lastMsg.type as string;
    if (t === 'image')    return `${prefix}📷 Imagem`;
    if (t === 'audio')    return `${prefix}🎵 Áudio`;
    if (t === 'video')    return `${prefix}🎥 Vídeo`;
    if (t === 'document') return `${prefix}📄 Documento`;
    if (t === 'location') return `${prefix}📍 Localização`;
    const text = lastMsg.content.startsWith('data:') ? '📎 Mídia' : lastMsg.content;
    return prefix + text;
  })();

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-3.5 md:py-3 border-b border-slate-50 transition text-left',
        isActive   ? 'bg-primary-50 border-l-[3px] border-l-primary-600' : 'hover:bg-slate-50 active:bg-slate-100',
        isResolved && !isActive && 'opacity-75'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className={clsx(
          'w-12 h-12 md:w-10 md:h-10 rounded-full flex items-center justify-center overflow-hidden',
          isResolved ? 'bg-slate-100' : 'bg-gradient-to-br from-primary-200 to-accent-200'
        )}>
          {conv.contact.avatar
            ? <img
                src={conv.contact.avatar}
                alt={conv.contact.name}
                className="w-full h-full object-cover"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            : <span className={clsx(
                'font-semibold',
                'text-base md:text-sm',
                isResolved ? 'text-slate-500' : 'text-primary-700'
              )}>
                {conv.contact.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </span>
          }
        </div>
        <span className={clsx(
          'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 md:w-3 md:h-3 rounded-full border-2 border-white',
          statusColors[conv.status]
        )} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {/* Linha 1: nome + hora */}
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className={clsx(
            'font-semibold truncate',
            'text-[15px] md:text-sm',
            isResolved ? 'text-slate-600' : 'text-slate-800'
          )}>
            {conv.contact.name}
          </span>
          <span className="text-[11px] md:text-xs text-slate-400 shrink-0 whitespace-nowrap">
            {timeLabel}
          </span>
        </div>

        {/* Linha 2: preview + badge não lido */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm md:text-xs text-slate-500 truncate flex-1">{preview}</p>
          {conv.unreadCount > 0 && (
            <span className="bg-primary-600 text-white text-[11px] rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-medium shrink-0">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>

        {/* Linha 3: tags de status + grupo (apenas se não for "em andamento" genérico) */}
        {(group || (!isResolved && conv.status !== 'in_progress')) && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {!isResolved && conv.status !== 'in_progress' && (
              <span className={clsx('text-[11px] px-1.5 py-0.5 rounded-full font-medium', {
                'bg-accent-100 text-accent-700':   conv.status === 'open',
                'bg-purple-100 text-purple-700':   conv.status === 'bot',
              })}>
                {statusLabels[conv.status]}
              </span>
            )}
            {isResolved && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500 flex items-center gap-0.5">
                <CheckCheck size={9} /> Encerrado
              </span>
            )}
            {group && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700 flex items-center gap-0.5 max-w-[100px]">
                <UsersRound size={9} className="shrink-0" />
                <span className="truncate">{group.name}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Modal: Nova Conversa ─────────────────────────────────────────────────────
interface Contact { id: string; name: string; phone: string; }
interface ChannelInfo { id: string; name: string; phoneNumber: string; connectionType?: string; status: string; }

function NewConversationModal({
  channels,
  contacts,
  onClose,
  onCreated,
}: {
  channels: ChannelInfo[];
  contacts: Contact[];
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
}) {
  // SERVER_URL e apiFetch importados do AppContext

  const [contactSearch,   setContactSearch]   = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [phoneInput,      setPhoneInput]      = useState('');
  const [nameInput,       setNameInput]       = useState('');
  const [channelId,       setChannelId]       = useState(channels[0]?.id ?? '');
  const [message,         setMessage]         = useState('');
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [showDropdown,    setShowDropdown]    = useState(false);

  const searchRef   = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filtra contatos existentes pelo texto digitado
  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone.includes(contactSearch)
  ).slice(0, 8);

  // Clique fora fecha dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Quando seleciona um contato existente, preenche os campos
  const selectContact = (c: Contact) => {
    setSelectedContact(c);
    setContactSearch(c.name);
    setPhoneInput(c.phone);
    setNameInput(c.name);
    setShowDropdown(false);
  };

  const handleContactSearchChange = (v: string) => {
    setContactSearch(v);
    setSelectedContact(null);
    setPhoneInput('');
    setNameInput('');
    setShowDropdown(true);
  };

  const effectivePhone = selectedContact ? selectedContact.phone : phoneInput.replace(/[^\d]/g, '');
  const effectiveName  = selectedContact ? selectedContact.name  : nameInput;

  const canSubmit = effectivePhone.length >= 8 && channelId && message.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`${SERVER_URL}/api/conversations/new`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          channelId,
          phone:          effectivePhone,
          name:           effectiveName || effectivePhone,
          initialMessage: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar conversa');
      onCreated(data.conversation as Conversation);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <MessageSquarePlus size={18} className="text-primary-600" />
            <h2 className="font-semibold text-slate-800">Nova Conversa</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">

          {/* Busca / seleção de contato */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Contato <span className="text-slate-400 font-normal">(existente ou novo)</span>
            </label>
            <div className="relative" ref={dropdownRef}>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={contactSearch}
                onChange={e => handleContactSearchChange(e.target.value)}
                onFocus={() => { if (contactSearch) setShowDropdown(true); }}
                placeholder="Buscar contato existente..."
                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
              />
              {/* Dropdown de contatos */}
              {showDropdown && filteredContacts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 z-10 overflow-hidden">
                  {filteredContacts.map(c => (
                    <button
                      key={c.id}
                      onMouseDown={() => selectContact(c)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary-50 transition text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-200 to-accent-200 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary-700">
                          {c.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.phone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Número de telefone - aparece quando não selecionou contato */}
          {!selectedContact && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  <Phone size={11} className="inline mr-1" />Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder="55119..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Nome</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
                />
              </div>
            </div>
          )}

          {/* Contato selecionado - chip */}
          {selectedContact && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-200 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-300 to-accent-300 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary-700">
                  {selectedContact.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary-800 truncate">{selectedContact.name}</p>
                <p className="text-xs text-primary-500">{selectedContact.phone}</p>
              </div>
              <button
                onClick={() => { setSelectedContact(null); setContactSearch(''); setPhoneInput(''); setNameInput(''); }}
                className="text-primary-400 hover:text-primary-600 transition"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Canal */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Canal de envio <span className="text-red-500">*</span></label>
            {channels.length === 0 ? (
              <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2.5 border border-red-200">
                Nenhum canal WhatsApp ativo disponível.
              </p>
            ) : (
              <div className="relative">
                <select
                  value={channelId}
                  onChange={e => setChannelId(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-slate-700"
                >
                  {channels.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phoneNumber})</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Mensagem inicial */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Mensagem inicial <span className="text-red-500">*</span>
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSubmit) handleSubmit(); }}
              rows={3}
              placeholder="Digite a mensagem para iniciar a conversa..."
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">Ctrl+Enter para enviar</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition',
              canSubmit && !loading
                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            )}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {loading ? 'Enviando...' : 'Iniciar conversa'}
          </button>
        </div>
      </div>
    </div>
  );
}
