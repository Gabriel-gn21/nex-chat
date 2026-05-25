/**
 * index.mjs — Servidor principal do Nex-Chat
 * Porta 3001 | Recebe webhooks da Evolution API e serve dados ao frontend
 */
import express    from 'express';
import cors       from 'cors';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { store, save } from './store.mjs';
import { handleWebhook } from './webhook.mjs';
import { sendText, sendImageBase64, sendMediaFileBase64, sendAudioFileBase64, sendLocationMessage } from './evolution.mjs';
import { startTimerJob } from './timer.mjs';
import { generatePixPayment } from './pix.mjs';
import { syncSaleToPod, POD_TABULATION_CONFIG } from './pod-integration.mjs';
import { stockRouter } from './stock.mjs';
import {
  login, logout, requireAuth,
  generate2FASecret, verify2FASetup,
  changePassword, generateRecoveryToken, consumeRecoveryToken,
  createUser, listUsers, deleteUserData,
  getLGPDData, exportLGPDData, updateConsent,
  readAuditLog, auditLog,
} from './auth.mjs';

// ─── Carrega .env do servidor ─────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const envLines = readFileSync(resolve(__dir, '.env'), 'utf8').split('\n');
  for (const line of envLines) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env opcional */ }

const API_TOKEN      = process.env.API_TOKEN || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL || '';

if (!API_TOKEN) console.warn('[security] ⚠️  API_TOKEN não definido — rotas /api/* SEM autenticação!');
if (!WEBHOOK_SECRET) console.warn('[security] ⚠️  WEBHOOK_SECRET não definido — webhook SEM validação de secret!');
if (MAKE_WEBHOOK_URL) console.log(`[make-webhook] URL configurada: ${MAKE_WEBHOOK_URL.slice(0, 60)}...`);
else console.warn('[make-webhook] ⚠️  MAKE_WEBHOOK_URL não definida — webhook de vendas desativado.');

const app  = express();
const PORT = 3001;

// ─── CORS — restringe às origens conhecidas do frontend ───────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://${process.env.HOST || 'localhost'}:5173`,
];
app.use(cors({
  origin: (origin, cb) => {
    // Permite requisições sem origin (ex: Postman, SSE do próprio servidor)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // Permite qualquer IP local (192.168.x.x, 10.x.x.x) para acesso na rede
    if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '64mb' }));

// ─── Middleware de autenticação Bearer ────────────────────────────────────────
// Protege todas as rotas /api/* exceto /api/events (SSE — sem Bearer em EventSource)
app.use('/api', (req, res, next) => {
  // SSE não suporta headers customizados no browser — isenta apenas /api/events
  if (req.path === '/events') return next();
  if (!API_TOKEN) return next(); // sem token configurado = sem proteção (modo dev)
  const auth = req.headers['authorization'] || req.headers['x-api-token'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (token !== API_TOKEN) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
});

app.use('/api/stock', stockRouter);

// ─── Helper: fetch com retry automático (503 / 429 / erros de rede) ───────────
// 503 (sobrecarga): backoff rápido — 1.5s, 3s, 6s
// 429 (rate-limit):  backoff longo  — 10s, 20s, 40s  (janela típica de 60s)
async function retryFetch(url, options, { maxRetries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Para 429 usamos delay maior; para 503 delay menor
      const is429 = lastErr?.message?.includes('429');
      const base  = is429 ? 10_000 : 1_500;
      const delay = base * Math.pow(2, attempt - 1);
      console.warn(`[retryFetch] tentativa ${attempt}/${maxRetries} aguardando ${delay}ms (${is429 ? 'rate-limit' : 'sobrecarga'})`);
      await new Promise(r => setTimeout(r, delay));
    }
    try {
      const res = await fetch(url, options);
      if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
        const body = await res.text();
        lastErr = new Error(`HTTP ${res.status}: ${body}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) throw lastErr;
    }
  }
  throw lastErr;
}

// ─── SSE — Server-Sent Events ─────────────────────────────────────────────────
const sseClients = new Set();

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.add(res);
  // Envia evento "connected" imediatamente para o frontend chamar loadConversations()
  res.write(`event: connected\ndata: {}\n\n`);
  // Heartbeat a cada 20s para manter a conexão viva
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20_000);
  req.on('close', () => { sseClients.delete(res); clearInterval(hb); });
});

// ─── Registro de canais e chatbots (enviado pelo frontend) ───────────────────
app.post('/api/register', (req, res) => {
  const { channels = [], chatbots = [], groups = [], knowledgeBases = [] } = req.body;

  // Limpa e recarrega canais ativos do frontend
  // (mantém apenas os que vieram neste registro — remove desativados)
  const newChannels = {};
  for (const ch of channels) {
    if (ch.connectionType === 'qrcode' && ch.evolutionInstanceName && ch.status === 'active') {
      newChannels[ch.evolutionInstanceName] = ch;
    }
  }
  Object.assign(store.channels, newChannels);

  // Limpa e recarrega chatbots (indexados por bot.id para suportar múltiplos bots por canal)
  const newChatbots = {};
  for (const bot of chatbots) {
    if (bot.id) newChatbots[bot.id] = bot;
  }
  Object.assign(store.chatbots, newChatbots);

  // Limpa e recarrega grupos
  const newGroups = {};
  for (const g of groups) newGroups[g.id] = g;
  Object.assign(store.groups, newGroups);

  // Limpa e recarrega bases de conhecimento
  const newKBs = {};
  for (const kb of knowledgeBases) newKBs[kb.id] = kb;
  Object.assign(store.knowledgeBases, newKBs);

  // Persiste no disco para sobreviver reinicializações do servidor
  save();

  console.log(`[register] ${Object.keys(store.channels).length} canal(is), ${Object.keys(store.chatbots).length} chatbot(s), ${Object.keys(store.groups).length} grupo(s) registrados e salvos.`);

  // Log detalhado dos canais registrados
  for (const [inst, ch] of Object.entries(store.channels)) {
    console.log(`  Canal: "${ch.name}" inst="${inst}" url="${ch.evolutionApiUrl}" key=${ch.evolutionApiKey ? '***' : 'AUSENTE'}`);
  }
  for (const [bid, bot] of Object.entries(store.chatbots)) {
    console.log(`  Bot: "${bot.name}" id="${bid}" channelId="${bot.channelId}" status="${bot.status}" nós=${bot.nodes?.length ?? 0}`);
  }

  res.json({ ok: true });
});

// ─── Webhook da Evolution API ────────────────────────────────────────────────
// Verifica o secret configurado (header x-webhook-secret ou apikey).
// Aceita se:
//   1. WEBHOOK_SECRET não estiver definido (modo dev)
//   2. x-webhook-secret == WEBHOOK_SECRET  (configuração ideal — headers no webhook)
//   3. apikey == chave da Evolution API de um canal conhecido (fallback enquanto
//      a Evolution API ainda não enviou os headers configurados)
function webhookAuth(req, res, next) {
  if (!WEBHOOK_SECRET) return next();

  const incoming = req.headers['x-webhook-secret'] || req.headers['apikey'] || '';

  // 1. Header x-webhook-secret bate com o WEBHOOK_SECRET configurado
  if (incoming === WEBHOOK_SECRET) return next();

  // 2. apikey bate com a chave de um canal Evolution API cadastrado
  const knownKeys = new Set(
    Object.values(store.channels).map(ch => ch.evolutionApiKey).filter(Boolean)
  );
  if (incoming && knownKeys.has(incoming)) return next();

  // 3. Origem local (127.0.0.1 / ::1) — Evolution API roda na mesma máquina
  //    e pode não enviar headers de auth dependendo da versão
  const ip = req.ip || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (isLocal) return next();

  console.warn(`[security] Webhook rejeitado — origem externa sem secret (IP: ${ip})`);
  return res.status(403).json({ error: 'Forbidden' });
}
app.post('/webhook', webhookAuth, handleWebhook);
// Suporta também /webhook/:instance (Evolution API pode adicionar sufixo)
app.post('/webhook/:instance', webhookAuth, handleWebhook);

// ─── Nova conversa (outbound) ────────────────────────────────────────────────
// Inicia uma conversa enviando uma mensagem para um número de WhatsApp.
app.post('/api/conversations/new', async (req, res) => {
  const { channelId, phone, name, initialMessage } = req.body;

  if (!channelId || !phone || !initialMessage) {
    return res.status(400).json({ error: 'channelId, phone e initialMessage são obrigatórios' });
  }

  // Encontra o canal pelo ID
  const channel = Object.values(store.channels).find(c => c.id === channelId);
  if (!channel) return res.status(404).json({ error: 'Canal não encontrado' });

  // Normaliza o telefone (só dígitos)
  const digits = phone.replace(/[^\d]/g, '');
  const jid    = `${digits}@s.whatsapp.net`;

  // Reutiliza conversa ativa existente para este contato/canal, se houver
  let conv = Object.values(store.conversations).find(
    c => c.contact.phone === digits && c.channelId === channelId && c.status !== 'resolved'
  );

  const isNew = !conv;

  if (!conv) {
    const contactName = name?.trim() || digits;
    conv = {
      id:           `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      contactId:    digits,
      contact:      { id: digits, name: contactName, phone: digits, jid },
      channelId,
      instanceName: channel.evolutionInstanceName || channel.id,
      status:       'open',
      botInitiated: false,
      assignedTo:   null,
      lastMessage:  null,
      unreadCount:  0,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };
    store.conversations[conv.id] = conv;
    store.messages[conv.id]      = [];
  }

  // Envia a mensagem via Evolution API
  try {
    await sendText(channel, jid, initialMessage);
  } catch (err) {
    // Remove conversa recém-criada se o envio falhou
    if (isNew) {
      delete store.conversations[conv.id];
      delete store.messages[conv.id];
    }
    console.error(`[nova-conversa] Falha ao enviar mensagem: ${err.message}`);
    return res.status(502).json({ error: `Falha ao enviar mensagem: ${err.message}` });
  }

  // Registra a mensagem enviada
  const msg = {
    id:             `op_${Date.now()}`,
    conversationId: conv.id,
    content:        initialMessage,
    type:           'text',
    direction:      'outgoing',
    status:         'sent',
    timestamp:      new Date().toISOString(),
  };

  store.messages[conv.id].push(msg);
  store.conversations[conv.id] = {
    ...store.conversations[conv.id],
    lastMessage: msg,
    updatedAt:   msg.timestamp,
    status:      store.conversations[conv.id].status === 'resolved' ? 'open' : store.conversations[conv.id].status,
  };

  if (isNew) {
    broadcast('conversation_new', { ...store.conversations[conv.id], messages: store.messages[conv.id] });
  } else {
    broadcast('conversation_updated', store.conversations[conv.id]);
    broadcast('message_new', msg);
  }

  save();

  console.log(`[nova-conversa] Mensagem enviada para ${digits} via canal ${channelId}`);
  res.json({ ok: true, conversation: { ...store.conversations[conv.id], messages: store.messages[conv.id] } });
});

// ─── Conversas ───────────────────────────────────────────────────────────────
app.get('/api/conversations', (_req, res) => {
  const list = Object.values(store.conversations).map(conv => ({
    ...conv,
    messages: store.messages[conv.id] || [],
  })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(list);
});

app.get('/api/conversations/:id', (req, res) => {
  const conv = store.conversations[req.params.id];
  if (!conv) return res.status(404).json({ error: 'Not found' });
  res.json({ ...conv, messages: store.messages[conv.id] || [] });
});

// ─── Envio de mensagem pelo operador ─────────────────────────────────────────
app.post('/api/conversations/:id/send', async (req, res) => {
  const { content } = req.body;
  const conv = store.conversations[req.params.id];
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

  const channel = store.channels[conv.instanceName];
  if (!channel) return res.status(400).json({ error: 'Canal não encontrado' });

  try {
    await sendText(channel, conv.contact.jid || conv.contact.phone, content);

    const msg = {
      id:             `op_${Date.now()}`,
      conversationId: conv.id,
      content,
      type:           'text',
      direction:      'outgoing',
      status:         'sent',
      timestamp:      new Date().toISOString(),
    };
    if (!store.messages[conv.id]) store.messages[conv.id] = [];
    store.messages[conv.id].push(msg);
    store.conversations[conv.id] = { ...conv, lastMessage: msg, updatedAt: msg.timestamp };
    save();

    broadcast('message_new',          { conversationId: conv.id, message: msg });
    broadcast('conversation_updated',   store.conversations[conv.id]);
    res.json(msg);
  } catch (err) {
    console.error('[send]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Envio de mídia (imagem, vídeo, áudio, documento, localização) ────────────
app.post('/api/conversations/:id/send-media', async (req, res) => {
  const conv = store.conversations[req.params.id];
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

  const channel = store.channels[conv.instanceName];
  if (!channel) return res.status(400).json({ error: 'Canal não encontrado' });

  const { type, base64, mimetype, filename, caption, lat, lng, locationName } = req.body;
  const phone = conv.contact.jid || conv.contact.phone;

  try {
    let content;

    if (type === 'location') {
      await sendLocationMessage(channel, phone, parseFloat(lat), parseFloat(lng), locationName || '');
      content = `${lat},${lng}${locationName ? ` (${locationName})` : ''}`;

    } else if (type === 'audio') {
      await sendAudioFileBase64(channel, phone, base64, mimetype);
      content = base64.startsWith('data:') ? base64 : `data:${mimetype};base64,${base64}`;

    } else {
      // image | video | document
      const evType = type === 'video' ? 'video' : type === 'document' ? 'document' : 'image';
      await sendMediaFileBase64(channel, phone, evType, base64, mimetype, filename || '', caption || '');
      content = base64.startsWith('data:') ? base64 : `data:${mimetype};base64,${base64}`;
    }

    const msg = {
      id:             `op_${Date.now()}`,
      conversationId: conv.id,
      content,
      type,
      direction:      'outgoing',
      status:         'sent',
      timestamp:      new Date().toISOString(),
    };

    if (!store.messages[conv.id]) store.messages[conv.id] = [];
    store.messages[conv.id].push(msg);
    store.conversations[conv.id] = { ...conv, lastMessage: msg, updatedAt: msg.timestamp };
    save();
    broadcast('message_new',         { conversationId: conv.id, message: msg });
    broadcast('conversation_updated', store.conversations[conv.id]);
    res.json(msg);
  } catch (err) {
    console.error('[send-media]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Atualiza status da conversa ──────────────────────────────────────────────
app.patch('/api/conversations/:id/status', async (req, res) => {
  const { status, tabulation, testMode } = req.body;
  const conv = store.conversations[req.params.id];
  if (!conv) return res.status(404).json({ error: 'Not found' });
  store.conversations[req.params.id] = {
    ...conv,
    status,
    resolvedAt:  status === 'resolved' ? new Date().toISOString() : conv.resolvedAt ?? null,
    tabulation:  status === 'resolved' && tabulation ? tabulation : conv.tabulation,
    testMode:    status === 'resolved' ? (testMode === true) : false,
  };

  // Operador assumiu → encerra sessão do bot para esta conversa
  if (status === 'in_progress' || status === 'resolved') {
    endBotSession(conv);
  }

  save();
  broadcast('conversation_updated', store.conversations[req.params.id]);

  // ── Integração Pod Sales: sincroniza venda se resultado = "Venda realizada" ──
  let podSale = null;
  let podError = null;
  if (status === 'resolved' && tabulation?.resultado === 'Venda realizada') {
    try {
      podSale = await syncSaleToPod(tabulation, conv.contact?.name);
      // Remove da fila de pendentes se estava lá
      if (store.podSyncPending) {
        store.podSyncPending = store.podSyncPending.filter(p => p.convId !== req.params.id);
        save();
      }
    } catch (err) {
      podError = err.message;
      console.error('[pod-integration] Falha ao sincronizar:', err.message);
      // Salva na fila de pendentes para re-tentar depois
      if (!store.podSyncPending) store.podSyncPending = [];
      const already = store.podSyncPending.find(p => p.convId === req.params.id);
      if (!already) {
        store.podSyncPending.push({
          convId:      req.params.id,
          tabulation,
          contactName: conv.contact?.name ?? null,
          failedAt:    new Date().toISOString(),
          reason:      err.message,
        });
        save();
        console.warn(`[pod-integration] ⚠️  Adicionado à fila de pendentes (${store.podSyncPending.length} total)`);
      }
    }
  }

  res.json({ ok: true, podSale: podSale ?? undefined, podError: podError ?? undefined });
});

// ─── Extração de endereço de destino via IA (para solicitação de corrida) ────────
app.post('/api/ride/extract-address', async (req, res) => {
  try {
    const { conversationId } = req.body;
    const msgs     = (store.messages[conversationId] ?? [])
      .filter(m => m.type === 'text')
      .slice(-60); // últimas 60 mensagens de texto
    if (!msgs.length) return res.status(400).json({ error: 'Conversa sem mensagens de texto.' });

    const aiCfg = store.config?.tabulation?.aiConfig;
    if (!aiCfg?.apiKey) return res.status(400).json({ error: 'IA não configurada nas Configurações → Tabulação.' });

    const { provider, apiKey, model } = aiCfg;

    const transcript = msgs.map(m =>
      `${m.direction === 'outgoing' ? 'OPERADOR' : 'CLIENTE'}: ${m.content}`
    ).join('\n');

    const system = `Você é um assistente especializado em extrair e completar endereços brasileiros de entregas na região do Alto Tietê, São Paulo.

REGRA FUNDAMENTAL: Todas as entregas são realizadas exclusivamente na região do Alto Tietê — SP. As cidades que compõem essa região são:
- Suzano, Mogi das Cruzes, Poá, Ferraz de Vasconcelos, Itaquaquecetuba, Arujá, Guararema, Salesópolis e Biritiba Mirim.

Ao extrair um endereço da conversa, siga estas diretrizes:
1. Se o cliente informou cidade e ela está na lista acima, use-a.
2. Se o cliente mencionou apenas rua, número ou bairro sem cidade, determine a cidade mais provável dentro do Alto Tietê com base no contexto da conversa (bairros conhecidos, referências locais, etc.).
3. Se não houver nenhuma pista de cidade, assuma Suzano - SP como padrão.
4. Nunca assuma cidades fora da região do Alto Tietê, mesmo que o nome da rua exista em outros municípios.
5. Complete o endereço com bairro, cidade e estado (SP) sempre que possível.
6. Formato de saída: "Rua/Av Nome, Número - Bairro, Cidade - SP"

Retorne APENAS um JSON no formato: {"address":"endereço completo formatado","found":true}
Se não encontrar nenhum endereço na conversa, retorne: {"address":"","found":false}`;

    const user = `CONVERSA:\n${transcript}\n\nRetorne o JSON com o endereço de destino:`;

    let result = { address: '', found: false };

    if (provider === 'openai') {
      const r = await retryFetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          temperature: 0.1, response_format: { type: 'json_object' },
        }),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
      const j = await r.json();
      result = JSON.parse(j.choices[0].message.content);

    } else if (provider === 'anthropic') {
      const r = await retryFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'claude-haiku-4-5', max_tokens: 256,
          system, messages: [{ role: 'user', content: user }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
      const j = await r.json();
      const match = j.content[0].text.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : result;

    } else if (provider === 'gemini') {
      const mdl = model || 'gemini-1.5-flash';
      const r = await retryFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: `${system}\n\n${user}` }] }], generationConfig: { temperature: 0.1 } }) }
      );
      if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
      const j = await r.json();
      const match = j.candidates[0].content.parts[0].text.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : result;
    }

    // Se a IA encontrou um endereço, tenta complementá-lo via Nominatim (gratuito)
    if (result.found && result.address) {
      try {
        const nominatimRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(result.address)}&format=json&addressdetails=1&limit=1&countrycodes=br`,
          { headers: { 'User-Agent': 'NexChat/1.0' }, signal: AbortSignal.timeout(5000) }
        );
        const places = await nominatimRes.json();
        if (places.length > 0) {
          const a = places[0].address;
          const road    = a.road ?? '';
          const num     = a.house_number ?? '';
          const cep     = (a.postcode ?? '').replace(/\D/g, '');
          const bairro  = a.suburb ?? a.neighbourhood ?? a.city_district ?? '';
          const cidade  = a.city ?? a.town ?? a.municipality ?? '';
          const uf      = a.state_code ?? a.ISO3166_2_lvl4?.split('-')[1] ?? '';

          // Monta no padrão: "Rua X, N - CEP Bairro Cidade - UF"
          const streetPart = [road, num].filter(Boolean).join(', ');
          const midPart    = [cep, bairro].filter(Boolean).join(' ');
          const cityPart   = [cidade, uf].filter(Boolean).join(' - ');
          const formatted  = [streetPart, midPart, cityPart].filter(Boolean).join(' - ');

          // Só substitui se ficou mais completo (mais caracteres que a resposta da IA)
          if (formatted.length > result.address.length + 5) {
            result.address = formatted;
            result.enriched = true;
          }
        }
      } catch (nominatimErr) {
        // Nominatim falhou — usa o endereço da IA mesmo
        console.warn('[ride/extract-address] Nominatim:', nominatimErr.message);
      }
    }

    res.json(result);
  } catch (err) {
    console.error('[ride/extract-address]', err.message);
    // Traduz erros comuns da IA para mensagens amigáveis
    const msg = err.message ?? '';
    if (msg.includes('429'))
      return res.status(429).json({ error: 'Limite de requisições da IA atingido (rate limit). Aguarde alguns segundos e tente novamente.' });
    if (msg.includes('503') || msg.includes('UNAVAILABLE'))
      return res.status(503).json({ error: 'A IA está sobrecarregada no momento. Tente novamente em instantes.' });
    if (msg.includes('401') || msg.includes('API_KEY') || msg.includes('invalid'))
      return res.status(401).json({ error: 'Chave de API inválida ou sem permissão. Verifique em Configurações → Tabulação.' });
    res.status(500).json({ error: msg || 'Erro ao processar com a IA.' });
  }
});

// ─── Proxy de mídia (contorna CORS e expiração de URLs do WhatsApp CDN) ─────────
app.get('/api/media-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url param' });

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'WhatsApp/2.24.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 dias
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.warn('[media-proxy] erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Helper: resolve tabulação pelo canal da conversa ────────────────────────
function getTabulationForChannel(channelId) {
  const cfgs = store.config?.tabulationConfigs ?? [];
  // 1. Busca configuração específica para o canal
  const specific = cfgs.find(c => c.enabled && Array.isArray(c.channelIds) && c.channelIds.includes(channelId));
  if (specific) return specific;
  // 2. Fallback: configuração global (sem canal vinculado)
  return cfgs.find(c => c.enabled && (!c.channelIds || c.channelIds.length === 0)) ?? null;
}

// ─── Configuração de tabulação (legado — compatibilidade) ─────────────────────
app.get('/api/tabulation', (req, res) => {
  // Retorna o primeiro config global para compatibilidade
  const cfgs = store.config?.tabulationConfigs ?? [];
  const global = cfgs.find(c => !c.channelIds?.length) ?? cfgs[0] ?? null;
  res.json(global);
});

app.post('/api/tabulation', (req, res) => {
  if (!store.config) store.config = {};
  if (!store.config.tabulationConfigs) store.config.tabulationConfigs = [];
  const body = req.body;
  // Upsert: se body.id existir, atualiza; caso contrário substitui o primeiro global
  const idx = store.config.tabulationConfigs.findIndex(c => c.id === body.id || (!c.channelIds?.length && !body.id));
  if (idx >= 0) {
    store.config.tabulationConfigs[idx] = { ...store.config.tabulationConfigs[idx], ...body };
  } else {
    store.config.tabulationConfigs.push({ id: body.id ?? `tab_${Date.now()}`, name: body.name ?? 'Geral', channelIds: [], ...body });
  }
  save();
  res.json({ ok: true });
});

// ─── Produtos do Pod Sales (proxy em tempo real) ─────────────────────────────
// Retorna a lista de nomes de produtos cadastrados no sistema de controle de
// vendas (porta 5500) para popular o campo "pod_product" da tabulação.
app.get('/api/pod-products', async (req, res) => {
  try {
    const r    = await fetch('http://localhost:5500/api/data', { signal: AbortSignal.timeout(4000) });
    const data = await r.json();
    const names = (data.products ?? []).map(p => p.name).filter(Boolean).sort();
    res.json(names);
  } catch (err) {
    console.warn('[pod-products] Pod Sales indisponível:', err.message);
    res.json([]); // retorna lista vazia em vez de erro para não quebrar a UI
  }
});

// ─── Re-sync manual de vendas pendentes ──────────────────────────────────────
app.get('/api/pod-sync-pending', (req, res) => {
  res.json(store.podSyncPending ?? []);
});

app.post('/api/pod-sync-retry', async (req, res) => {
  const pending = store.podSyncPending ?? [];
  if (pending.length === 0) return res.json({ ok: true, synced: 0, failed: 0 });

  let synced = 0, failed = 0;
  const remaining = [];

  for (const p of pending) {
    try {
      await syncSaleToPod(p.tabulation, p.contactName);
      synced++;
      console.log(`[pod-integration] ✅ Re-sync OK: conv ${p.convId}`);
    } catch (err) {
      failed++;
      remaining.push({ ...p, failedAt: new Date().toISOString(), reason: err.message });
      console.error(`[pod-integration] ❌ Re-sync falhou: conv ${p.convId} — ${err.message}`);
    }
  }

  store.podSyncPending = remaining;
  save();
  res.json({ ok: true, synced, failed, remaining: remaining.length });
});

// ─── Sync de config do frontend (canais, chatbots, grupos, KBs) ──────────────
// Permite que o frontend restaure listas a partir do servidor quando o
// localStorage estiver vazio ou desatualizado.
app.get('/api/chatbots', (req, res) => {
  res.json(Object.values(store.chatbots));
});
app.delete('/api/chatbots/:id', (req, res) => {
  const { id } = req.params;
  if (!store.chatbots[id]) return res.status(404).json({ error: 'Chatbot não encontrado' });
  delete store.chatbots[id];
  save();
  console.log(`[chatbot] Deletado: ${id}`);
  res.json({ ok: true });
});
app.get('/api/channels', (req, res) => {
  res.json(Object.values(store.channels));
});
app.get('/api/groups', (req, res) => {
  res.json(Object.values(store.groups));
});
app.get('/api/knowledge-bases', (req, res) => {
  res.json(Object.values(store.knowledgeBases));
});

// ─── CRUD de configurações de tabulação por canal ─────────────────────────────
app.get('/api/tabulation-configs', (req, res) => {
  res.json(store.config?.tabulationConfigs ?? []);
});

app.post('/api/tabulation-configs', (req, res) => {
  if (!store.config) store.config = {};
  if (!store.config.tabulationConfigs) store.config.tabulationConfigs = [];
  const cfg = { id: `tab_${Date.now()}`, name: 'Nova tabulação', channelIds: [], enabled: true, fields: [], ...req.body };
  store.config.tabulationConfigs.push(cfg);
  save();
  res.json({ ok: true, config: cfg });
});

app.put('/api/tabulation-configs/:id', (req, res) => {
  if (!store.config?.tabulationConfigs) return res.status(404).json({ error: 'Não encontrado' });
  const idx = store.config.tabulationConfigs.findIndex(c => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Não encontrado' });
  store.config.tabulationConfigs[idx] = { ...store.config.tabulationConfigs[idx], ...req.body, id: req.params.id };
  save();
  res.json({ ok: true, config: store.config.tabulationConfigs[idx] });
});

app.delete('/api/tabulation-configs/:id', (req, res) => {
  if (!store.config?.tabulationConfigs) return res.status(404).json({ error: 'Não encontrado' });
  store.config.tabulationConfigs = store.config.tabulationConfigs.filter(c => c.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ─── Teste manual do webhook Make/Zapier ─────────────────────────────────────
// Dispara um payload de exemplo para a URL configurada em MAKE_WEBHOOK_URL.
// Útil para validar a integração sem precisar fechar uma conversa real.
app.post('/api/test-make-webhook', async (req, res) => {
  const url = process.env.MAKE_WEBHOOK_URL;
  if (!url) return res.status(400).json({ error: 'MAKE_WEBHOOK_URL não definida no server/.env' });

  const testPayload = {
    event:     'sale_completed',
    timestamp: new Date().toISOString(),
    contact:   'Cliente Teste',
    seller:    'Gabriel',
    sale_id:   String(Date.now()),
    date:      new Date().toISOString().slice(0, 10),
    total:     220.00,
    products:  [
      { name: 'V400', flavor: 'Apple Ice / Strawberry Watermelon', quantity: 1 },
    ],
    payment:   'PIX',
    shipping:  0,
    _test:     true,
  };

  try {
    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(testPayload),
      signal:  AbortSignal.timeout(10000),
    });
    const body = await r.text().catch(() => '');
    console.log(`[make-webhook] 🧪 Teste disparado → status ${r.status}`);
    res.json({ ok: r.ok, status: r.status, response: body, payload: testPayload });
  } catch (err) {
    console.error('[make-webhook] ❌ Teste falhou:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Análise da conversa por IA para pré-preencher tabulação ─────────────────
app.post('/api/tabulation/analyze', async (req, res) => {
  try {
    const { conversationId } = req.body;
    const conv = store.conversations[conversationId];
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });

    // Usa a tabulação específica do canal da conversa (ou a global)
    const tabConfig = getTabulationForChannel(conv.channelId);
    if (!tabConfig?.aiConfig?.apiKey) {
      return res.status(400).json({ error: 'IA não configurada na tabulação.' });
    }

    const msgs  = store.messages[conversationId] ?? [];

    const { provider, apiKey, model } = tabConfig.aiConfig;
    const fields = tabConfig.fields ?? [];

    // ── Monta prompt ───────────────────────────────────────────────────────────
    const fieldDescriptions = fields.map(f => {
      let desc = `- "${f.label}" (id: ${f.id}, tipo: ${f.type}`;
      if (f.type === 'select' && f.options?.length) {
        desc += `, opções: [${f.options.map(o => `"${o}"`).join(', ')}]`;
      }
      if (f.showWhen) desc += `, condicional`;
      desc += f.required ? ', obrigatório)' : ', opcional)';
      return desc;
    }).join('\n');

    const transcript = msgs.map(m =>
      `${m.direction === 'outgoing' ? 'OPERADOR' : 'CLIENTE'}: ${m.content}`
    ).join('\n');

    const systemPrompt = `Você é um assistente que analisa conversas de atendimento ao cliente e preenche formulários de tabulação.
Analise a conversa e retorne APENAS um objeto JSON com os campos preenchidos.
Para campos do tipo "select", use EXATAMENTE uma das opções disponíveis.
Para campos condicionais, inclua-os apenas se o contexto indicar que devem ser preenchidos.
Para campos do tipo "number", retorne apenas o número (sem símbolo de moeda).
Não inclua explicações, apenas o JSON.`;

    const userPrompt = `CAMPOS DO FORMULÁRIO:\n${fieldDescriptions}\n\nCONVERSA:\n${transcript}\n\nRetorne o JSON preenchido:`;

    // ── Chama a API da IA ──────────────────────────────────────────────────────
    let suggestion = null;

    if (provider === 'openai') {
      const defaultModel = model || 'gpt-4o-mini';
      const r = await retryFetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: defaultModel,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
      const j = await r.json();
      suggestion = JSON.parse(j.choices[0].message.content);

    } else if (provider === 'anthropic') {
      const defaultModel = model || 'claude-haiku-4-5';
      const r = await retryFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: defaultModel,
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
      const j = await r.json();
      const text = j.content[0].text;
      const match = text.match(/\{[\s\S]*\}/);
      suggestion = match ? JSON.parse(match[0]) : {};

    } else if (provider === 'gemini') {
      const defaultModel = model || 'gemini-1.5-flash';
      const r = await retryFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.2 },
          }),
        }
      );
      if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
      const j = await r.json();
      const text = j.candidates[0].content.parts[0].text;
      const match = text.match(/\{[\s\S]*\}/);
      suggestion = match ? JSON.parse(match[0]) : {};
    }

    res.json({ suggestion });
  } catch (err) {
    console.error('[tabulation/analyze]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Listagem de tabulações para relatório ────────────────────────────────────
app.get('/api/tabulations', (req, res) => {
  const days = parseInt(req.query.days ?? '30', 10);
  const from = new Date(Date.now() - days * 86_400_000);

  const records = Object.values(store.conversations)
    .filter(c => c.status === 'resolved' && c.tabulation && new Date(c.resolvedAt || c.updatedAt) >= from)
    .sort((a, b) => new Date(b.resolvedAt || b.updatedAt) - new Date(a.resolvedAt || a.updatedAt))
    .map(c => ({
      id:          c.id,
      contactName: c.contact?.name ?? c.contact?.phone ?? '—',
      contactPhone: c.contact?.phone ?? '—',
      resolvedAt:  c.resolvedAt || c.updatedAt,
      tabulation:  c.tabulation,
      channelId:   c.channelId,
    }));

  res.json(records);
});

// ─── Encerra sessão do bot manualmente ───────────────────────────────────────
app.post('/api/conversations/:id/end-bot', (req, res) => {
  const conv = store.conversations[req.params.id];
  if (!conv) return res.status(404).json({ error: 'Not found' });
  endBotSession(conv);
  save();
  res.json({ ok: true });
});

/** Marca como encerrada qualquer sessão de bot associada a esta conversa */
function endBotSession(conv) {
  const sessionKey = `${conv.contact.phone}:${conv.channelId}`;
  const session = store.sessions[sessionKey];
  if (session && !session.ended) {
    store.sessions[sessionKey] = { ...session, ended: true, waitingFor: null };
    console.log(`[takeover] Sessão de bot encerrada: ${sessionKey}`);
  }
}

// ─── Reset de conversa para testes ───────────────────────────────────────────
// Encerra a conversa, remove a sessão do bot e backdatea o resolvedAt para que
// na próxima mensagem o bot reinicie do zero (ignora janela de 24 h).
app.post('/api/conversations/:id/reset', (req, res) => {
  const conv = store.conversations[req.params.id];
  if (!conv) return res.status(404).json({ error: 'Not found' });

  const sessionKey = `${conv.contact.phone}:${conv.channelId}`;
  const past25h    = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

  // Remove sessão do bot completamente
  delete store.sessions[sessionKey];

  // Encerra a conversa com resolvedAt no passado (força caminho "após 24h")
  store.conversations[req.params.id] = {
    ...conv,
    status:     'resolved',
    resolvedAt: past25h,
    updatedAt:  past25h,
  };

  broadcast('conversation_updated', store.conversations[req.params.id]);
  save();

  console.log(`[reset] Conversa ${req.params.id} resetada para teste de chatbot`);
  res.json({ ok: true, sessionKey, resolvedAt: past25h });
});

// ─── Relatórios em tempo real ─────────────────────────────────────────────────
app.get('/api/reports', (req, res) => {
  const days    = Math.min(Math.max(parseInt(req.query.days) || 10, 1), 90);
  const groupId = req.query.groupId || '';

  const now    = Date.now();
  const cutoff = now - days * 86400000;

  // Conversas no período (e opcionalmente do grupo)
  const convs = Object.values(store.conversations).filter(c => {
    if (new Date(c.createdAt).getTime() < cutoff) return false;
    if (groupId && c.groupId !== groupId) return false;
    return true;
  });

  // ── Mapa convId → sessão mais recente ──────────────────────────────────────
  const convSession = {};
  for (const session of Object.values(store.sessions)) {
    if (!session.convId) continue;
    const prev = convSession[session.convId];
    // Mantém a sessão com createdAt mais recente (ou qualquer se não tiver)
    if (!prev || session.ended) convSession[session.convId] = session;
  }

  // ── Mapa nodeId → tipo de nó ──────────────────────────────────────────────
  const nodeType = {};
  for (const bot of Object.values(store.chatbots)) {
    for (const n of (bot.nodes || [])) nodeType[n.id] = n.type;
  }

  // ── Attendance por dia ────────────────────────────────────────────────────
  const dayMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const dd  = String(d.getDate()).padStart(2, '0');
    const mm  = String(d.getMonth() + 1).padStart(2, '0');
    dayMap[key] = { date: `${dd}/${mm}`, atendimentos: 0, resolvidos: 0, _msTotal: 0, _resCount: 0 };
  }

  for (const c of convs) {
    const key = c.createdAt?.slice(0, 10);
    if (!key || !dayMap[key]) continue;
    dayMap[key].atendimentos++;
    if (c.status === 'resolved') {
      dayMap[key].resolvidos++;
      const ms = new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime();
      if (ms > 0) { dayMap[key]._msTotal += ms / 60000; dayMap[key]._resCount++; }
    }
  }

  const attendance = Object.values(dayMap).map(d => ({
    date:         d.date,
    atendimentos: d.atendimentos,
    resolvidos:   d.resolvidos,
    tempo_medio:  d._resCount > 0 ? Math.round(d._msTotal / d._resCount) : 0,
  }));

  // ── Resumo geral ──────────────────────────────────────────────────────────
  const total    = convs.length;
  const resolved = convs.filter(c => c.status === 'resolved').length;
  const avgTime  = (() => {
    const rs = convs.filter(c => c.status === 'resolved');
    if (!rs.length) return 0;
    const ms = rs.reduce((s, c) => s + (new Date(c.updatedAt) - new Date(c.createdAt)), 0);
    return Math.round(ms / rs.length / 60000);
  })();

  // ── Funil chatbot ─────────────────────────────────────────────────────────
  let initiated = 0, resolvedBot = 0, transferred = 0, abandoned = 0, active = 0;
  for (const c of convs) {
    initiated++;
    const s = convSession[c.id];
    if (!s || !s.ended) {
      // Sem sessão encerrada
      if (c.status === 'in_progress' || c.status === 'open') active++;
      else if (c.status === 'resolved') resolvedBot++; // resolvido sem sessão bot = operador encerrou
      else active++;
      continue;
    }
    const type = nodeType[s.nodeId];
    if      (type === 'end_finish')  resolvedBot++;
    else if (type === 'end_handoff') transferred++;
    else                              abandoned++;
    // Se conversa está in_progress conta como transferred (operador assumiu)
    if (c.status === 'in_progress')  { transferred++; resolvedBot = Math.max(0, resolvedBot - (type === 'end_finish' ? 1 : 0)); }
  }

  const chatbot = [
    { etapa: 'Iniciados',           valor: initiated },
    { etapa: 'Em andamento',        valor: active },
    { etapa: 'Resolvidos pelo bot', valor: resolvedBot },
    { etapa: 'Transferidos',        valor: transferred },
    { etapa: 'Abandonados',         valor: abandoned },
  ];

  // ── Por canal ─────────────────────────────────────────────────────────────
  const chMap = {};
  const chById = {};
  for (const ch of Object.values(store.channels)) chById[ch.id] = ch;

  for (const c of convs) {
    const ch = chById[c.channelId];
    const key = c.channelId || 'desconhecido';
    if (!chMap[key]) chMap[key] = { nome: ch?.name || key, atendimentos: 0, resolvidos: 0, _ms: 0, _rc: 0 };
    chMap[key].atendimentos++;
    if (c.status === 'resolved') {
      chMap[key].resolvidos++;
      const ms = new Date(c.updatedAt) - new Date(c.createdAt);
      if (ms > 0) { chMap[key]._ms += ms / 60000; chMap[key]._rc++; }
    }
  }

  const channels = Object.values(chMap).map(c => ({
    nome:         c.nome,
    atendimentos: c.atendimentos,
    resolvidos:   c.resolvidos,
    tempo_medio:  c._rc > 0 ? Math.round(c._ms / c._rc) : 0,
  })).sort((a, b) => b.atendimentos - a.atendimentos);

  res.json({ attendance, chatbot, channels, summary: { total, resolved, avgTime } });
});

// ─── Zera unread ao abrir conversa ───────────────────────────────────────────
app.post('/api/conversations/:id/read', (req, res) => {
  const conv = store.conversations[req.params.id];
  if (!conv) return res.status(404).json({ error: 'Not found' });
  store.conversations[req.params.id] = { ...conv, unreadCount: 0 };
  save();
  res.json({ ok: true });
});

// ─── Config do servidor (tokens de integrações) ───────────────────────────────
app.get('/api/config', (_req, res) => {
  // Nunca expõe o token completo — apenas informa se está configurado
  res.json({
    mercadoPagoConfigured: !!store.config?.mercadoPagoToken,
  });
});

app.post('/api/config', (req, res) => {
  const { mercadoPagoToken } = req.body;
  if (!store.config) store.config = {};
  if (mercadoPagoToken !== undefined) {
    store.config.mercadoPagoToken = mercadoPagoToken.trim();
    console.log(`[config] Mercado Pago token ${mercadoPagoToken ? 'salvo' : 'removido'}`);
  }
  save();
  res.json({ ok: true });
});

// ─── PIX — Mercado Pago ───────────────────────────────────────────────────────

// Gera QR Code PIX (retorna base64 + copia-e-cola para o operador visualizar)
app.post('/api/pix/generate', async (req, res) => {
  try {
    const { amount, description } = req.body;
    const result = await generatePixPayment({ amount, description });
    res.json(result);
  } catch (err) {
    console.error('[pix/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Envia o QR Code PIX para o cliente via WhatsApp
app.post('/api/pix/send', async (req, res) => {
  const { conversationId, qrCodeImage, qrCode, amount } = req.body;

  const conv = store.conversations[conversationId];
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

  const channel = store.channels[conv.instanceName];
  if (!channel) return res.status(400).json({ error: 'Canal não encontrado' });

  try {
    const to        = conv.contact.jid || conv.contact.phone;
    const amountFmt = parseFloat(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // 1ª mensagem: imagem do QR Code com legenda do valor
    await sendImageBase64(channel, to, qrCodeImage, `💸 *PIX — ${amountFmt}*`);

    // Pequena pausa para garantir ordem de entrega
    await new Promise(r => setTimeout(r, 1000));

    // 2ª mensagem: código copia e cola (apenas o código bruto)
    const copiaCola = qrCode;
    await sendText(channel, to, copiaCola);

    // Registra as duas mensagens na conversa
    const now  = new Date().toISOString();
    const msg1 = {
      id:             `pix_img_${Date.now()}`,
      conversationId: conv.id,
      content:        `💸 PIX gerado — ${amountFmt}`,
      type:           'image',
      direction:      'outgoing',
      status:         'sent',
      timestamp:      now,
    };
    const msg2 = {
      id:             `pix_txt_${Date.now() + 1}`,
      conversationId: conv.id,
      content:        copiaCola,
      type:           'text',
      direction:      'outgoing',
      status:         'sent',
      timestamp:      now,
    };
    if (!store.messages[conv.id]) store.messages[conv.id] = [];
    store.messages[conv.id].push(msg1, msg2);
    store.conversations[conv.id] = { ...conv, lastMessage: msg2, updatedAt: now };
    save();
    broadcast('message_new',          { conversationId: conv.id, message: msg1 });
    broadcast('message_new',          { conversationId: conv.id, message: msg2 });
    broadcast('conversation_updated',  store.conversations[conv.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[pix/send]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Healthcheck ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }));

// ─── Diagnóstico (útil para depuração) ────────────────────────────────────────
app.get('/api/debug', async (_req, res) => {
  const channels  = Object.entries(store.channels).map(([inst, ch]) => ({
    instanceName: inst,
    id:           ch.id,
    name:         ch.name,
    apiUrl:       ch.evolutionApiUrl,
    hasApiKey:    !!ch.evolutionApiKey,
    status:       ch.status,
  }));

  const chatbots = Object.entries(store.chatbots).map(([cid, bot]) => ({
    channelId: cid,
    name:      bot.name,
    status:    bot.status,
    nodes:     bot.nodes?.length ?? 0,
    edges:     bot.edges?.length ?? 0,
  }));

  const sessions = Object.entries(store.sessions).map(([key, s]) => ({
    key,
    nodeId:     s.nodeId,
    waitingFor: s.waitingFor,
    ended:      s.ended,
    vars:       s.vars,
  }));

  // Testa conectividade com cada instância Evolution
  const evTests = await Promise.all(
    channels.map(async (ch) => {
      try {
        const r = await fetch(
          `${ch.apiUrl?.replace(/\/$/, '')}/instance/fetchInstances`,
          { headers: { apikey: store.channels[ch.instanceName]?.evolutionApiKey ?? '' },
            signal: AbortSignal.timeout(3000) }
        );
        return { inst: ch.instanceName, status: r.status, ok: r.ok };
      } catch (e) {
        return { inst: ch.instanceName, status: 'error', error: e.message };
      }
    })
  );

  const knowledgeBases = Object.entries(store.knowledgeBases || {}).map(([id, kb]) => ({
    id,
    name:    kb.name,
    chars:   kb.content?.length ?? 0,
  }));

  res.json({ channels, chatbots, sessions, knowledgeBases, evolutionTests: evTests });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO DE SEGURANÇA — Autenticação, 2FA, Recuperação de Senha, LGPD, Logs
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /auth/login — Autenticação com bcrypt + JWT + 2FA ──────────────────
app.post('/auth/login', async (req, res) => {
  const { username, password, totpToken } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username e password são obrigatórios' });
  }
  try {
    const result = await login(username, password, totpToken, req.ip);
    res.json(result);
  } catch (err) {
    const status = err.status || 401;
    res.status(status).json({ error: err.message, require2FA: err.require2FA || false });
  }
});

// ─── POST /auth/logout — Invalida o JWT (blacklist) ──────────────────────────
app.post('/auth/logout', requireAuth, (req, res) => {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  logout(token);
  res.json({ ok: true, message: 'Sessão encerrada com sucesso.' });
});

// ─── GET /auth/me — Dados do usuário autenticado (valida sessão) ─────────────
app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// ─── POST /auth/change-password — Altera senha (requer auth) ─────────────────
app.post('/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword e newPassword são obrigatórios' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres' });
  }
  try {
    await changePassword(req.user.username, currentPassword, newPassword);
    res.json({ ok: true, message: 'Senha alterada com sucesso.' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// ─── POST /auth/recovery/request — Solicita token de recuperação de senha ────
app.post('/auth/recovery/request', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username obrigatório' });
  try {
    const token = generateRecoveryToken(username);
    // Em produção: enviar token por e-mail. Aqui retornamos para fins acadêmicos.
    res.json({ ok: true, token, message: 'Token de recuperação gerado. Em produção seria enviado por e-mail.' });
  } catch (err) {
    // Sempre retorna 200 para não vazar existência de usuário
    res.json({ ok: true, message: 'Se o usuário existir, um token será enviado.' });
  }
});

// ─── POST /auth/recovery/reset — Redefine senha com token de recuperação ─────
app.post('/auth/recovery/reset', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'token e newPassword são obrigatórios' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Nova senha deve ter mínimo 8 caracteres' });
  try {
    consumeRecoveryToken(token, newPassword);
    res.json({ ok: true, message: 'Senha redefinida com sucesso.' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// ─── POST /auth/2fa/setup — Gera secret TOTP e URL para QR Code ──────────────
app.post('/auth/2fa/setup', requireAuth, (req, res) => {
  try {
    const { secret, otpAuthUrl } = generate2FASecret(req.user.username);
    res.json({ secret, otpAuthUrl, message: 'Escaneie o QR Code no Google Authenticator e confirme com /auth/2fa/confirm' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── POST /auth/2fa/confirm — Confirma ativação do 2FA ───────────────────────
app.post('/auth/2fa/confirm', requireAuth, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token TOTP obrigatório' });
  try {
    const ok = verify2FASetup(req.user.username, token);
    if (ok) res.json({ ok: true, message: '2FA ativado com sucesso.' });
    else res.status(400).json({ error: 'Token TOTP inválido. Verifique o horário do dispositivo.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── GET /auth/users — Lista usuários (somente superadmin) ───────────────────
app.get('/auth/users', requireAuth, (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Acesso negado' });
  res.json(listUsers());
});

// ─── POST /auth/users — Cria operador (somente superadmin) ───────────────────
app.post('/auth/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Acesso negado' });
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username e password obrigatórios' });
  try {
    await createUser(username, password, role || 'operator');
    res.json({ ok: true, message: `Usuário ${username} criado.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LGPD — Lei Geral de Proteção de Dados (Lei nº 13.709/2018)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /lgpd/data — Consulta dados pessoais do titular ─────────────────────
app.get('/lgpd/data', requireAuth, (req, res) => {
  try {
    const data = getLGPDData(req.user.username);
    auditLog('LGPD_DATA_ACCESS', { username: req.user.username, ip: req.ip });
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ─── GET /lgpd/export — Exporta dados pessoais em JSON ───────────────────────
app.get('/lgpd/export', requireAuth, (req, res) => {
  try {
    const data = exportLGPDData(req.user.username);
    res.setHeader('Content-Disposition', `attachment; filename="dados-pessoais-${req.user.username}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ─── DELETE /lgpd/data — Solicita exclusão de dados pessoais (Art. 18, VI) ───
app.delete('/lgpd/data', requireAuth, (req, res) => {
  const { targetUsername } = req.body;
  // Usuário pode excluir seus próprios dados; superadmin pode excluir de qualquer um
  const target = targetUsername && req.user.role === 'superadmin' ? targetUsername : req.user.username;
  try {
    deleteUserData(target, req.user.username);
    res.json({ ok: true, message: `Dados de "${target}" excluídos conforme Art. 18, VI da LGPD.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── POST /lgpd/consent — Registra/atualiza consentimento (Art. 7, I) ─────────
app.post('/lgpd/consent', requireAuth, (req, res) => {
  const { version, given } = req.body;
  if (!version) return res.status(400).json({ error: 'version é obrigatório' });
  try {
    updateConsent(req.user.username, version, given !== false);
    res.json({ ok: true, message: 'Consentimento registrado conforme Art. 7, I da LGPD.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUDITORIA — Logs de segurança e acessos
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /auth/audit-log — Leitura dos logs de auditoria (superadmin) ─────────
app.get('/auth/audit-log', requireAuth, (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Acesso negado' });
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const logs = readAuditLog(limit);
  res.json({ count: logs.length, entries: logs });
});

// ─── Migração: store.config.tabulation → store.config.tabulationConfigs ──────
if (!store.config) store.config = {};

if (!Array.isArray(store.config.tabulationConfigs)) {
  const legacy = store.config.tabulation;
  if (legacy && legacy.fields?.length) {
    // Migra configuração legada para o novo modelo com id/name/channelIds
    store.config.tabulationConfigs = [{
      id:         legacy.id         ?? 'default',
      name:       legacy.name       ?? 'Geral',
      channelIds: legacy.channelIds ?? [],
      enabled:    legacy.enabled    ?? true,
      fields:     legacy.fields,
      aiConfig:   legacy.aiConfig   ?? undefined,
    }];
    console.log('[tabulation] Configuração legada migrada para tabulationConfigs.');
  } else {
    // Nenhuma config: inicia com a configuração de Pod Sales
    store.config.tabulationConfigs = [{
      ...POD_TABULATION_CONFIG,
      id:         'pod-sales',
      name:       'Pod Sales',
      channelIds: [],
    }];
    console.log('[pod-integration] Tabulação de Pod Sales criada como configuração padrão.');
  }
  save();
}

// Diagnóstico
const tabCfgs = store.config.tabulationConfigs;
console.log(`[tabulation] ${tabCfgs.length} configuração(ões) de tabulação:`);
tabCfgs.forEach(c => {
  const ch = c.channelIds?.length ? `canais: [${c.channelIds.join(', ')}]` : 'global (fallback)';
  console.log(`  → "${c.name}" (${c.fields?.length ?? 0} campos) | ${ch}`);
});

app.listen(PORT, () => {
  console.log(`\n🚀 Nex-Chat server rodando em http://localhost:${PORT}`);
  console.log(`   Webhook URL (Evolution API): http://host.docker.internal:${PORT}/webhook`);
  console.log(`   SSE Frontend: http://localhost:${PORT}/api/events\n`);
  startTimerJob();

  // ── Re-tenta sincronização de vendas pendentes a cada 2 minutos ─────────────
  setInterval(async () => {
    const pending = store.podSyncPending ?? [];
    if (pending.length === 0) return;
    console.log(`[pod-integration] 🔄 Tentando re-sync de ${pending.length} venda(s) pendente(s)...`);
    const remaining = [];
    for (const p of pending) {
      try {
        await syncSaleToPod(p.tabulation, p.contactName);
        console.log(`[pod-integration] ✅ Re-sync automático OK: conv ${p.convId}`);
        broadcast('pod_sync_recovered', { convId: p.convId });
      } catch {
        remaining.push(p);
      }
    }
    if (remaining.length !== pending.length) {
      store.podSyncPending = remaining;
      save();
    }
  }, 2 * 60 * 1000);
});
