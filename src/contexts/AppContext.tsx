import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Conversation, Message, Channel, Template, Campaign, Chatbot, AttendanceGroup, KnowledgeBase, TabulationConfig } from '../types';

// ─── Storage helpers (para config local) ─────────────────────────────────────
const loadJSON = <T,>(key: string, fallback: T): T => {
  try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : fallback; }
  catch { return fallback; }
};
const saveJSON = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));

const CHANNELS_KEY        = 'nex_channels';
const TEMPLATES_KEY       = 'nex_templates';
const CAMPAIGNS_KEY       = 'nex_campaigns';
const CHATBOTS_KEY        = 'nex_chatbots';
const GROUPS_KEY          = 'nex_groups';
const KNOWLEDGE_BASES_KEY = 'nex_knowledge_bases';

// Usa o hostname atual para funcionar tanto em localhost quanto na rede local
export const SERVER_URL = `http://${window.location.hostname}:3001`;

// Token de autenticação injetado pelo Vite a partir do .env.local
const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

// Helper: fetch autenticado - injeta Bearer token em todas as chamadas ao servidor
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (API_TOKEN) headers.set('Authorization', `Bearer ${API_TOKEN}`);
  return fetch(input, { ...init, headers });
}

// ─── Context type ─────────────────────────────────────────────────────────────
interface AppContextType {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  setActiveConversation: (c: Conversation | null) => void;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  addConversation: (c: Conversation) => void;
  serverOnline: boolean;

  channels: Channel[];
  addChannel: (c: Omit<Channel, 'id' | 'createdAt'>) => void;
  updateChannel: (id: string, updates: Partial<Channel>) => void;
  deleteChannel: (id: string) => void;

  templates: Template[];
  addTemplate: (t: Omit<Template, 'id' | 'createdAt'>) => void;
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  deleteTemplate: (id: string) => void;

  campaigns: Campaign[];
  addCampaign: (c: Omit<Campaign, 'id' | 'createdAt'>) => void;
  updateCampaign: (id: string, updates: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;

  chatbots: Chatbot[];
  addChatbot: (b: Omit<Chatbot, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateChatbot: (id: string, updates: Partial<Chatbot>) => void;
  deleteChatbot: (id: string) => void;

  updateConversationStatus: (id: string, status: Conversation['status'], tabulation?: Record<string, string | number>, testMode?: boolean) => Promise<{ podSale?: unknown; podError?: string } | null>;
  tabulationConfigs: TabulationConfig[];
  getTabulationForChannel: (channelId: string) => TabulationConfig | null;
  podProducts: string[];
  saveTabulationConfig: (cfg: TabulationConfig) => Promise<void>;
  addTabulationConfig: (data: Omit<TabulationConfig, 'id'>) => Promise<void>;
  deleteTabulationConfig: (id: string) => Promise<void>;

  groups: AttendanceGroup[];
  addGroup: (g: Omit<AttendanceGroup, 'id' | 'createdAt'>) => void;
  updateGroup: (id: string, updates: Partial<AttendanceGroup>) => void;
  deleteGroup: (id: string) => void;

  knowledgeBases: KnowledgeBase[];
  addKnowledgeBase: (kb: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateKnowledgeBase: (id: string, updates: Partial<KnowledgeBase>) => void;
  deleteKnowledgeBase: (id: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [conversations,       setConversations]       = useState<Conversation[]>([]);
  const [activeConversation,  setActiveConversationRaw] = useState<Conversation | null>(null);
  const [channels,            setChannels]            = useState<Channel[]>(() => loadJSON(CHANNELS_KEY, []));
  const [templates,           setTemplates]           = useState<Template[]>(() => loadJSON(TEMPLATES_KEY, []));
  const [campaigns,           setCampaigns]           = useState<Campaign[]>(() => loadJSON(CAMPAIGNS_KEY, []));
  const [chatbots,            setChatbots]            = useState<Chatbot[]>(() => loadJSON(CHATBOTS_KEY, []));
  const [groups,              setGroups]              = useState<AttendanceGroup[]>(() => loadJSON(GROUPS_KEY, []));
  const [knowledgeBases,      setKnowledgeBases]      = useState<KnowledgeBase[]>(() => loadJSON(KNOWLEDGE_BASES_KEY, []));
  const [serverOnline,        setServerOnline]        = useState(false);
  const [tabulationConfigs,   setTabulationConfigs]   = useState<TabulationConfig[]>([]);
  const [podProducts,         setPodProducts]         = useState<string[]>([]);

  const activeConvRef = useRef<Conversation | null>(null);
  const configRef     = useRef({ channels, chatbots, groups, knowledgeBases });

  // ─── Sons de notificação via Web Audio API ──────────────────────────────────
  // Gerados programaticamente - sem arquivos externos.
  // O navegador exige interação prévia do usuário para reproduzir áudio (autoplay policy);
  // após o operador clicar em qualquer lugar da UI os sons passam a funcionar normalmente.
  const playSound = useCallback((type: 'new_conversation' | 'new_message') => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();

      const tone = (freq: number, start: number, dur: number, vol = 0.35) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.start(start);
        osc.stop(start + dur);
      };

      if (type === 'new_conversation') {
        // Ding-dong ascendente - nova conversa
        tone(880,  ctx.currentTime,        0.30);
        tone(1100, ctx.currentTime + 0.20, 0.35);
      } else {
        // Bip simples - nova mensagem
        tone(700, ctx.currentTime, 0.22, 0.28);
      }
    } catch { /* silencia se Web Audio não estiver disponível */ }
  }, []);

  // ── Registra config no servidor sempre que mudar ────────────────────────
  const registerWithServer = useCallback(async (chs: Channel[], bots: Chatbot[], grps: AttendanceGroup[] = [], kbs: KnowledgeBase[] = []) => {
    try {
      await apiFetch(`${SERVER_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: chs, chatbots: bots, groups: grps, knowledgeBases: kbs }),
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* servidor pode estar offline */ }
  }, []);

  // ── Carrega conversas do servidor ────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const res  = await apiFetch(`${SERVER_URL}/api/conversations`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        console.warn(`[AppContext] loadConversations falhou: HTTP ${res.status}`);
        setServerOnline(false);
        return;
      }
      const data = await res.json() as Conversation[];
      setConversations(data);
      setServerOnline(true);
      // Atualiza conversa ativa se estiver aberta
      if (activeConvRef.current) {
        const updated = data.find(c => c.id === activeConvRef.current!.id);
        if (updated) setActiveConversationRaw(updated);
      }
    } catch (err) {
      console.warn('[AppContext] loadConversations erro de rede:', err);
      setServerOnline(false);
    }
  }, []);

  // ── SSE - recebe eventos em tempo real ───────────────────────────────────
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource(`${SERVER_URL}/api/events`);

      es.addEventListener('connected', () => {
        setServerOnline(true);
        loadConversations();

        // ── Sincroniza configurações do servidor → localStorage ──────────────
        // Garante que canais, chatbots, grupos e KBs sempre reflitam o servidor,
        // mesmo que o localStorage tenha sido limpo ou esteja desatualizado.
        Promise.all([
          apiFetch(`${SERVER_URL}/api/channels`).then(r => r.json()).catch(() => null),
          apiFetch(`${SERVER_URL}/api/chatbots`).then(r => r.json()).catch(() => null),
          apiFetch(`${SERVER_URL}/api/groups`).then(r => r.json()).catch(() => null),
          apiFetch(`${SERVER_URL}/api/knowledge-bases`).then(r => r.json()).catch(() => null),
        ]).then(([chs, bots, grps, kbs]: [Channel[] | null, Chatbot[] | null, AttendanceGroup[] | null, KnowledgeBase[] | null]) => {
          const finalChs  = Array.isArray(chs)  && chs.length  > 0 ? chs  : configRef.current.channels;
          const finalBots = Array.isArray(bots) && bots.length > 0 ? bots : configRef.current.chatbots;
          const finalGrps = Array.isArray(grps) && grps.length > 0 ? grps : configRef.current.groups;
          const finalKbs  = Array.isArray(kbs)  && kbs.length  > 0 ? kbs  : configRef.current.knowledgeBases;

          if (Array.isArray(chs)  && chs.length  > 0) { setChannels(chs);         saveJSON(CHANNELS_KEY, chs); }
          if (Array.isArray(bots) && bots.length > 0) { setChatbots(bots);        saveJSON(CHATBOTS_KEY, bots); }
          if (Array.isArray(grps) && grps.length > 0) { setGroups(grps);          saveJSON(GROUPS_KEY, grps); }
          if (Array.isArray(kbs)  && kbs.length  > 0) { setKnowledgeBases(kbs);   saveJSON(KNOWLEDGE_BASES_KEY, kbs); }

          registerWithServer(finalChs, finalBots, finalGrps, finalKbs);
        });

        // Carrega configurações de tabulação
        apiFetch(`${SERVER_URL}/api/tabulation-configs`).then(r => r.json()).then((cfgs: TabulationConfig[]) => {
          if (Array.isArray(cfgs)) setTabulationConfigs(cfgs);
        }).catch(() => {});
        // Carrega produtos do Pod Sales (tempo real)
        apiFetch(`${SERVER_URL}/api/pod-products`).then(r => r.json()).then((prods: string[]) => {
          if (Array.isArray(prods)) setPodProducts(prods);
        }).catch(() => {});
      });

      es.addEventListener('conversation_new', (e) => {
        const conv = JSON.parse(e.data) as Conversation;
        setConversations(prev => {
          if (prev.find(c => c.id === conv.id)) return prev;
          return [conv, ...prev];
        });
        // Toca som de nova conversa (sempre - independente da tela aberta)
        playSound('new_conversation');
      });

      es.addEventListener('conversation_updated', (e) => {
        const updated = JSON.parse(e.data) as Conversation;
        setConversations(prev =>
          prev.map(c => c.id === updated.id ? { ...c, ...updated, messages: c.messages } : c)
        );
        if (activeConvRef.current?.id === updated.id) {
          setActiveConversationRaw(prev => prev ? { ...prev, ...updated, messages: prev.messages } : prev);
        }
      });

      es.addEventListener('message_new', (e) => {
        const { conversationId, message } = JSON.parse(e.data) as { conversationId: string; message: Message };

        // Toca som de mensagem somente se:
        // 1. For mensagem do cliente (incoming)
        // 2. O operador NÃO estiver com essa conversa aberta no momento
        if (message.direction === 'incoming' && activeConvRef.current?.id !== conversationId) {
          playSound('new_message');
        }

        // Atualiza lista de conversas (sem otimistas, sem duplicatas)
        setConversations(prev =>
          prev.map(c => {
            if (c.id !== conversationId) return c;
            if ((c.messages || []).some(m => m.id === message.id)) return c;
            return { ...c, messages: [...(c.messages || []), message], lastMessage: message };
          })
        );

        // Atualiza conversa ativa:
        // - Mensagens outgoing substituem o placeholder otimista (opt_*) mais antigo
        // - Mensagens incoming são simplesmente adicionadas (se não duplicadas)
        if (activeConvRef.current?.id === conversationId) {
          setActiveConversationRaw(prev => {
            if (!prev) return prev;
            if (prev.messages.some(m => m.id === message.id)) return prev;

            if (message.direction === 'outgoing') {
              // Substitui o primeiro placeholder otimista pendente pela mensagem real
              const optIdx = prev.messages.findIndex(m => m.id.startsWith('opt_') && m.direction === 'outgoing');
              if (optIdx !== -1) {
                const msgs = [...prev.messages];
                msgs[optIdx] = message;
                return { ...prev, messages: msgs };
              }
            }

            return { ...prev, messages: [...prev.messages, message] };
          });
        }
      });

      // Atualiza conteúdo de uma mensagem existente (ex: mídia baixada como base64)
      es.addEventListener('message_updated', (e) => {
        const { conversationId, message } = JSON.parse(e.data) as { conversationId: string; message: Message };
        setConversations(prev =>
          prev.map(c => {
            if (c.id !== conversationId) return c;
            return { ...c, messages: (c.messages || []).map(m => m.id === message.id ? message : m) };
          })
        );
        if (activeConvRef.current?.id === conversationId) {
          setActiveConversationRaw(prev => {
            if (!prev) return prev;
            return { ...prev, messages: prev.messages.map(m => m.id === message.id ? message : m) };
          });
        }
      });

      es.onerror = () => {
        setServerOnline(false);
        es?.close();
        retryTimer = setTimeout(connect, 5_000);
      };
    };

    connect();
    return () => { es?.close(); clearTimeout(retryTimer); };
  }, [loadConversations, registerWithServer, playSound]);

  // Fallback: se apos 3s o SSE ainda nao trouxe conversas, tenta carregar direto
  // Cobre o caso de erro 431 / CORS / timeout no SSE que silencia o loadConversations
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (conversations.length === 0) {
        await loadConversations();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []); // roda apenas na montagem

  // Mantém configRef atualizado para uso no handler SSE (evita closure stale)
  useEffect(() => { configRef.current = { channels, chatbots, groups, knowledgeBases }; }, [channels, chatbots, groups, knowledgeBases]);

  // Sincroniza config ao mudar canais, chatbots, grupos ou bases de conhecimento
  useEffect(() => { registerWithServer(channels, chatbots, groups, knowledgeBases); }, [channels, chatbots, groups, knowledgeBases, registerWithServer]);

  // ── setActiveConversation com leitura de unread ──────────────────────────
  const setActiveConversation = useCallback((c: Conversation | null) => {
    activeConvRef.current = c;
    setActiveConversationRaw(c);
    if (c) {
      apiFetch(`${SERVER_URL}/api/conversations/${c.id}/read`, { method: 'POST' }).catch(() => {});
      setConversations(prev => prev.map(cv => cv.id === c.id ? { ...cv, unreadCount: 0 } : cv));
    }
  }, []);

  // ── Enviar mensagem via servidor (que chama Evolution API) ────────────────
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    // Mensagem otimista - substituída pelo SSE quando a real chegar
    const optimisticId = `opt_${Date.now()}`;
    const optimistic: Message = {
      id:             optimisticId,
      conversationId,
      content,
      type:           'text',
      direction:      'outgoing',
      status:         'sent',
      timestamp:      new Date().toISOString(),
    };
    setActiveConversationRaw(prev =>
      prev?.id === conversationId ? { ...prev, messages: [...prev.messages, optimistic] } : prev
    );

    try {
      await apiFetch(`${SERVER_URL}/api/conversations/${conversationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      // Não processa a resposta da API - o SSE entregará a mensagem real
      // e substituirá o placeholder otimista (ver handler message_new abaixo)
    } catch (err) {
      // Remove o placeholder otimista se a requisição falhou
      setActiveConversationRaw(prev =>
        prev?.id === conversationId
          ? { ...prev, messages: prev.messages.filter(m => m.id !== optimisticId) }
          : prev
      );
      console.error('[sendMessage]', err);
    }
  }, []);

  const addConversation = useCallback((c: Conversation) => {
    setConversations(prev => [c, ...prev]);
  }, []);

  // ── Status da conversa ───────────────────────────────────────────────────
  const updateConversationStatus = useCallback(async (
    id: string,
    status: Conversation['status'],
    tabulation?: Record<string, string | number>,
    testMode?: boolean,
  ): Promise<{ podSale?: unknown; podError?: string } | null> => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, status, ...(tabulation ? { tabulation } : {}) } : c));
    if (activeConvRef.current?.id === id) {
      setActiveConversationRaw(prev => prev ? { ...prev, status, ...(tabulation ? { tabulation } : {}) } : prev);
    }
    try {
      const res  = await apiFetch(`${SERVER_URL}/api/conversations/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, tabulation, testMode: testMode ?? false }),
      });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }, []);

  // ── Tabulação configs ─────────────────────────────────────────────────────
  const getTabulationForChannel = useCallback((channelId: string): TabulationConfig | null => {
    const specific = tabulationConfigs.find(c => c.enabled && Array.isArray(c.channelIds) && c.channelIds.includes(channelId));
    if (specific) return specific;
    return tabulationConfigs.find(c => c.enabled && (!c.channelIds || c.channelIds.length === 0)) ?? null;
  }, [tabulationConfigs]);

  const saveTabulationConfig = useCallback(async (cfg: TabulationConfig) => {
    setTabulationConfigs(prev => prev.map(c => c.id === cfg.id ? cfg : c));
    try {
      await apiFetch(`${SERVER_URL}/api/tabulation-configs/${cfg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
    } catch { /* ignora */ }
  }, []);

  const addTabulationConfig = useCallback(async (data: Omit<TabulationConfig, 'id'>) => {
    try {
      const res = await apiFetch(`${SERVER_URL}/api/tabulation-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { config } = await res.json();
        setTabulationConfigs(prev => [...prev, config]);
      }
    } catch { /* ignora */ }
  }, []);

  const deleteTabulationConfig = useCallback(async (id: string) => {
    setTabulationConfigs(prev => prev.filter(c => c.id !== id));
    try {
      await apiFetch(`${SERVER_URL}/api/tabulation-configs/${id}`, { method: 'DELETE' });
    } catch { /* ignora */ }
  }, []);

  // ── Channels ─────────────────────────────────────────────────────────────
  const addChannel = useCallback((data: Omit<Channel, 'id' | 'createdAt'>) => {
    setChannels(prev => {
      const u = [...prev, { ...data, id: String(Date.now()), createdAt: new Date().toISOString() }];
      saveJSON(CHANNELS_KEY, u); return u;
    });
  }, []);
  const updateChannel = useCallback((id: string, updates: Partial<Channel>) => {
    setChannels(prev => {
      const u = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      saveJSON(CHANNELS_KEY, u); return u;
    });
  }, []);
  const deleteChannel = useCallback((id: string) => {
    setChannels(prev => { const u = prev.filter(c => c.id !== id); saveJSON(CHANNELS_KEY, u); return u; });
  }, []);

  // ── Templates ─────────────────────────────────────────────────────────────
  const addTemplate = useCallback((data: Omit<Template, 'id' | 'createdAt'>) => {
    setTemplates(prev => {
      const u = [...prev, { ...data, id: String(Date.now()), createdAt: new Date().toISOString() }];
      saveJSON(TEMPLATES_KEY, u); return u;
    });
  }, []);
  const updateTemplate = useCallback((id: string, updates: Partial<Template>) => {
    setTemplates(prev => { const u = prev.map(t => t.id === id ? { ...t, ...updates } : t); saveJSON(TEMPLATES_KEY, u); return u; });
  }, []);
  const deleteTemplate = useCallback((id: string) => {
    setTemplates(prev => { const u = prev.filter(t => t.id !== id); saveJSON(TEMPLATES_KEY, u); return u; });
  }, []);

  // ── Campaigns ─────────────────────────────────────────────────────────────
  const addCampaign = useCallback((data: Omit<Campaign, 'id' | 'createdAt'>) => {
    setCampaigns(prev => {
      const u = [...prev, { ...data, id: String(Date.now()), createdAt: new Date().toISOString() }];
      saveJSON(CAMPAIGNS_KEY, u); return u;
    });
  }, []);
  const updateCampaign = useCallback((id: string, updates: Partial<Campaign>) => {
    setCampaigns(prev => { const u = prev.map(c => c.id === id ? { ...c, ...updates } : c); saveJSON(CAMPAIGNS_KEY, u); return u; });
  }, []);
  const deleteCampaign = useCallback((id: string) => {
    setCampaigns(prev => { const u = prev.filter(c => c.id !== id); saveJSON(CAMPAIGNS_KEY, u); return u; });
  }, []);

  // ── Groups ────────────────────────────────────────────────────────────────
  const addGroup = useCallback((data: Omit<AttendanceGroup, 'id' | 'createdAt'>) => {
    setGroups(prev => {
      const u = [...prev, { ...data, id: `grp_${Date.now()}`, createdAt: new Date().toISOString() }];
      saveJSON(GROUPS_KEY, u); return u;
    });
  }, []);
  const updateGroup = useCallback((id: string, updates: Partial<AttendanceGroup>) => {
    setGroups(prev => { const u = prev.map(g => g.id === id ? { ...g, ...updates } : g); saveJSON(GROUPS_KEY, u); return u; });
  }, []);
  const deleteGroup = useCallback((id: string) => {
    setGroups(prev => { const u = prev.filter(g => g.id !== id); saveJSON(GROUPS_KEY, u); return u; });
  }, []);

  // ── Knowledge Bases ───────────────────────────────────────────────────────
  const addKnowledgeBase = useCallback((data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    setKnowledgeBases(prev => {
      const u = [...prev, { ...data, id: `kb_${Date.now()}`, createdAt: now, updatedAt: now }];
      saveJSON(KNOWLEDGE_BASES_KEY, u); return u;
    });
  }, []);
  const updateKnowledgeBase = useCallback((id: string, updates: Partial<KnowledgeBase>) => {
    setKnowledgeBases(prev => {
      const u = prev.map(kb => kb.id === id ? { ...kb, ...updates, updatedAt: new Date().toISOString() } : kb);
      saveJSON(KNOWLEDGE_BASES_KEY, u); return u;
    });
  }, []);
  const deleteKnowledgeBase = useCallback((id: string) => {
    setKnowledgeBases(prev => { const u = prev.filter(kb => kb.id !== id); saveJSON(KNOWLEDGE_BASES_KEY, u); return u; });
  }, []);

  // ── Chatbots ──────────────────────────────────────────────────────────────
  const addChatbot = useCallback((data: Omit<Chatbot, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    setChatbots(prev => {
      const u = [...prev, { ...data, id: String(Date.now()), createdAt: now, updatedAt: now }];
      saveJSON(CHATBOTS_KEY, u);
      const { channels: chs, groups: grps, knowledgeBases: kbs } = configRef.current;
      registerWithServer(chs, u, grps, kbs);
      return u;
    });
  }, [registerWithServer]);
  const updateChatbot = useCallback((id: string, updates: Partial<Chatbot>) => {
    setChatbots(prev => {
      const u = prev.map(b => b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b);
      saveJSON(CHATBOTS_KEY, u);
      const { channels: chs, groups: grps, knowledgeBases: kbs } = configRef.current;
      registerWithServer(chs, u, grps, kbs);
      return u;
    });
  }, [registerWithServer]);
  const deleteChatbot = useCallback((id: string) => {
    setChatbots(prev => {
      const u = prev.filter(b => b.id !== id);
      saveJSON(CHATBOTS_KEY, u);
      // Remove do servidor para não voltar no próximo sync
      apiFetch(`${SERVER_URL}/api/chatbots/${id}`, { method: 'DELETE' }).catch(() => {});
      return u;
    });
  }, []);

  return (
    <AppContext.Provider value={{
      conversations, activeConversation, setActiveConversation, sendMessage, addConversation, serverOnline,
      channels, addChannel, updateChannel, deleteChannel,
      templates, addTemplate, updateTemplate, deleteTemplate,
      campaigns, addCampaign, updateCampaign, deleteCampaign,
      chatbots, addChatbot, updateChatbot, deleteChatbot,
      groups, addGroup, updateGroup, deleteGroup,
      knowledgeBases, addKnowledgeBase, updateKnowledgeBase, deleteKnowledgeBase,
      updateConversationStatus,
      tabulationConfigs, getTabulationForChannel, saveTabulationConfig, addTabulationConfig, deleteTabulationConfig,
      podProducts,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
