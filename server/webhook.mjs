/**
 * webhook.mjs - processa eventos enviados pela Evolution API v1.x
 */
import { store, save }           from './store.mjs';
import { runFlow }               from './engine.mjs';
import { broadcast }             from './index.mjs';
import { fetchProfilePicture, getMediaBase64 } from './evolution.mjs';

// ─── Deduplicação de mensagens ────────────────────────────────────────────────
// Armazena IDs de mensagens já processadas por 60 s para evitar duplicatas
// causadas por múltiplos webhooks (global + por instância) ou multi-device.
const recentMsgIds = new Set();

// ─── Janela de reativação sem bot (24 h) ─────────────────────────────────────
const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;

// ─── Seleção de bot por horário ───────────────────────────────────────────────
// Retorna o bot ativo para o canal cujo horário agendado cobre o momento atual.
// Se não houver agendamento configurado (schedule ausente ou disabled), o bot
// funciona em qualquer horário (comportamento original).
// Quando vários bots cobrem o mesmo canal, o agendado com horário tem prioridade
// sobre o sem agendamento; em caso de empate ganha o primeiro encontrado.
function isScheduleActive(schedule) {
  if (!schedule || !schedule.enabled) return true; // sem restrição = sempre ativo
  const now  = new Date();
  const day  = now.getDay(); // 0=Dom … 6=Sáb
  if (!schedule.days.includes(day)) return false;
  const hhmm = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = schedule.startTime.split(':').map(Number);
  const [eh, em] = schedule.endTime.split(':').map(Number);
  const start = sh * 60 + sm;
  const end   = eh * 60 + em;
  // Suporte a intervalos que cruzam meia-noite (ex: 23:00 → 07:59)
  if (start <= end) return hhmm >= start && hhmm <= end;
  return hhmm >= start || hhmm <= end;
}

function selectBot(chatbots, channelId) {
  const candidates = Object.values(chatbots).filter(
    b => b.channelId === channelId && b.status === 'active'
  );
  if (candidates.length === 0) return null;
  // Prefere bots com agendamento habilitado que cubram o horário atual
  const scheduled = candidates.filter(b => b.schedule?.enabled && isScheduleActive(b.schedule));
  if (scheduled.length > 0) return scheduled[0];
  // Fallback: bots sem agendamento (sempre ligados)
  const unscheduled = candidates.filter(b => !b.schedule || !b.schedule.enabled);
  return unscheduled[0] ?? null;
}

// ─── Buffer de input (debounce) ───────────────────────────────────────────────
// Quando o bot está aguardando input de texto (waitingFor === 'input'), o usuário
// pode enviar várias mensagens em sequência (ex: "quero chocolate", "tamanho P",
// "até R$50"). Em vez de processar só a primeira, acumulamos todas e, após
// INPUT_DEBOUNCE_MS de silêncio, combinamos em um único texto para a IA.
const INPUT_DEBOUNCE_MS = 5000;
const inputBuffers = new Map(); // chave: "phone:channelId" → { messages, timer }

export async function handleWebhook(req, res) {
  res.json({ ok: true }); // responde rápido para não timeout

  try {
    const body  = req.body;
    const event    = body.event    || body.tipo      || '';
    const instance = body.instance || body.instancia || '';
    const data     = body.data     || body;

    // Log de todos os webhooks recebidos
    console.log(`[webhook] evento="${event}" instância="${instance}"`);

    // Só processa mensagens recebidas
    if (!event.includes('messages') && !event.includes('message')) {
      console.log(`[webhook] Ignorado (não é evento de mensagem)`);
      return;
    }

    const key    = data.key || {};
    const fromMe = key.fromMe ?? data.fromMe ?? false;

    // ── Deduplicação por ID de mensagem ──────────────────────────────────────
    const waMsgId = key.id || data.messageId || '';
    if (waMsgId) {
      if (recentMsgIds.has(waMsgId)) {
        console.log(`[webhook] Duplicata detectada - ignorando msgId=${waMsgId}`);
        return;
      }
      recentMsgIds.add(waMsgId);
      setTimeout(() => recentMsgIds.delete(waMsgId), 60_000);
    }

    const remoteJid = key.remoteJid || data.remoteJid || '';
    if (!remoteJid || remoteJid.includes('@g.us')) {
      console.log(`[webhook] Ignorado (grupo ou JID vazio: ${remoteJid})`);
      return;
    }

    console.log(`[webhook] RAW remoteJid: ${remoteJid} fromMe=${fromMe}`);

    const phone    = remoteJid.split('@')[0].split(':')[0];
    const jid      = remoteJid.includes(':') ? `${phone}@${remoteJid.split('@')[1]}` : remoteJid;
    const pushName = data.pushName || data.pushname || phone;
    const msgObj   = data.message  || {};

    // Extrai conteúdo
    const text      = extractText(msgObj, data);
    const mediaInfo = text ? null : extractMedia(msgObj, data);
    const locInfo   = (!text && !mediaInfo) ? extractLocation(msgObj) : null;

    if (!text && !mediaInfo && !locInfo) {
      console.log(`[webhook] Ignorado (sem conteúdo extraível). msgObj keys: ${Object.keys(msgObj).join(', ')}`);
      return;
    }

    // Se for mídia sem base64 no payload, baixa agora via Evolution API (síncrono)
    if (mediaInfo && !mediaInfo.base64url && mediaInfo.url) {
      console.log(`[webhook] Mídia sem base64 - baixando via Evolution API…`);
      const earlyChannel = store.channels[instance];
      if (earlyChannel) {
        const b64 = await getMediaBase64(earlyChannel, { key: data.key, message: data.message })
          .catch(e => { console.warn(`[webhook] getMediaBase64 erro: ${e.message}`); return null; });
        if (b64) {
          mediaInfo.base64url = b64;
          console.log(`[webhook] Mídia baixada com sucesso (${mediaInfo.type})`);
        } else {
          console.warn(`[webhook] Não foi possível baixar mídia - usando URL como fallback`);
        }
      }
    }

    // ── Monta input efetivo para o engine ────────────────────────────────────
    // Para imagens: combina caption (se houver) + base64url para que o Gemini
    // receba tanto o texto da legenda quanto a imagem no mesmo turno.
    // Para áudio/vídeo/doc sem base64: usa a URL como fallback.
    let effectiveInput;
    let displayContent; // conteúdo exibido no chat da interface
    if (mediaInfo?.base64url) {
      effectiveInput = mediaInfo.caption
        ? `${mediaInfo.caption}\n${mediaInfo.base64url}`
        : mediaInfo.base64url;
      // Para exibição: sempre usa o base64url (a imagem real) para que a UI consiga renderizar.
      // A caption fica embutida no effectiveInput (para a IA), mas o conteúdo da mensagem
      // armazenada precisa ser a imagem para aparecer corretamente no chat.
      displayContent = mediaInfo.base64url;
    } else if (text) {
      effectiveInput = text;
      displayContent = text;
    } else if (mediaInfo?.url) {
      effectiveInput = mediaInfo.url;
      displayContent = mediaInfo.url;
    } else if (locInfo) {
      effectiveInput = locInfo.text;
      displayContent = locInfo.text;
    } else {
      effectiveInput = null;
      displayContent = null;
    }

    if (!effectiveInput) {
      console.log(`[webhook] Ignorado (input efetivo vazio).`);
      return;
    }

    console.log(`[webhook] Mensagem ${fromMe ? '(fromMe)' : 'de'} ${phone} (${pushName}): "${String(displayContent ?? effectiveInput).substring(0, 80)}" ${mediaInfo ? `[mídia: ${mediaInfo.type}${mediaInfo.caption ? ' + legenda' : ''}]` : ''}`);

    // ── Verifica canal registrado ────────────────────────────────
    const channel = store.channels[instance];
    if (!channel) {
      console.warn(`[webhook] AVISO: Instância não registrada: "${instance}". Canais registrados: [${Object.keys(store.channels).join(', ')}]`);
      return;
    }

    const channelId  = channel.id;
    const sessionKey = `${phone}:${channelId}`;

    // ── Mensagem enviada pelo próprio número do canal (app do WhatsApp) ──────
    if (fromMe) {
      // Busca conversa ativa primeiro; se só houver resolvida, usa ela;
      // se não houver nenhuma, cria uma nova com status 'open'.
      let conv =
        Object.values(store.conversations).find(
          c => c.contact.phone === phone && c.channelId === channelId && c.status !== 'resolved'
        ) ||
        Object.values(store.conversations)
          .filter(c => c.contact.phone === phone && c.channelId === channelId)
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];

      if (!conv) {
        // Operador iniciou contato por um número que nunca teve conversa - cria nova
        conv = {
          id:           `conv_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
          contactId:    phone,
          contact:      { id: phone, name: pushName, phone, jid },
          channelId,
          instanceName: instance,
          status:       'open',
          botInitiated: false, // iniciada pelo operador → nunca entra no bot
          assignedTo:   null,
          lastMessage:  null,
          unreadCount:  0,
          createdAt:    new Date().toISOString(),
          updatedAt:    new Date().toISOString(),
        };
        store.conversations[conv.id] = conv;
        store.messages[conv.id]      = [];
        broadcast('conversation_new', { ...conv, messages: [] });
        console.log(`[webhook] Nova conversa criada via fromMe para ${phone}`);
      }

      const outMsgType = mediaInfo ? mediaInfo.type : 'text';
      const outMsg = {
        id:             `wpp_${key.id || Date.now()}`,
        conversationId: conv.id,
        content:        effectiveInput,
        type:           outMsgType,
        direction:      'outgoing',
        status:         'sent',
        timestamp:      new Date().toISOString(),
      };
      if (!store.messages[conv.id]) store.messages[conv.id] = [];
      store.messages[conv.id].push(outMsg);

      // Se a conversa estava resolvida, reabre para aparecer na lista ativa
      const wasResolved = store.conversations[conv.id].status === 'resolved';
      store.conversations[conv.id] = {
        ...store.conversations[conv.id],
        status:      wasResolved ? 'open' : store.conversations[conv.id].status,
        lastMessage: outMsg,
        updatedAt:   outMsg.timestamp,
      };
      broadcast('message_new',         { conversationId: conv.id, message: outMsg });
      broadcast('conversation_updated', store.conversations[conv.id]);
      save();
      console.log(`[webhook] Mensagem outgoing (app) registrada na conversa ${conv.id}${wasResolved ? ' (reaberta)' : ''}`);
      return;
    }

    console.log(`[webhook] Canal encontrado: id=${channelId} name="${channel.name}"`);

    // ── Encontra ou cria conversa ────────────────────────────────
    // Prioridade: conversa ativa (não resolvida) do mesmo canal
    let conv = Object.values(store.conversations).find(
      c => c.contact.phone === phone && c.channelId === channelId && c.status !== 'resolved'
    );

    // Flag: indica se o bot NÃO deve ser executado para esta mensagem
    let skipBot = false;

    if (!conv) {
      // Busca a conversa resolvida mais recente do mesmo canal
      const prevConv = Object.values(store.conversations)
        .filter(c => c.contact.phone === phone && c.channelId === channelId && c.status === 'resolved')
        .sort((a, b) => new Date(b.resolvedAt || b.updatedAt) - new Date(a.resolvedAt || a.updatedAt))[0];

      if (prevConv) {
        const resolvedAt  = new Date(prevConv.resolvedAt || prevConv.updatedAt);
        const elapsed     = Date.now() - resolvedAt.getTime();
        const hasBotActive = selectBot(store.chatbots, channelId) !== null;

        conv = prevConv;

        if (elapsed <= REOPEN_WINDOW_MS && !prevConv.testMode) {
          // ── Dentro de 24 h (e sem Modo Teste): reabre em atendimento, sem reiniciar o bot ──
          store.conversations[conv.id] = {
            ...store.conversations[conv.id],
            status:     'in_progress',
            resolvedAt: null,
            updatedAt:  new Date().toISOString(),
          };
          conv = store.conversations[conv.id];
          skipBot = true;
          console.log(`[webhook] Conversa ${conv.id} reaberta dentro de 24 h (sem bot)`);
        } else {
          // ── Após 24 h: reabre e reinicia bot APENAS se a conversa foi originada pelo bot ──
          // Conversas iniciadas por operador (botInitiated=false) voltam como 'open',
          // nunca entram no fluxo do chatbot, mesmo que o canal tenha um vinculado.
          if (store.sessions) delete store.sessions[sessionKey];

          // undefined = conversa legada (antes do flag) → trata como iniciada pelo bot
          const wasBot      = conv.botInitiated !== false;
          const newStatus   = (hasBotActive && wasBot) ? 'bot' : 'open';
          const wasModeTest = prevConv.testMode === true;
          store.conversations[conv.id] = {
            ...store.conversations[conv.id],
            status:     newStatus,
            resolvedAt: null,
            testMode:   false,           // limpa flag após usar
            updatedAt:  new Date().toISOString(),
          };
          if (wasModeTest) console.log(`[webhook] Conversa ${conv.id} reaberta via Modo Teste - 24 h ignoradas`);
          conv = store.conversations[conv.id];
          console.log(`[webhook] Conversa ${conv.id} reaberta após 24 h → status="${newStatus}" (botInitiated=${wasBot}, hasBotActive=${hasBotActive})`);
        }

        broadcast('conversation_updated', { ...conv, messages: store.messages[conv.id] || [] });
        save();

      } else {
        // ── Nenhuma conversa anterior: cria nova ──
        const hasBotActive = selectBot(store.chatbots, channelId) !== null;
        conv = {
          id:           `conv_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
          contactId:    phone,
          contact:      { id: phone, name: pushName, phone, jid },
          channelId,
          instanceName: instance,
          status:       hasBotActive ? 'bot' : 'open',
          botInitiated: hasBotActive, // true = bot foi o primeiro a atender; false = foi operador
          assignedTo:   null,
          lastMessage:  null,
          unreadCount:  0,
          createdAt:    new Date().toISOString(),
          updatedAt:    new Date().toISOString(),
        };
        store.conversations[conv.id] = conv;
        store.messages[conv.id]      = [];
        broadcast('conversation_new', { ...conv, messages: [] });
        console.log(`[webhook] Nova conversa criada: ${conv.id}`);

        // Busca foto de perfil de forma assíncrona
        fetchProfilePicture(channel, jid || phone).then(avatarUrl => {
          if (!avatarUrl || !store.conversations[conv.id]) return;
          store.conversations[conv.id] = {
            ...store.conversations[conv.id],
            contact: { ...store.conversations[conv.id].contact, avatar: avatarUrl },
          };
          broadcast('conversation_updated', store.conversations[conv.id]);
          save();
          console.log(`[webhook] Avatar atualizado para ${phone}`);
        }).catch(() => {});
      }

    } else {
      console.log(`[webhook] Conversa existente: ${conv.id} status=${conv.status}`);
      // Atualiza jid caso tenha sido salvo sem ele
      if (!conv.contact.jid) {
        store.conversations[conv.id] = {
          ...store.conversations[conv.id],
          contact: { ...conv.contact, jid },
        };
        conv = store.conversations[conv.id];
      }
      // Busca avatar se ainda não tiver (lazy update)
      if (!conv.contact.avatar) {
        fetchProfilePicture(channel, jid || phone).then(avatarUrl => {
          if (!avatarUrl || !store.conversations[conv.id]) return;
          store.conversations[conv.id] = {
            ...store.conversations[conv.id],
            contact: { ...store.conversations[conv.id].contact, avatar: avatarUrl },
          };
          broadcast('conversation_updated', store.conversations[conv.id]);
          save();
          console.log(`[webhook] Avatar atualizado (lazy) para ${phone}`);
        }).catch(() => {});
      }
    }

    // ── Registra mensagem incoming ───────────────────────────────
    const inMsgType = mediaInfo ? mediaInfo.type : locInfo ? 'location' : 'text';
    const inMsg = {
      id:             `wpp_${key.id || Date.now()}`,
      conversationId: conv.id,
      content:        displayContent ?? effectiveInput, // nunca expõe base64 completo na UI
      type:           inMsgType,
      direction:      'incoming',
      status:         'delivered',
      timestamp:      new Date().toISOString(),
    };
    if (!store.messages[conv.id]) store.messages[conv.id] = [];
    store.messages[conv.id].push(inMsg);
    store.conversations[conv.id] = {
      ...store.conversations[conv.id],
      lastMessage: inMsg,
      updatedAt:   inMsg.timestamp,
      unreadCount: (store.conversations[conv.id].unreadCount || 0) + 1,
    };
    broadcast('message_new',         { conversationId: conv.id, message: inMsg });
    broadcast('conversation_updated', store.conversations[conv.id]);
    save();

    // ── Reabertura dentro de 24 h: bot não deve ser acionado ─────
    if (skipBot) {
      console.log(`[webhook] Reabertura dentro de 24 h - bot não acionado, conversa em atendimento.`);
      return;
    }

    // ── Verifica chatbot ─────────────────────────────────────────
    const bot = selectBot(store.chatbots, channelId);
    if (!bot) {
      console.log(`[webhook] Nenhum chatbot ativo/agendado para channelId=${channelId}. Chatbots: [${Object.keys(store.chatbots).join(', ')}]`);
      if (conv.status === 'bot') {
        store.conversations[conv.id] = { ...store.conversations[conv.id], status: 'open' };
        broadcast('conversation_updated', store.conversations[conv.id]);
        save();
      }
      return;
    }

    if (bot.status !== 'active') {
      console.log(`[webhook] Chatbot "${bot.name}" não está ativo (status=${bot.status}). Conversa vai para operador.`);
      if (conv.status === 'bot') {
        store.conversations[conv.id] = { ...store.conversations[conv.id], status: 'open' };
        broadcast('conversation_updated', store.conversations[conv.id]);
        save();
      }
      return;
    }

    console.log(`[webhook] Chatbot ativo: "${bot.name}" (${bot.nodes?.length ?? 0} nós, ${bot.edges?.length ?? 0} arestas)`);

    // ── Bot só roda se a conversa estiver em modo "bot" E tiver sido iniciada pelo bot ──
    // Qualquer outro status (open, in_progress, resolved) = humano assumiu → silêncio.
    // Mesmo que status seja 'bot', conversas com botInitiated=false nunca são processadas
    // pelo bot (ex: operador vinculou bot ao canal depois da conversa já existir).
    const currentStatus  = store.conversations[conv.id]?.status;
    const isBotInitiated = store.conversations[conv.id]?.botInitiated !== false; // undefined → legado → permite
    if (currentStatus !== 'bot') {
      console.log(`[webhook] Conversa status="${currentStatus}" - bot não acionado, humano no controle.`);
      return;
    }
    if (!isBotInitiated) {
      // Corrige status: conversa humana que acabou em 'bot' por engano
      store.conversations[conv.id] = { ...store.conversations[conv.id], status: 'open' };
      broadcast('conversation_updated', store.conversations[conv.id]);
      save();
      console.log(`[webhook] Conversa ${conv.id} marcada como não-bot (botInitiated=false) - status corrigido para 'open'.`);
      return;
    }

    // ── Recupera ou cria sessão do bot ───────────────────────────
    let session = store.sessions[sessionKey];
    if (!session || session.ended) {
      session = {
        convId:       conv.id,
        channelId,
        instanceName: instance,
        phone,
        jid,          // JID canônico para envio (pode ser @lid)
        nodeId:       null,
        vars:         {},
        waitingFor:   null,
        timerExpiry:  null,
        retryCount:   0,
        choices:      {},
        ended:        false,
      };
      store.sessions[sessionKey] = session;
      console.log(`[webhook] Nova sessão criada: ${sessionKey}`);
    } else {
      console.log(`[webhook] Sessão existente: waitingFor=${session.waitingFor} nodeId=${session.nodeId} ended=${session.ended}`);
      // Garante que o jid está atualizado na sessão existente
      if (!session.jid) session.jid = jid;
    }

    // ── Debounce de input: combina mensagens enviadas em sequência ─────────────
    // Só ativa quando o bot está aguardando input de texto livre (não choice,
    // media ou location - nesses casos a primeira resposta já é definitiva).
    // Imagens (base64) também NÃO entram no buffer - são processadas imediatamente.
    const isMediaInput = effectiveInput.startsWith('data:') || !!mediaInfo;
    if (session.waitingFor === 'input' && !isMediaInput) {
      const bufKey = sessionKey; // "phone:channelId"
      let buf = inputBuffers.get(bufKey);
      if (!buf) {
        buf = { messages: [] };
        inputBuffers.set(bufKey, buf);
      }
      buf.messages.push(effectiveInput);

      // Reseta o timer a cada nova mensagem recebida
      if (buf.timer) clearTimeout(buf.timer);
      buf.timer = setTimeout(async () => {
        inputBuffers.delete(bufKey);
        const combined = buf.messages.join('\n');
        if (buf.messages.length > 1) {
          console.log(`[webhook] Debounce: ${buf.messages.length} msgs combinadas para ${bufKey} → "${combined.substring(0, 120)}"`);
        }
        try {
          // Relê session e bot do store para garantir estado mais recente
          const s = store.sessions[bufKey];
          const b = selectBot(store.chatbots, channelId);
          if (s && !s.ended && b) {
            await runFlow(s, b, combined);
            save();
          }
        } catch (e) {
          console.error('[webhook] Erro no debounce de input:', e.message);
        }
      }, INPUT_DEBOUNCE_MS);

      return; // aguarda o debounce disparar
    }

    // Para todos os outros casos (novo fluxo, choice, media, location, timer…)
    // processa imediatamente como antes.
    await runFlow(session, bot, effectiveInput);
    save();

  } catch (err) {
    console.error('[webhook] ERRO:', err.message);
    console.error(err.stack);
  }
}

// ─── Extração de texto de múltiplos tipos de mensagem ─────────────────────────
function extractText(msg, data) {
  if (msg.conversation)                       return msg.conversation;
  if (msg.extendedTextMessage?.text)          return msg.extendedTextMessage.text;
  if (msg.buttonsResponseMessage?.selectedDisplayText)
    return msg.buttonsResponseMessage.selectedDisplayText;
  if (msg.listResponseMessage?.title)         return msg.listResponseMessage.title;
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId)
    return msg.listResponseMessage.singleSelectReply.selectedRowId;
  if (msg.templateButtonReplyMessage?.selectedDisplayText)
    return msg.templateButtonReplyMessage.selectedDisplayText;
  // Nota: imageMessage.caption NÃO é extraído aqui - a caption segue junto com
  // a mídia em extractMedia() para que a IA receba imagem + texto juntos.
  if (msg.documentMessage?.caption)           return msg.documentMessage.caption;
  if (data.body)                              return data.body;
  return null;
}

// ─── Extração de mídia (imagem, áudio, vídeo, documento) ──────────────────────
function extractMedia(msg, data) {
  // Prioridade: URL direta da Evolution API
  const mediaUrl = data.mediaUrl || data.media || null;

  // A Evolution API pode enviar base64 direto no payload (quando webhookBase64=true)
  const rawBase64 = data.base64 || null;

  // Strips codec params: "audio/ogg; codecs=opus" → "audio/ogg"
  const cleanMime     = (mime) => (mime || 'application/octet-stream').split(';')[0].trim();
  const makeBase64url = (mime, b64) =>
    b64 ? `data:${cleanMime(mime)};base64,${b64}` : null;

  if (msg.imageMessage) {
    const mime = msg.imageMessage.mimetype || 'image/jpeg';
    return { type: 'image', url: mediaUrl || msg.imageMessage.url || null,
             base64url: makeBase64url(mime, rawBase64), mimetype: mime,
             caption: msg.imageMessage.caption || null };
  }
  if (msg.audioMessage || msg.pttMessage) {
    const m    = msg.audioMessage || msg.pttMessage;
    const mime = m.mimetype || 'audio/ogg';
    return { type: 'audio', url: mediaUrl || m.url || null,
             base64url: makeBase64url(mime, rawBase64), mimetype: mime };
  }
  if (msg.videoMessage) {
    const mime = msg.videoMessage.mimetype || 'video/mp4';
    return { type: 'video', url: mediaUrl || msg.videoMessage.url || null,
             base64url: makeBase64url(mime, rawBase64), mimetype: mime };
  }
  if (msg.documentMessage) {
    const mime = msg.documentMessage.mimetype || 'application/octet-stream';
    return { type: 'document', url: mediaUrl || msg.documentMessage.url || null,
             base64url: makeBase64url(mime, rawBase64), mimetype: mime,
             filename: msg.documentMessage.fileName };
  }
  if (msg.stickerMessage) {
    return { type: 'image', url: mediaUrl || msg.stickerMessage.url || null,
             base64url: makeBase64url('image/webp', rawBase64), mimetype: 'image/webp' };
  }
  return null;
}

// ─── Extração de localização ──────────────────────────────────────────────────
function extractLocation(msg) {
  const loc = msg.locationMessage;
  if (!loc) return null;
  const lat  = loc.degreesLatitude  ?? loc.lat ?? null;
  const lng  = loc.degreesLongitude ?? loc.lng ?? null;
  if (lat === null || lng === null) return null;
  return {
    lat,
    lng,
    name: loc.name || loc.address || '',
    text: `${lat},${lng}${loc.name ? ` (${loc.name})` : ''}`,
  };
}
