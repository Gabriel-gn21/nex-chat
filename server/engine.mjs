/**
 * engine.mjs - Motor de execução de fluxos de chatbot
 *
 * Sessão:
 *   convId       - id da conversa
 *   channelId    - id do canal
 *   instanceName - nome da instância Evolution
 *   phone        - número do contato (dígitos)
 *   jid          - JID canônico (@s.whatsapp.net ou @lid)
 *   nodeId       - nó atual
 *   vars         - variáveis coletadas
 *   waitingFor   - 'input' | 'choice' | 'media' | 'location' | 'suspend' | null
 *   retryCount   - tentativas de validação no nó atual
 *   choices      - mapa para botões/menu
 *   ended        - fluxo encerrado
 */

import { store, save } from './store.mjs';
import { sendText, sendButtons, sendMenu, sendMedia, sendImageBase64 } from './evolution.mjs';
import { broadcast } from './index.mjs';

// ─── Fila de execução por sessão ──────────────────────────────────────────────
// Impede execução paralela do mesmo contato (evita duplicatas), mas em vez de
// descartar inputs concorrentes, os enfileira para processamento em série.
// Estrutura: lockKey → { running: bool, queue: [{ session, userInput }] }
const flowQueues = new Map();

// ─── Validadores ──────────────────────────────────────────────────────────────
const VALIDATORS = {
  input_number:   (v) => /^-?\d+([.,]\d+)?$/.test(v.trim()),
  input_email:    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  input_phone:    (v) => /^\+?[\d\s\-().]{7,20}$/.test(v.trim()),
  input_link:     (v) => /^https?:\/\/.+/.test(v.trim()),
  input_date:     (v) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v.trim()),
  input_cpf:      (v) => validateCPF(v),
  input_rg:       (v) => /^\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]$/.test(v.replace(/\s/g, '')),
  input_cpf_cnpj: (v) => validateCPF(v) || validateCNPJ(v),
  input_custom:   (v, d) => {
    if (!d.validationRegex) return true;
    try { return new RegExp(d.validationRegex).test(v.trim()); } catch { return true; }
  },
};

function validateCPF(v) {
  const n = v.replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +n[i] * (10 - i);
  let r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== +n[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +n[i] * (11 - i);
  r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  return r === +n[10];
}

function validateCNPJ(v) {
  const n = v.replace(/\D/g, '');
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
  const calc = (s, len) => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += +s[len - i] * pos--;
      if (pos < 2) pos = 9;
    }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11);
  };
  return calc(n, 12) === +n[12] && calc(n, 13) === +n[13];
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function applyDelay(d) {
  const secs = Number(d.delaySeconds) || 0;
  if (secs > 0) {
    console.log(`[engine] Delay de ${secs}s antes de enviar...`);
    await sleep(secs * 1000);
  }
}

function interpolate(text, vars) {
  if (!text) return '';
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function addMessage(convId, msg) {
  if (!store.messages[convId]) store.messages[convId] = [];
  store.messages[convId].push(msg);
  const conv = store.conversations[convId];
  if (conv) {
    store.conversations[convId] = {
      ...conv,
      lastMessage: msg,
      updatedAt:   msg.timestamp,
      unreadCount: (conv.unreadCount || 0) + (msg.direction === 'incoming' ? 1 : 0),
    };
  }
  broadcast('message_new',         { conversationId: convId, message: msg });
  broadcast('conversation_updated', store.conversations[convId]);
  save();
}

function makeOutgoingMsg(convId, content, type = 'text') {
  return {
    id:             `srv_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    conversationId: convId,
    content,
    type,
    direction:      'outgoing',
    status:         'sent',
    timestamp:      new Date().toISOString(),
  };
}

// ─── Helper: normaliza URL de imagem para download direto ────────────────────
// Converte links de compartilhamento (Google Drive, Dropbox, etc.) para URLs
// que retornam o binário da imagem diretamente, sem página HTML intermediária.
function normalizeImageUrl(url) {
  // Google Drive - /file/d/FILE_ID/view → uc?export=download&id=FILE_ID
  const gdrive = url.match(/drive\.google\.com\/file\/d\/([^/?\s]+)/);
  if (gdrive) {
    return `https://drive.google.com/uc?export=download&id=${gdrive[1]}`;
  }
  // Dropbox - ?dl=0 → ?dl=1  (força download direto)
  if (url.includes('dropbox.com') && url.includes('dl=0')) {
    return url.replace('dl=0', 'dl=1');
  }
  return url;
}

// ─── Helper: baixa imagem como base64, com normalização de URL ───────────────
async function fetchImageAsBase64(rawUrl) {
  const url = normalizeImageUrl(rawUrl);
  if (url !== rawUrl) {
    console.log(`[engine] URL normalizada: ${url.substring(0, 80)}`);
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NexChat/1.0)',
      'Accept':     'image/*,*/*',
    },
    signal:   AbortSignal.timeout(15000),
    redirect: 'follow',
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') || '';
  const mime        = contentType.split(';')[0].trim();

  // Rejeita HTML - indica que a URL retornou uma página web, não a imagem
  if (mime === 'text/html' || mime === 'text/plain') {
    throw new Error(`URL retornou ${mime} em vez de imagem - verifique o link (use link direto, não de visualização)`);
  }

  const arrayBuf = await res.arrayBuffer();
  const b64      = Buffer.from(arrayBuf).toString('base64');
  const mimeOut  = mime.startsWith('image/') ? mime : 'image/jpeg';

  console.log(`[engine] Imagem baixada OK: ${mimeOut} ${Math.round(arrayBuf.byteLength / 1024)} KB`);
  return { b64, mime: mimeOut };
}

// ─── Executor principal ───────────────────────────────────────────────────────

export async function runFlow(session, bot, userInput = null) {
  const channel = store.channels[session.instanceName];
  if (!channel) {
    console.warn(`[engine] Canal não encontrado para instanceName="${session.instanceName}".`);
    return;
  }
  if (!bot.nodes || bot.nodes.length === 0) {
    console.warn('[engine] Bot sem nós.');
    return;
  }

  // ── Fila anti-concorrência ────────────────────────────────────────────────
  // Chave única por contato + canal.
  const lockKey = `${session.phone}:${session.channelId}`;
  if (!flowQueues.has(lockKey)) flowQueues.set(lockKey, { running: false, queue: [] });
  const entry = flowQueues.get(lockKey);

  if (entry.running) {
    // Enfileira para processar assim que o flow atual terminar
    console.log(`[engine] Flow em execução para ${lockKey} - input enfileirado: "${userInput?.slice(0,40)}"`);
    entry.queue.push({ session, bot, userInput });
    return;
  }
  entry.running = true;

  try {

  const nodesById = Object.fromEntries(bot.nodes.map(n => [n.id, n]));
  const to        = session.jid || session.phone;

  const nextNode = (nodeId, handle = null) => {
    const edge = bot.edges.find(e =>
      e.source === nodeId && (handle ? e.sourceHandle === handle : true)
    );
    return edge ? nodesById[edge.target] : null;
  };

  // Guarda o último input do usuário na sessão (acessível durante executeNode)
  if (userInput !== null) session.lastInput = userInput;

  // ── Processar resposta do usuário em nó de espera ──────────────────────────
  if (userInput !== null && session.waitingFor) {
    const current = nodesById[session.nodeId];
    if (!current) {
      console.warn(`[engine] Nó de espera "${session.nodeId}" não encontrado. Resetando.`);
      session.waitingFor = null;
      return;
    }

    console.log(`[engine] Resposta para nó tipo="${current.type}" waitingFor="${session.waitingFor}": "${String(userInput).substring(0,80)}"`);

    // ── choice (send_buttons / send_menu) ─────────────────────────────────
    if (session.waitingFor === 'choice') {
      const inputLower = String(userInput).trim().toLowerCase();
      let handle = null;
      for (const [key, h] of Object.entries(session.choices || {})) {
        if (inputLower === key.toLowerCase() || inputLower === String(parseInt(key))) {
          handle = h; break;
        }
      }
      if (!handle) {
        try {
          await sendText(channel, to, '❌ Opção inválida. Por favor, escolha uma das opções listadas.');
        } catch (err) {
          console.error('[engine] Falha ao enviar mensagem de opção inválida:', err.message);
        }
        return;
      }
      session.waitingFor = null;
      session.choices    = {};
      const next = nextNode(current.id, handle);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      save();
      return;
    }

    // ── media / location ──────────────────────────────────────────────────
    if (session.waitingFor === 'media' || session.waitingFor === 'location') {
      const d = current.data || {};
      if (d.variable) session.vars[d.variable] = userInput;
      session.waitingFor = null;
      const next = nextNode(current.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      save();
      return;
    }

    // ── input (texto/número/email/etc) ────────────────────────────────────
    if (session.waitingFor === 'input') {
      const d        = current.data || {};
      const validate = VALIDATORS[current.type];
      const isValid  = !validate || validate(userInput, d);

      if (!isValid) {
        const maxRetries = d.maxRetries ?? 3;
        session.retryCount = (session.retryCount || 0) + 1;

        if (session.retryCount >= maxRetries) {
          // Esgotou tentativas - avança pelo caminho de erro (handle 'error') ou encerra
          console.log(`[engine] Máx. tentativas atingido (${maxRetries}). Avançando pelo caminho de erro.`);
          session.waitingFor = null;
          session.retryCount = 0;
          const nextErr = nextNode(current.id, 'error') ?? nextNode(current.id);
          if (nextErr) { session.nodeId = nextErr.id; await executeNode(nextErr, session, channel, nodesById, nextNode, bot); }
          else session.ended = true;
          save();
          return;
        }

        const errMsg = d.errorMessage || '❌ Valor inválido. Tente novamente.';
        try { await sendText(channel, to, errMsg); }
        catch (err) { console.error('[engine] Falha ao enviar erro de validação:', err.message); }
        return; // permanece no mesmo nó
      }

      // Válido
      session.retryCount = 0;
      if (d.variable) session.vars[d.variable] = userInput.trim();
      session.vars['_input'] = String(userInput ?? ''); // garante que {_input} esteja atualizado ao retomar
      session.waitingFor = null;
      const next = nextNode(current.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      save();
      return;
    }

    // ── timer (aguardando resposta com prazo) ─────────────────────────────
    if (session.waitingFor === 'timer') {
      const isTimeout = userInput === '__timeout__' || (session.timerExpiry && Date.now() >= session.timerExpiry);
      // Handles gerados pelo builder: 'true' = Respondeu, 'false' = Tempo esgotado
      const handle = isTimeout ? 'false' : 'true';
      session.waitingFor  = null;
      session.timerExpiry = null;
      // Se o cliente respondeu (não timeout), passa a mensagem adiante para que
      // um nó input_text seguinte possa capturá-la sem precisar esperar nova msg.
      if (!isTimeout && userInput !== null) {
        session._pendingInput = userInput;
      }
      console.log(`[engine] logic_timer: ${isTimeout ? 'tempo esgotado' : 'resposta recebida'} → handle="${handle}"`);
      const next = nextNode(current.id, handle);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      save();
      return;
    }

    // ── suspend - qualquer mensagem retoma o fluxo ─────────────────────────
    if (session.waitingFor === 'suspend') {
      session.waitingFor = null;
      const next = nextNode(current.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      save();
      return;
    }
  }

  // ── Executar a partir do nó atual (ou start) ──────────────────────────────
  let node = nodesById[session.nodeId];
  if (!node) {
    node = bot.nodes.find(n => n.type === 'start');
    if (!node) { console.error('[engine] Nó "start" não encontrado!'); return; }
    session.nodeId = node.id;
    console.log(`[engine] Iniciando fluxo pelo nó start: ${node.id}`);
  }

  await executeNode(node, session, channel, nodesById, nextNode, bot);
  save();

  } finally {
    // Libera o lock e processa próximo item da fila (se houver)
    entry.running = false;
    const next = entry.queue.shift();
    if (next) {
      // Pequeno delay para evitar stack overflow em rajadas longas
      setImmediate(() => runFlow(next.session, next.bot, next.userInput));
    } else {
      // Fila vazia - remove a entrada para não vazar memória
      flowQueues.delete(lockKey);
    }
  }
}

// ─── Execução de nó individual ────────────────────────────────────────────────

async function executeNode(node, session, channel, nodesById, nextNode, bot) {
  const d    = node.data || {};
  const vars = session.vars;
  const to   = session.jid || session.phone;

  // Torna a última mensagem do usuário acessível como {_input} em qualquer nó
  if (session.lastInput != null) vars['_input'] = session.lastInput;

  console.log(`[engine] Executando nó tipo="${node.type}" id="${node.id}"`);

  switch (node.type) {

    // ── SISTEMA ──────────────────────────────────────────────────────────────
    case 'start': {
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else console.warn('[engine] Nó start sem conexão de saída.');
      break;
    }

    // ── ENVIOS ───────────────────────────────────────────────────────────────
    case 'send_text': {
      await applyDelay(d);
      const text = interpolate(d.message || '', vars);
      if (!text.trim()) {
        console.warn('[engine] send_text: mensagem vazia.');
      } else {
        const msg = makeOutgoingMsg(session.convId, text);
        addMessage(session.convId, msg);
        try { await sendText(channel, to, text); }
        catch (err) { console.error(`[engine] ERRO send_text: ${err.message}`); }
      }
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      break;
    }

    case 'send_image':
    case 'send_audio':
    case 'send_video':
    case 'send_file': {
      await applyDelay(d);
      const mTypeMap = { send_image: 'image', send_audio: 'audio', send_video: 'video', send_file: 'document' };
      const mType    = mTypeMap[node.type];
      const url      = d.mediaUrl;
      const caption  = d.caption ? interpolate(d.caption, vars) : '';

      if (!url) {
        console.warn(`[engine] ${node.type}: URL de mídia não configurada.`);
      } else {
        const preview = caption || `[${mType}]`;
        const msg = makeOutgoingMsg(session.convId, preview, mType === 'document' ? 'document' : mType);
        addMessage(session.convId, msg);
        try { await sendMedia(channel, to, mType, url, caption); }
        catch (err) { console.error(`[engine] ERRO ${node.type}: ${err.message}`); }
      }
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      break;
    }

    case 'send_buttons': {
      await applyDelay(d);
      const title   = interpolate(d.message || '', vars);
      const buttons = (d.buttons || []).map((b, i) => ({ label: b.label, handle: `btn-${i}` }));
      if (buttons.length === 0) { console.warn('[engine] send_buttons: sem botões.'); break; }
      const msg = makeOutgoingMsg(session.convId, title + '\n\n' + buttons.map((b, i) => `${i+1}. ${b.label}`).join('\n'));
      addMessage(session.convId, msg);
      try { await sendButtons(channel, to, '', title, buttons); }
      catch (err) { console.error(`[engine] ERRO send_buttons: ${err.message}`); }
      session.nodeId     = node.id;
      session.waitingFor = 'choice';
      session.choices    = Object.fromEntries([
        ...buttons.map((b, i) => [String(i + 1), b.handle]),
        ...buttons.map(b => [b.label, b.handle]),
      ]);
      console.log(`[engine] Aguardando escolha: [${Object.keys(session.choices).join(', ')}]`);
      break;
    }

    case 'send_menu': {
      await applyDelay(d);
      const title = interpolate(d.message || '', vars);
      const items = (d.menuItems || []).map((it, i) => ({ label: it.label, handle: `item-${i}` }));
      if (items.length === 0) { console.warn('[engine] send_menu: sem itens.'); break; }
      const msg = makeOutgoingMsg(session.convId, title + '\n\n' + items.map((it, i) => `${i+1}. ${it.label}`).join('\n'));
      addMessage(session.convId, msg);
      try { await sendMenu(channel, to, '', title, items); }
      catch (err) { console.error(`[engine] ERRO send_menu: ${err.message}`); }
      session.nodeId     = node.id;
      session.waitingFor = 'choice';
      session.choices    = Object.fromEntries([
        ...items.map((it, i) => [String(i + 1), it.handle]),
        ...items.map(it => [it.label, it.handle]),
      ]);
      console.log(`[engine] Aguardando escolha de menu: [${Object.keys(session.choices).join(', ')}]`);
      break;
    }

    case 'send_action_buttons': {
      // Botões de ação: ligação ou link. O fluxo NÃO aguarda resposta.
      await applyDelay(d);
      const text    = interpolate(d.message || '', vars);
      const buttons = (d.actionButtons || []);
      const lines   = [text, ''];
      for (const btn of buttons) {
        const icon = btn.type === 'call' ? '📞' : '🔗';
        lines.push(`${icon} ${btn.label}: ${btn.value}`);
      }
      const content = lines.filter((l, i) => !(i === 0 && !l)).join('\n').trim();
      if (content) {
        const msg = makeOutgoingMsg(session.convId, content);
        addMessage(session.convId, msg);
        try { await sendText(channel, to, content); }
        catch (err) { console.error(`[engine] ERRO send_action_buttons: ${err.message}`); }
      }
      // Avança imediatamente - sem waitingFor
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      break;
    }

    case 'send_list_buttons': {
      // Lista com descrições - funciona como send_menu (aguarda escolha)
      await applyDelay(d);
      const title = interpolate(d.message || '', vars);
      const items = (d.menuItems || []).map((it, i) => ({
        label:       it.label,
        description: it.description || '',
        handle:      `item-${i}`,
      }));
      if (items.length === 0) { console.warn('[engine] send_list_buttons: sem itens.'); break; }

      // Formata como lista com descrições
      const lines = [title, ''];
      items.forEach((it, i) => {
        lines.push(`${i + 1}. *${it.label}*${it.description ? `\n   ${it.description}` : ''}`);
      });
      const content = lines.join('\n');
      const msg = makeOutgoingMsg(session.convId, content);
      addMessage(session.convId, msg);
      try { await sendText(channel, to, content); }
      catch (err) { console.error(`[engine] ERRO send_list_buttons: ${err.message}`); }

      session.nodeId     = node.id;
      session.waitingFor = 'choice';
      session.choices    = Object.fromEntries([
        ...items.map((it, i) => [String(i + 1), it.handle]),
        ...items.map(it => [it.label, it.handle]),
      ]);
      console.log(`[engine] send_list_buttons: aguardando escolha [${Object.keys(session.choices).join(', ')}]`);
      break;
    }

    // ── ENTRADAS de texto ─────────────────────────────────────────────────────
    case 'input_text':
    case 'input_number':
    case 'input_email':
    case 'input_phone':
    case 'input_cpf':
    case 'input_rg':
    case 'input_cpf_cnpj':
    case 'input_date':
    case 'input_link':
    case 'input_custom': {
      // Se existe um input pendente (ex: mensagem que já acionou o timer)
      // captura-o imediatamente sem precisar esperar nova mensagem do cliente.
      if (session._pendingInput !== undefined) {
        const pending = session._pendingInput;
        delete session._pendingInput;
        const validate = VALIDATORS[node.type];
        const isValid  = !validate || validate(pending, d);
        if (isValid) {
          if (d.variable) session.vars[d.variable] = pending.trim();
          console.log(`[engine] input "${node.type}" consumiu pendingInput → var="${d.variable ?? ' - '}"="${pending.substring(0,60)}"`);
          const next = nextNode(node.id);
          if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
          else session.ended = true;
        } else {
          // Valor inválido - trata como se o campo ficasse em espera normalmente
          if (d.message) {
            const prompt = interpolate(d.message, vars);
            const msg    = makeOutgoingMsg(session.convId, prompt);
            addMessage(session.convId, msg);
            try { await sendText(channel, to, prompt); } catch { /* ignora */ }
          }
          session.nodeId     = node.id;
          session.waitingFor = 'input';
          session.retryCount = 0;
        }
        break;
      }
      if (d.message) {
        const prompt = interpolate(d.message, vars);
        const msg    = makeOutgoingMsg(session.convId, prompt);
        addMessage(session.convId, msg);
        try { await sendText(channel, to, prompt); }
        catch (err) { console.error(`[engine] ERRO ao enviar prompt input: ${err.message}`); }
      }
      session.nodeId     = node.id;
      session.waitingFor = 'input';
      session.retryCount = 0;
      console.log(`[engine] Aguardando input "${node.type}" → var="${d.variable ?? ' - '}"`);
      break;
    }

    // ── ENTRADAS de mídia ─────────────────────────────────────────────────────
    case 'input_image':
    case 'input_audio':
    case 'input_video':
    case 'input_file': {
      if (d.message) {
        const prompt = interpolate(d.message, vars);
        const msg    = makeOutgoingMsg(session.convId, prompt);
        addMessage(session.convId, msg);
        try { await sendText(channel, to, prompt); }
        catch (err) { console.error(`[engine] ERRO ao enviar prompt mídia: ${err.message}`); }
      }
      session.nodeId     = node.id;
      session.waitingFor = 'media';
      console.log(`[engine] Aguardando mídia "${node.type}" → var="${d.variable ?? ' - '}"`);
      break;
    }

    case 'input_location': {
      if (d.message) {
        const prompt = interpolate(d.message, vars);
        const msg    = makeOutgoingMsg(session.convId, prompt);
        addMessage(session.convId, msg);
        try { await sendText(channel, to, prompt); }
        catch (err) { console.error(`[engine] ERRO ao enviar prompt localização: ${err.message}`); }
      }
      session.nodeId     = node.id;
      session.waitingFor = 'location';
      console.log(`[engine] Aguardando localização → var="${d.variable ?? ' - '}"`);
      break;
    }

    // ── INTEGRAÇÕES ───────────────────────────────────────────────────────────
    case 'integration_api': {
      const api = d.apiCall;
      if (!api?.url) {
        console.warn('[engine] integration_api: sem URL configurada.');
      } else {
        const reqUrl  = interpolate(api.url, vars);
        const headers = { 'Content-Type': 'application/json' };
        for (const { key, value } of (api.headers || [])) {
          if (key) headers[interpolate(key, vars)] = interpolate(value, vars);
        }
        const reqBody = ['POST','PUT','PATCH'].includes(api.method)
          ? interpolate(api.body || '{}', vars)
          : undefined;
        try {
          console.log(`[engine] integration_api: ${api.method} ${reqUrl}`);
          const res  = await fetch(reqUrl, { method: api.method, headers, body: reqBody, signal: AbortSignal.timeout(15000) });
          const text = await res.text();
          if (api.responseVar) {
            try { session.vars[api.responseVar] = JSON.parse(text); }
            catch { session.vars[api.responseVar] = text; }
            console.log(`[engine] integration_api: resposta salva em "${api.responseVar}"`);
          }
        } catch (err) {
          console.error(`[engine] integration_api ERRO: ${err.message}`);
          if (api.responseVar) session.vars[api.responseVar] = null;
        }
      }
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      break;
    }

    case 'integration_webhook': {
      // Envia dados para servidor externo (fire-and-forget)
      const url = d.webhookUrl ? interpolate(d.webhookUrl, vars) : null;
      if (!url) {
        console.warn('[engine] integration_webhook: URL não configurada.');
      } else {
        const method  = d.webhookMethod || 'POST';
        const rawBody = d.webhookBody   ? interpolate(d.webhookBody, vars) : JSON.stringify(vars);
        console.log(`[engine] integration_webhook: ${method} ${url}`);
        // Fire-and-forget: não bloqueia o fluxo
        fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body:    ['POST','PUT','PATCH'].includes(method) ? rawBody : undefined,
          signal:  AbortSignal.timeout(10000),
        }).then(r => console.log(`[engine] integration_webhook: resposta ${r.status}`))
          .catch(err => console.error(`[engine] integration_webhook ERRO: ${err.message}`));
      }
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      break;
    }

    case 'integration_ai': {
      const prov      = d.aiProvider ?? 'openai';
      const userInput = interpolate(d.aiUserMessage || '', vars);
      const maxTurns  = Number(d.aiMemoryTurns ?? 5);

      // ── Monta system prompt com bases de conhecimento ────────────────────
      let sysBase = interpolate(d.aiSystemPrompt || 'Você é um assistente útil.', vars);

      // ── Injeta data/hora atual de Brasília (UTC-3) no system prompt ───────
      // Permite que a IA saiba o horário atual para validar expediente, etc.
      if (d.aiInjectDatetime !== false) {
        const dias = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
        const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const diaSemana = dias[agora.getDay()];
        const hora      = String(agora.getHours()).padStart(2, '0');
        const minuto    = String(agora.getMinutes()).padStart(2, '0');
        const dia       = String(agora.getDate()).padStart(2, '0');
        const mes       = String(agora.getMonth() + 1).padStart(2, '0');
        const ano       = agora.getFullYear();
        sysBase = `[HORÁRIO ATUAL]: ${diaSemana}, ${dia}/${mes}/${ano}, ${hora}:${minuto} (horário de Brasília)\n\n${sysBase}`;
      }

      const kbIds = Array.isArray(d.aiKnowledgeBaseIds) ? d.aiKnowledgeBaseIds : [];
      if (kbIds.length > 0) {
        const kbSections = kbIds
          .map(id => store.knowledgeBases[id])
          .filter(Boolean)
          .map(kb => `### ${kb.name}\n${kb.content}`)
          .join('\n\n---\n\n');
        if (kbSections) {
          sysBase = `${sysBase}\n\n## Base de Conhecimento\nConsulte as informações abaixo antes de responder. Priorize o conteúdo da base; se a pergunta não estiver coberta, responda com base no seu conhecimento geral.\n\n${kbSections}`;
        }
      }

      // ── Histórico de memória ─────────────────────────────────────────────
      if (!session.history) session.history = [];
      // Mantém apenas os últimos N pares (user + assistant) na memória
      const recentHistory = maxTurns > 0
        ? session.history.slice(-(maxTurns * 2))
        : [];

      // ── Detecção de áudio no input (data URL) ─────────────────────────────
      // Regex permissiva que aceita qualquer MIME type limpo (ex: "audio/ogg")
      const AUDIO_DATA_URL_RE = /^data:(audio\/[^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/;
      const audioMatch = userInput.match(AUDIO_DATA_URL_RE);

      // ── Transcrição via Whisper (OpenAI) ────────────────────────────────────
      // Usada quando o input é áudio e o provedor não processa áudio nativamente.
      // Converte base64 → Buffer → FormData → POST Whisper API → texto transcrito.
      async function transcribeWithWhisper(apiKey, mimeType, b64Data) {
        try {
          const audioBuffer = Buffer.from(b64Data.replace(/\s/g, ''), 'base64');
          const ext         = mimeType.split('/')[1] || 'ogg';
          const blob        = new Blob([audioBuffer], { type: mimeType });
          const form        = new FormData();
          form.append('file', blob, `audio.${ext}`);
          form.append('model', 'whisper-1');
          form.append('language', 'pt');
          const res  = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` },
            body: form, signal: AbortSignal.timeout(30000),
          });
          const json = await res.json();
          if (json.error) { console.warn('[engine] Whisper erro:', json.error.message); return null; }
          console.log(`[engine] Whisper transcreveu: "${(json.text || '').substring(0, 80)}"`);
          return json.text || null;
        } catch (err) {
          console.warn('[engine] Whisper falhou:', err.message);
          return null;
        }
      }

      let aiReply = null;
      try {
        if (prov === 'openai') {
          // Se o input é áudio, transcreve com Whisper antes de enviar ao GPT
          let textInput = userInput;
          if (audioMatch) {
            const [, mimeType, b64Data] = audioMatch;
            console.log(`[engine] OpenAI: áudio detectado (${mimeType}) - transcrevendo com Whisper…`);
            const transcription = await transcribeWithWhisper(d.aiApiKey, mimeType, b64Data);
            textInput = transcription ?? '[áudio não transcrito]';
          }
          const messages = [
            { role: 'system', content: sysBase },
            ...recentHistory,
            { role: 'user', content: textInput },
          ];
          const res  = await fetch('https://api.openai.com/v1/chat/completions', {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${d.aiApiKey}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model: d.aiModel || 'gpt-4o-mini', messages }),
            signal:  AbortSignal.timeout(30000),
          });
          const json = await res.json();
          aiReply = json.choices?.[0]?.message?.content ?? null;

        } else if (prov === 'anthropic') {
          // Anthropic não tem Whisper próprio - usa a chave Whisper configurada
          // (d.whisperApiKey) se disponível, caso contrário marca como não transcrito.
          let textInput = userInput;
          if (audioMatch) {
            const [, mimeType, b64Data] = audioMatch;
            const whisperKey = d.whisperApiKey || null;
            if (whisperKey) {
              console.log(`[engine] Anthropic: áudio detectado - transcrevendo com Whisper…`);
              const transcription = await transcribeWithWhisper(whisperKey, mimeType, b64Data);
              textInput = transcription ?? '[áudio não transcrito]';
            } else {
              console.warn('[engine] Anthropic: áudio recebido mas nenhuma Whisper API Key configurada.');
              textInput = '[O cliente enviou um áudio. Configure uma Whisper API Key no nó de IA para transcrever automaticamente.]';
            }
          }
          const messages = [
            ...recentHistory,
            { role: 'user', content: textInput },
          ];
          const res  = await fetch('https://api.anthropic.com/v1/messages', {
            method:  'POST',
            headers: { 'x-api-key': d.aiApiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model: d.aiModel || 'claude-haiku-4-5', max_tokens: 1024, system: sysBase, messages }),
            signal:  AbortSignal.timeout(30000),
          });
          const json = await res.json();
          aiReply = json.content?.[0]?.text ?? null;

        } else if (prov === 'gemini') {
          const model = d.aiModel || 'gemini-2.5-flash';

          // ── Detecção de mídia (áudio, imagem, vídeo) via data URL ─────────
          // Formato: data:<mimeType>;base64,<dados>
          // Regex permissiva: aceita qualquer MIME type (incluindo "audio/ogg")
          const DATA_URL_RE = /data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)/;
          const mediaMatch  = userInput.match(DATA_URL_RE);

          let userParts;
          let historyLabel; // o que salvar no histórico (nunca o base64 completo)

          if (mediaMatch) {
            const [fullMatch, mimeType, b64Data] = mediaMatch;
            const textBefore = userInput.slice(0, mediaMatch.index).trim();
            const textAfter  = userInput.slice(mediaMatch.index + fullMatch.length).trim();
            const textParts  = [textBefore, textAfter].filter(Boolean);

            userParts = [
              { inline_data: { mime_type: mimeType, data: b64Data } },
              ...textParts.map(t => ({ text: t })),
            ];
            // Se não veio nenhum texto de contexto, injeta instrução padrão
            if (textParts.length === 0) {
              userParts.push({ text: 'Processe a mídia acima conforme suas instruções.' });
            }

            const mediaKind = mimeType.startsWith('audio') ? 'áudio'
                            : mimeType.startsWith('image') ? 'imagem'
                            : mimeType.startsWith('video') ? 'vídeo'
                            : 'mídia';
            historyLabel = `[${mediaKind}]${textParts.length ? ' ' + textParts.join(' ') : ''}`;
            console.log(`[engine] Gemini multimodal: ${mimeType} (${Math.round(b64Data.length * 0.75 / 1024)} KB)`);
          } else {
            userParts    = [{ text: userInput }];
            historyLabel = userInput;
          }

          // ── Nominatim: completa endereço incompleto antes de chamar a IA ───
          // Ativado com aiAddressLookup: true no nó. Extrai endereço do input,
          // consulta OpenStreetMap e injeta bairro/cidade no system prompt
          // para que a IA confirme com o cliente em vez de perguntar.
          let nominatimContext = '';
          if (d.aiAddressLookup && userInput) {
            try {
              // 1. Extrai endereço do input (formato OlaClick ou texto livre)
              const olaField    = userInput.match(/endere[çc]o[:\s*]+([^\n*•]+)/i)?.[1]?.trim().replace(/#/g, 'n.');
              const streetFree  = userInput.match(/\b(rua|av(?:enida)?\.?|r\.\s|travessa|estrada|rodovia|alameda|pra[çc]a|largo|beco)\s+[^\n,*•]{2,}(?:[,\s]+n?[º°.]?\s*\d+[^\n,*•]*)?/i)?.[0]?.trim();
              const rawAddr     = olaField || streetFree || '';

              if (rawAddr) {
                // 2. Verifica se já tem bairro/cidade - se tiver, não precisa buscar
                const jaCompleto = /\b(bairro|jd\.?|jardim|vila\b|vl\.?|centro\b|parque\b|district|suburb)\b/i.test(rawAddr)
                                && /\b(sp|rj|mg|pr|rs|ba|ce|go|pe|sc|es|am|df|suzano|mogi|guarulhos|campinas|s[ãa]o paulo|osasco)\b/i.test(rawAddr);

                if (!jaCompleto) {
                  console.log(`[engine] Nominatim: buscando endereço incompleto: "${rawAddr}"`);
                  // Busca biased para Alto Tietê/SP:
                  // - query inclui ", SP" para priorizar São Paulo
                  // - viewbox cobre a região do Alto Tietê (Mogi, Suzano, Itaquá, Poá, Ferraz...)
                  // - bounded=0 → prefere a região mas não restringe (fallback para SP se não achar)
                  const q    = encodeURIComponent(rawAddr + ', SP, Brasil');
                  const viewbox = '-46.70,-23.20,-45.80,-23.80'; // Alto Tietê bounding box
                  const nRes = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=br&addressdetails=1&viewbox=${viewbox}&bounded=0`,
                    { headers: { 'User-Agent': 'NexChat/1.0 (chatbot-address-lookup)' }, signal: AbortSignal.timeout(7000) }
                  );
                  if (nRes.ok) {
                    const [hit] = await nRes.json();
                    if (hit) {
                      const a      = hit.address || {};
                      const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.residential || '';
                      const cidade = a.city || a.town || a.municipality || a.village || '';
                      const estado = a.state_code || a.ISO3166_2_lvl4?.split('-')[1] || '';
                      // Monta display limpo (máx 6 partes do display_name)
                      const display = hit.display_name.split(',').slice(0, 6).join(',').trim();

                      if (bairro || cidade) {
                        console.log(`[engine] Nominatim encontrou: bairro="${bairro}" cidade="${cidade}/${estado}"`);
                        nominatimContext = [
                          '',
                          '',
                          '[BUSCA AUTOMÁTICA DE ENDEREÇO]',
                          `O endereço informado pelo cliente ("${rawAddr}") foi localizado automaticamente:`,
                          `• Bairro: ${bairro || '(não identificado)'}`,
                          `• Cidade: ${cidade}${estado ? '/' + estado : ''}`,
                          `• Endereço completo encontrado: ${display}`,
                          '',
                          'INSTRUÇÃO OBRIGATÓRIA: Apresente esse endereço completo ao cliente e pergunte se está correto.',
                          'NÃO peça bairro ou cidade ao cliente - você já tem essa informação.',
                          'Aguarde a confirmação antes de prosseguir com o pedido.',
                        ].join('\n');
                      } else {
                        console.log('[engine] Nominatim: resultado sem bairro/cidade útil, ignorado');
                      }
                    } else {
                      console.log('[engine] Nominatim: nenhum resultado encontrado para o endereço');
                    }
                  }
                } else {
                  console.log(`[engine] Nominatim: endereço já parece completo, pulando busca`);
                }
              }
            } catch (nomErr) {
              console.warn('[engine] Nominatim erro:', nomErr.message);
            }
          }

          // Injeta contexto do Nominatim no system prompt (apenas para esta chamada)
          const sysEffective = sysBase + nominatimContext;

          // Gemini usa role 'model' em vez de 'assistant'
          const contents = [
            ...recentHistory.map(m => ({
              role:  m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
            { role: 'user', parts: userParts },
          ];

          const body = { system_instruction: { parts: [{ text: sysEffective }] }, contents };

          // Habilita Google Search Grounding se configurado no nó
          if (d.aiWebSearch) {
            body.tools = [{ google_search: {} }];
            console.log('[engine] Gemini: Google Search Grounding ativado');
          }

          const res  = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${d.aiApiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) }
          );
          const json = await res.json();
          if (json.error) {
            console.error(`[engine] Gemini erro: ${json.error.message}`);
          } else {
            // Extrai texto - pode vir de parts com texto ou de parts com thought (thinking models)
            const parts = json.candidates?.[0]?.content?.parts ?? [];
            aiReply = parts.find(p => p.text && !p.thought)?.text
                   ?? parts.find(p => p.text)?.text
                   ?? null;
            if (d.aiWebSearch && json.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length) {
              console.log('[engine] Gemini Search queries:', json.candidates[0].groundingMetadata.webSearchQueries.join(', '));
            }
          }

          // Salva label legível no histórico (não o base64)
          if (aiReply && maxTurns > 0) {
            session.history.push({ role: 'user',      content: historyLabel });
            session.history.push({ role: 'assistant', content: aiReply      });
            if (session.history.length > maxTurns * 2 + 10) {
              session.history = session.history.slice(-(maxTurns * 2));
            }
          }
        } else {
          console.warn(`[engine] integration_ai: provedor "${prov}" não suportado.`);
        }
      } catch (err) {
        console.error(`[engine] integration_ai ERRO: ${err.message}`);
      }

      if (aiReply) {
        // Atualiza histórico de memória (Gemini já fez isso acima com label legível)
        if (maxTurns > 0 && prov !== 'gemini') {
          session.history.push({ role: 'user',      content: userInput });
          session.history.push({ role: 'assistant', content: aiReply  });
          // Garante que o histórico não cresça indefinidamente
          if (session.history.length > maxTurns * 2 + 10) {
            session.history = session.history.slice(-(maxTurns * 2));
          }
        }
        if (d.variable) session.vars[d.variable] = aiReply;
        // aiSilent: salva na variável mas NÃO envia ao usuário (ex: nó extrator interno)
        if (!d.aiSilent) {
          // ── Marcador [RESUMO_ENTREGA]...[/RESUMO_ENTREGA] ────────────────────
          // Bloco com dados estruturados do pedido (nome, endereço, complemento,
          // telefone). Extraído e salvo em vars.resumo_entrega para uso nos nós
          // de action_forward via interpolação {resumo_entrega}.
          const resumoMatch = aiReply.match(/\[RESUMO_ENTREGA\]([\s\S]*?)\[\/RESUMO_ENTREGA\]/i);
          if (resumoMatch) {
            vars.resumo_entrega = resumoMatch[1].trim();
            console.log(`[engine] [RESUMO_ENTREGA] Extraído:\n${vars.resumo_entrega}`);
          }

          // ── Marcador [PAGAMENTO:pix|cartao] ──────────────────────────────────
          // Emitido pelo agente na mensagem de confirmação para indicar a forma
          // de pagamento escolhida pelo cliente. Salvo em vars.mp_tipo_pagamento
          // e usado pelo nó integration_mercadopago para gerar PIX ou link de cartão.
          const pagamentoMatch = aiReply.match(/\[PAGAMENTO:(pix|cartao)\]/i);
          if (pagamentoMatch) {
            vars.mp_tipo_pagamento = pagamentoMatch[1].toLowerCase();
            Object.assign(session.vars, vars);
            console.log(`[engine] [PAGAMENTO] Tipo extraído: ${vars.mp_tipo_pagamento}`);
          }

          // ── Marcador [FOTO_PRODUTO:URL] - foto lida da base de conhecimento ──
          // A IA extrai a URL da foto do produto diretamente do texto da KB e a
          // inclui aqui. O engine envia a imagem com legenda de confirmação.
          const fotoProdutoRe = /\[FOTO_PRODUTO:(https?:\/\/[^\]\s]+)\]/gi;
          const fotoMatches   = [...aiReply.matchAll(fotoProdutoRe)];

          // ── Marcador [IMAGEM:nome] - biblioteca de imagens do nó ──
          // Usado para imagens genéricas (catálogos, banners, etc.) cadastradas
          // diretamente no nó AI - não vêm da base de conhecimento.
          const imageLib    = Array.isArray(d.imageLibrary) ? d.imageLibrary : [];
          const imgMarkerRe = /\[IMAGEM:([^\]]+)\]/gi;
          const imgMatches  = [...aiReply.matchAll(imgMarkerRe)];

          // Remove todos os marcadores internos antes de enviar o texto ao cliente
          const replyClean = aiReply
            .replace(/\[RESUMO_ENTREGA\][\s\S]*?\[\/RESUMO_ENTREGA\]/gi, '')
            .replace(fotoProdutoRe, '')
            .replace(imgMarkerRe, '')
            .replace(/\[ENCERRAR_CONVERSA\]/gi, '')
            .replace(/\[VALOR:[^\]]*\]/gi, '')
            .replace(/\[PAGAMENTO:[^\]]*\]/gi, '')
            .replace(/\[TRANSFERIR_ATENDENTE\]/gi, '')
            .replace(/\[PONTO_ENCONTRO\]/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          const msg = makeOutgoingMsg(session.convId, replyClean);
          addMessage(session.convId, msg);
          try { await sendText(channel, to, replyClean); }
          catch (err) { console.error(`[engine] ERRO ao enviar resposta IA: ${err.message}`); }

          // Envia foto do produto (da KB) com legenda de confirmação
          for (const match of fotoMatches) {
            const fotoUrl = match[1].trim();
            const caption = d.fotoProdutoCaption || 'Seria esse mesmo, certo?';
            console.log(`[engine] [FOTO_PRODUTO] Enviando: ${fotoUrl.substring(0, 80)}`);
            try {
              const { b64, mime } = await fetchImageAsBase64(fotoUrl);
              // Armazena o data URI no conteúdo da mensagem para que a UI consiga renderizar a imagem
              const fotoMsg = makeOutgoingMsg(session.convId, `data:${mime};base64,${b64}`, 'image');
              addMessage(session.convId, fotoMsg);
              await sendImageBase64(channel, to, b64, caption);
            } catch (err) {
              console.error(`[engine] [FOTO_PRODUTO] Falhou: ${err.message}`);
              // Fallback: armazena placeholder de erro na UI
              const errMsg = makeOutgoingMsg(session.convId, caption, 'image');
              addMessage(session.convId, errMsg);
            }
          }

          // Envia imagens da biblioteca do nó (uso geral - catálogos, banners etc.)
          for (const match of imgMatches) {
            const imgName  = match[1].trim().toLowerCase().replace(/\s+/g, '_');
            const imgEntry = imageLib.find(img =>
              img.name.trim().toLowerCase().replace(/\s+/g, '_') === imgName
            );
            if (imgEntry?.url) {
              console.log(`[engine] [IMAGEM] Enviando "${imgName}": ${imgEntry.url.substring(0, 60)}`);
              try {
                const { b64, mime } = await fetchImageAsBase64(imgEntry.url);
                const imgMsg = makeOutgoingMsg(session.convId, `data:${mime};base64,${b64}`, 'image');
                addMessage(session.convId, imgMsg);
                await sendImageBase64(channel, to, b64, imgEntry.caption || '');
              } catch (err) {
                console.error(`[engine] [IMAGEM:${imgName}] Falhou: ${err.message}`);
                const errMsg = makeOutgoingMsg(session.convId, imgEntry.caption || `[imagem: ${imgEntry.name}]`, 'image');
                addMessage(session.convId, errMsg);
              }
            } else {
              console.warn(`[engine] [IMAGEM:${imgName}] - não encontrada na biblioteca (${imageLib.length} cadastradas)`);
            }
          }
        }
      } else if (!d.aiSilent && d.aiFallbackMessage) {
        // IA falhou mas há mensagem de fallback configurada - envia ao usuário
        const fallback = interpolate(d.aiFallbackMessage, vars);
        const msg = makeOutgoingMsg(session.convId, fallback);
        addMessage(session.convId, msg);
        try { await sendText(channel, to, fallback); }
        catch (err) { console.error(`[engine] ERRO ao enviar fallback IA: ${err.message}`); }
      }

      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      break;
    }

    case 'integration_mercadopago': {
      // ── Geração de cobrança via Mercado Pago ─────────────────────────────
      // Roteia automaticamente entre PIX e link de checkout de cartão
      // com base na variável vars.mp_tipo_pagamento (extraída do marcador
      // [PAGAMENTO:pix|cartao] emitido pelo agente na confirmação do pedido).
      const mpToken       = d.mpAccessToken || '';
      const mpDesc        = interpolate(d.mpDescription || 'Pedido', vars);
      const mpExpMin      = Number(d.mpExpirationMinutes ?? 30);
      const mpPayerEmail  = interpolate(d.mpPayerEmail || 'cliente@loja.com', vars);

      // Extrai o valor: 1º tenta variável configurada, 2º parseia marcador [VALOR:XX] do ai_resposta
      let totalAmount = 0;
      if (d.mpTotalVariable && vars[d.mpTotalVariable]) {
        totalAmount = parseFloat(String(vars[d.mpTotalVariable]).replace(',', '.'));
      } else {
        const valorMatch = (vars['ai_resposta'] || '').match(/\[VALOR[:\s]*([\d]+(?:[.,][\d]{1,2})?)\]/i);
        if (valorMatch) totalAmount = parseFloat(valorMatch[1].replace(',', '.'));
      }

      // Lê a forma de pagamento escolhida pelo cliente (definida pelo marcador [PAGAMENTO:])
      const tipoPagamento = (vars['mp_tipo_pagamento'] || 'pix').toLowerCase();

      console.log(`[engine] integration_mercadopago: valor=R$${totalAmount} tipo="${tipoPagamento}" desc="${mpDesc}"`);

      if (!mpToken) {
        console.warn('[engine] integration_mercadopago: mpAccessToken não configurado');
      } else if (!totalAmount || totalAmount <= 0) {
        console.warn('[engine] integration_mercadopago: valor do pedido não encontrado em ai_resposta nem na variável configurada');
      } else {
        const valorFmt = totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const expiry   = new Date(Date.now() + mpExpMin * 60 * 1000).toISOString();

        const sendError = async (msg) => {
          const errMsg = msg || d.mpErrorMessage
            ? interpolate(d.mpErrorMessage || msg, vars)
            : '⚠️ Não foi possível gerar o pagamento agora. Um atendente vai te ajudar.';
          const em = makeOutgoingMsg(session.convId, errMsg);
          addMessage(session.convId, em);
          try { await sendText(channel, to, errMsg); } catch {}
        };

        try {
          if (tipoPagamento === 'cartao') {
            // ── Link de checkout (cartão de crédito) via Checkout Preferences ──
            const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${mpToken}`,
                'Content-Type':  'application/json',
              },
              body: JSON.stringify({
                items: [{
                  title:      mpDesc,
                  quantity:   1,
                  unit_price: totalAmount,
                  currency_id: 'BRL',
                }],
                payment_methods: {
                  excluded_payment_types: [{ id: 'ticket' }], // sem boleto
                  installments: 1,
                },
                expires:              true,
                expiration_date_to:   expiry,
                payer: { email: mpPayerEmail },
              }),
              signal: AbortSignal.timeout(20000),
            });

            const mpJson = await mpRes.json();

            if (!mpRes.ok) {
              console.error(`[engine] integration_mercadopago (cartão) erro ${mpRes.status}:`, JSON.stringify(mpJson).substring(0, 300));
              await sendError('⚠️ Não foi possível gerar o link de pagamento. Um atendente vai te ajudar.');
            } else {
              const checkoutLink = mpJson.init_point || '';
              const prefId       = mpJson.id || '';

              if (d.mpPaymentIdVariable) vars[d.mpPaymentIdVariable] = prefId;
              Object.assign(session.vars, vars);

              const linkMsg = `💳 *Link de pagamento* (${valorFmt}):\n${checkoutLink}`;
              const outMsg  = makeOutgoingMsg(session.convId, linkMsg);
              addMessage(session.convId, outMsg);
              try { await sendText(channel, to, linkMsg); }
              catch (e) { console.error('[engine] MP sendText (cartão) erro:', e.message); }

              console.log(`[engine] integration_mercadopago link gerado: id=${prefId} valor=${valorFmt}`);
            }

          } else {
            // ── PIX via /v1/payments (comportamento padrão) ──────────────────
            const idempotencyKey = `${session.convId}-${Date.now()}`;

            const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
              method: 'POST',
              headers: {
                'Authorization':     `Bearer ${mpToken}`,
                'Content-Type':      'application/json',
                'X-Idempotency-Key': idempotencyKey,
              },
              body: JSON.stringify({
                transaction_amount: totalAmount,
                description:        mpDesc,
                payment_method_id:  'pix',
                payer:              { email: mpPayerEmail },
                date_of_expiration: expiry,
              }),
              signal: AbortSignal.timeout(20000),
            });

            const mpJson = await mpRes.json();

            if (!mpRes.ok) {
              console.error(`[engine] integration_mercadopago (pix) erro ${mpRes.status}:`, JSON.stringify(mpJson).substring(0, 300));
              await sendError('⚠️ Não foi possível gerar o PIX agora. Um atendente vai te ajudar com o pagamento.');
            } else {
              const txData    = mpJson.point_of_interaction?.transaction_data ?? {};
              const pixCode   = txData.qr_code        || '';
              const pixImgB64 = txData.qr_code_base64 || '';
              const paymentId = mpJson.id ?? '';

              if (d.mpPixCodeVariable)   vars[d.mpPixCodeVariable]   = pixCode;
              if (d.mpPixImageVariable)  vars[d.mpPixImageVariable]  = pixImgB64;
              if (d.mpPaymentIdVariable) vars[d.mpPaymentIdVariable] = String(paymentId);
              Object.assign(session.vars, vars);

              // Envia código PIX copia-e-cola
              const outMsg1 = makeOutgoingMsg(session.convId, pixCode);
              addMessage(session.convId, outMsg1);
              try { await sendText(channel, to, pixCode); }
              catch (e) { console.error('[engine] MP sendText (pix) erro:', e.message); }

              // Envia QR Code como imagem
              if (pixImgB64) {
                try { await sendImageBase64(channel, to, pixImgB64, `QR Code PIX – ${valorFmt}`); }
                catch (e) { console.error('[engine] MP sendImageBase64 erro:', e.message); }
              }

              console.log(`[engine] integration_mercadopago PIX gerado: id=${paymentId} valor=${valorFmt}`);
            }
          }
        } catch (err) {
          console.error('[engine] integration_mercadopago ERRO:', err.message);
        }
      }

      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      break;
    }

    case 'integration_email': {
      // Integração de e-mail - requer serviço SMTP configurado no servidor
      console.log(`[engine] integration_email: para="${d.emailTo}" assunto="${d.emailSubject}"`);
      // TODO: integrar com nodemailer ou serviço SMTP configurado
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      break;
    }

    // ── LÓGICA ────────────────────────────────────────────────────────────────
    case 'logic_variable': {
      if (d.variable) {
        session.vars[d.variable] = interpolate(d.varValue || '', vars);
        console.log(`[engine] logic_variable: "${d.variable}" = "${session.vars[d.variable]}"`);
      }
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      break;
    }

    case 'logic_decision': {
      let handle = 'false';
      // Proxy retorna '' para qualquer variável não definida em vars,
      // evitando ReferenceError quando a IA falhou e não preencheu a variável.
      const safeVars = new Proxy(vars, {
        has: () => true,
        get: (t, p) => (p in t ? t[p] : ''),
      });

      try {
        if (Array.isArray(d.conditions) && d.conditions.length > 0) {
          // ── Formato multi-condição: conditions:[{label,condition},...] ──────────
          // Avalia em ordem; usa o handle da primeira que bater (cond-0, cond-1, ...).
          // Se nenhuma bater, cai no último item como fallthrough.
          handle = `cond-${d.conditions.length - 1}`;
          for (let i = 0; i < d.conditions.length; i++) {
            const cond = interpolate(d.conditions[i].condition || '', vars);
            console.log(`[engine] logic_decision cond-${i} ("${d.conditions[i].label}"): avaliando "${cond}"`);
            try {
              // eslint-disable-next-line no-new-func
              const result = new Function('vars', `with(vars){return !!(${cond})}`)(safeVars);
              if (result) { handle = `cond-${i}`; break; }
            } catch (e) {
              console.warn(`[engine] logic_decision cond-${i} erro: ${e.message}`);
            }
          }
        } else {
          // ── Formato simples: condition (string) → 'true' | 'false' ─────────────
          const cond = interpolate(d.condition || '', vars);
          console.log(`[engine] logic_decision: avaliando "${cond}"`);
          // eslint-disable-next-line no-new-func
          handle = new Function('vars', `with(vars){return !!(${cond})}`)(safeVars) ? 'true' : 'false';
        }
      } catch (e) {
        console.warn(`[engine] logic_decision erro: ${e.message}`);
        handle = 'false';
      }

      console.log(`[engine] logic_decision: resultado="${handle}"`);
      const next = nextNode(node.id, handle);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      break;
    }

    case 'logic_timer': {
      const secs = Number(d.timerSeconds) || 30;
      session.nodeId      = node.id;
      session.waitingFor  = 'timer';
      session.timerExpiry = Date.now() + secs * 1000;
      console.log(`[engine] logic_timer: aguardando resposta por ${secs}s (expira ${new Date(session.timerExpiry).toISOString()})`);
      // O job em timer.mjs disparará o caminho 'false' (Tempo esgotado) se o prazo vencer.
      // A próxima mensagem do usuário irá pelo caminho 'true' (Respondeu) via runFlow().
      break;
    }

    case 'logic_suspend': {
      // Pausa o fluxo - retomado pela próxima mensagem do usuário
      if (d.message) {
        const text = interpolate(d.message, vars);
        const msg  = makeOutgoingMsg(session.convId, text);
        addMessage(session.convId, msg);
        try { await sendText(channel, to, text); }
        catch (err) { console.error(`[engine] ERRO ao enviar mensagem suspend: ${err.message}`); }
      }
      session.nodeId     = node.id;
      session.waitingFor = 'suspend';
      console.log('[engine] logic_suspend: fluxo suspenso, aguardando próxima mensagem.');
      break;
    }

    case 'logic_business_hours': {
      const now     = new Date();
      const day     = now.getDay();                                    // 0=Dom … 6=Sáb
      const minutes = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = (d.bhStart || '09:00').split(':').map(Number);
      const [eh, em] = (d.bhEnd   || '18:00').split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin   = eh * 60 + em;
      const days     = d.bhDays ?? [1, 2, 3, 4, 5];
      const inHours  = days.includes(day) && minutes >= startMin && minutes < endMin;
      const handle   = inHours ? 'true' : 'false';
      console.log(`[engine] logic_business_hours: dia=${day} hora=${now.getHours()}:${now.getMinutes()} → ${inHours ? 'Dentro' : 'Fora'}`);
      const next = nextNode(node.id, handle);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      break;
    }

    case 'logic_protocol': {
      const prefix   = d.protocolPrefix || '';
      const now      = new Date();
      const date     = now.toISOString().slice(0, 10).replace(/-/g, '');
      const seq      = String(Date.now()).slice(-6);
      const protocol = `${prefix}${date}${seq}`;
      if (d.variable) session.vars[d.variable] = protocol;
      console.log(`[engine] logic_protocol: protocolo gerado "${protocol}" → var="${d.variable ?? ' - '}"`);
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      break;
    }

    case 'logic_list_lookup': {
      // Busca em lista - futura integração com CRM/HubSpot
      // Por ora, marca como não encontrado para o fluxo continuar
      console.log(`[engine] logic_list_lookup: lista="${d.listName}" valor="${d.listSearchValue}"`);
      const handle = 'false'; // 'true' quando integração CRM for implementada
      const next   = nextNode(node.id, handle);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      break;
    }

    // ── TERMINAÇÕES ───────────────────────────────────────────────────────────
    case 'end_handoff': {
      if (d.handoffMessage) {
        const text = interpolate(d.handoffMessage, vars);
        const msg  = makeOutgoingMsg(session.convId, text);
        addMessage(session.convId, msg);
        try { await sendText(channel, to, text); }
        catch (err) { console.error(`[engine] ERRO handoffMessage: ${err.message}`); }
      }
      const conv = store.conversations[session.convId];
      if (conv) {
        const updates = { status: 'open' };
        if (d.handoffGroupId) updates.groupId = d.handoffGroupId;
        store.conversations[session.convId] = { ...conv, ...updates };
        broadcast('conversation_updated', store.conversations[session.convId]);
      }
      console.log(`[engine] end_handoff: transferido para operador${d.handoffGroupId ? ` (grupo: ${d.handoffGroupId})` : ''}`);
      session.waitingFor = null;
      session.ended      = true;
      break;
    }

    case 'end_finish': {
      if (d.message) {
        const text = interpolate(d.message, vars);
        const msg  = makeOutgoingMsg(session.convId, text);
        addMessage(session.convId, msg);
        try { await sendText(channel, to, text); }
        catch (err) { console.error(`[engine] ERRO end_finish: ${err.message}`); }
      }
      const conv = store.conversations[session.convId];
      if (conv) {
        store.conversations[session.convId] = { ...conv, status: 'resolved' };
        broadcast('conversation_updated', store.conversations[session.convId]);
      }
      console.log('[engine] end_finish: conversa encerrada.');
      session.ended = true;
      break;
    }

    // ── AÇÕES ─────────────────────────────────────────────────────────────────
    case 'action_forward': {
      const targetPhone = interpolate(d.forwardTo || '', vars).replace(/\D/g, '');

      if (!targetPhone) {
        console.warn('[engine] action_forward: número de destino não configurado ou vazio.');
      } else {
        // Monta a mensagem a encaminhar
        let fwdBody = '';
        const mode = d.forwardMode ?? 'last_input';
        if (mode === 'last_input') {
          fwdBody = session.lastInput || '';
        } else if (mode === 'variable') {
          fwdBody = vars[d.forwardVariable || ''] ?? '';
        } else {
          fwdBody = interpolate(d.forwardCustomText || '', vars);
        }

        // Prefixo opcional
        const prefix = d.forwardPrefix ? interpolate(d.forwardPrefix, vars) : '';
        const fullMsg = prefix ? `${prefix}\n${fwdBody}` : fwdBody;

        if (!fullMsg.trim()) {
          console.warn('[engine] action_forward: mensagem a encaminhar está vazia.');
        } else {
          // Canal de envio: usa o configurado ou o canal atual da conversa
          let fwdChannel = channel;
          if (d.forwardChannelId) {
            const found = Object.values(store.channels).find(ch => ch.id === d.forwardChannelId);
            if (found) fwdChannel = found;
            else console.warn(`[engine] action_forward: canal "${d.forwardChannelId}" não encontrado, usando canal atual.`);
          }

          const targetJid = `${targetPhone}@s.whatsapp.net`;
          try {
            await sendText(fwdChannel, targetJid, fullMsg);
            console.log(`[engine] action_forward: mensagem encaminhada para ${targetPhone} via canal "${fwdChannel.name}"`);
          } catch (err) {
            console.error(`[engine] ERRO action_forward: ${err.message}`);
          }
        }
      }

      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      else session.ended = true;
      break;
    }

    default: {
      console.log(`[engine] Nó tipo "${node.type}" não implementado - avançando.`);
      const next = nextNode(node.id);
      if (next) { session.nodeId = next.id; await executeNode(next, session, channel, nodesById, nextNode, bot); }
      break;
    }
  }
}
