/**
 * evolution.mjs - cliente para a Evolution API v1.x
 */

const mediaTypeMap = {
  send_image: 'image',
  send_audio: 'audio',
  send_video: 'video',
  send_file:  'document',
};

/** Envia texto simples */
export async function sendText(channel, phone, text) {
  const { evolutionApiUrl: url, evolutionApiKey: key, evolutionInstanceName: inst } = channel;

  if (!url || !key || !inst) {
    throw new Error(`[evolution] Campos ausentes no canal: url=${url}, inst=${inst}, key=${key ? '***' : 'MISSING'}`);
  }

  const number   = toJid(phone);
  const endpoint = `${url.replace(/\/$/, '')}/message/sendText/${inst}`;

  console.log(`[evolution] sendText → ${endpoint} | para: ${number} | "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);

  let res;
  try {
    res = await fetch(endpoint, {
      method:  'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number,
        options:     { delay: 1000 },
        textMessage: { text },
      }),
    });
  } catch (fetchErr) {
    throw new Error(`[evolution] Falha ao conectar em ${endpoint}: ${fetchErr.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '(sem body)');
    throw new Error(`[evolution] Evolution API respondeu ${res.status}: ${body}`);
  }

  const json = await res.json().catch(() => ({}));
  console.log(`[evolution] sendText OK → status=${json.status ?? '?'} key=${json.key?.id ?? '?'}`);
  return json;
}

/**
 * Envia mídia (imagem, áudio, vídeo, documento) via URL.
 * @param {'image'|'audio'|'video'|'document'} mediaType
 */
export async function sendMedia(channel, phone, mediaType, mediaUrl, caption = '') {
  const { evolutionApiUrl: url, evolutionApiKey: key, evolutionInstanceName: inst } = channel;

  if (!url || !key || !inst) {
    throw new Error(`[evolution] Campos ausentes no canal`);
  }
  if (!mediaUrl) {
    throw new Error(`[evolution] sendMedia: URL de mídia não informada`);
  }

  const number   = toJid(phone);

  // Áudio de voz usa endpoint dedicado para enviar como nota de voz do WhatsApp
  const isVoice  = mediaType === 'audio';
  const endpoint = `${url.replace(/\/$/, '')}/message/${isVoice ? 'sendWhatsAppAudio' : 'sendMedia'}/${inst}`;

  console.log(`[evolution] sendMedia(${mediaType}) → ${endpoint} | para: ${number} | url: ${mediaUrl.substring(0, 80)}`);

  const body = isVoice
    ? { number, options: { delay: 500, encoding: true }, audioMessage: { audio: mediaUrl } }
    : {
        number,
        options: { delay: 1000 },
        mediaMessage: {
          mediatype: mediaType,
          media:     mediaUrl,
          ...(caption ? { caption } : {}),
        },
      };

  let res;
  try {
    res = await fetch(endpoint, {
      method:  'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw new Error(`[evolution] Falha ao conectar em ${endpoint}: ${fetchErr.message}`);
  }

  if (!res.ok) {
    const rb = await res.text().catch(() => '(sem body)');
    throw new Error(`[evolution] Evolution API respondeu ${res.status}: ${rb}`);
  }

  const json = await res.json().catch(() => ({}));
  console.log(`[evolution] sendMedia OK → status=${json.status ?? '?'}`);
  return json;
}

/**
 * Envia menu numerado como texto formatado.
 */
export async function sendButtons(channel, phone, title, body, buttons) {
  const lines = [
    title ? `*${title}*` : '',
    body  ? body         : '',
    '',
    ...buttons.map((b, i) => `${i + 1}. ${b.label}`),
  ].filter((l, i) => !(i === 0 && !l) && !(i === 1 && !l));

  return sendText(channel, phone, lines.join('\n'));
}

export async function sendMenu(channel, phone, title, body, items) {
  return sendButtons(channel, phone, title, body, items);
}

/**
 * Envia imagem a partir de string base64 (ex: QR Code PIX).
 * @param {string} base64 - conteúdo base64 puro (sem prefixo data:image)
 * @param {string} caption - legenda opcional
 */
export async function sendImageBase64(channel, phone, base64, caption = '') {
  const { evolutionApiUrl: url, evolutionApiKey: key, evolutionInstanceName: inst } = channel;

  if (!url || !key || !inst) throw new Error('[evolution] Campos ausentes no canal');
  if (!base64)               throw new Error('[evolution] sendImageBase64: base64 vazio');

  const number   = toJid(phone);
  const endpoint = `${url.replace(/\/$/, '')}/message/sendMedia/${inst}`;

  console.log(`[evolution] sendImageBase64 → ${endpoint} | para: ${number}`);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number,
      options: { delay: 1000 },
      mediaMessage: {
        mediatype: 'image',
        media:     base64.replace(/^data:image\/\w+;base64,/, ''), // base64 puro, sem prefixo data URI
        mimetype:  'image/png',
        fileName:  'pix_qrcode.png',
        ...(caption ? { caption } : {}),
      },
    }),
  });

  if (!res.ok) {
    const rb = await res.text().catch(() => '(sem body)');
    throw new Error(`[evolution] Evolution API respondeu ${res.status}: ${rb}`);
  }

  const json = await res.json().catch(() => ({}));
  console.log(`[evolution] sendImageBase64 OK → status=${json.status ?? '?'}`);
  return json;
}

/**
 * Envia mídia (imagem, vídeo, documento) a partir de base64.
 */
export async function sendMediaFileBase64(channel, phone, mediaType, base64, mimetype, filename = '', caption = '') {
  const { evolutionApiUrl: url, evolutionApiKey: key, evolutionInstanceName: inst } = channel;
  if (!url || !key || !inst) throw new Error('[evolution] Campos ausentes no canal');

  const number   = toJid(phone);
  const endpoint = `${url.replace(/\/$/, '')}/message/sendMedia/${inst}`;
  const rawB64   = base64.replace(/^data:[^;]+;base64,/, '');

  console.log(`[evolution] sendMediaFileBase64(${mediaType}) → ${endpoint} | para: ${number}`);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number,
      options: { delay: 1000 },
      mediaMessage: {
        mediatype: mediaType,
        media:     rawB64,
        mimetype,
        ...(filename ? { fileName: filename } : {}),
        ...(caption  ? { caption }            : {}),
      },
    }),
  });

  if (!res.ok) {
    const rb = await res.text().catch(() => '(sem body)');
    throw new Error(`[evolution] sendMediaFileBase64 ${res.status}: ${rb}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Envia áudio (nota de voz) a partir de base64.
 */
export async function sendAudioFileBase64(channel, phone, base64, mimetype) {
  const { evolutionApiUrl: url, evolutionApiKey: key, evolutionInstanceName: inst } = channel;
  if (!url || !key || !inst) throw new Error('[evolution] Campos ausentes no canal');

  const number   = toJid(phone);
  const endpoint = `${url.replace(/\/$/, '')}/message/sendWhatsAppAudio/${inst}`;
  const rawB64   = base64.replace(/^data:[^;]+;base64,/, '');

  console.log(`[evolution] sendAudioFileBase64 → ${endpoint} | para: ${number}`);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number,
      options:      { delay: 500, encoding: true },
      audioMessage: { audio: rawB64 },
    }),
  });

  if (!res.ok) {
    const rb = await res.text().catch(() => '(sem body)');
    throw new Error(`[evolution] sendAudioFileBase64 ${res.status}: ${rb}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Envia localização geográfica.
 */
export async function sendLocationMessage(channel, phone, lat, lng, name = '') {
  const { evolutionApiUrl: url, evolutionApiKey: key, evolutionInstanceName: inst } = channel;
  if (!url || !key || !inst) throw new Error('[evolution] Campos ausentes no canal');

  const number   = toJid(phone);
  const endpoint = `${url.replace(/\/$/, '')}/message/sendLocation/${inst}`;

  console.log(`[evolution] sendLocationMessage → ${endpoint} | para: ${number} | ${lat},${lng}`);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number,
      locationMessage: {
        latitude:  lat,
        longitude: lng,
        ...(name ? { name } : {}),
      },
    }),
  });

  if (!res.ok) {
    const rb = await res.text().catch(() => '(sem body)');
    throw new Error(`[evolution] sendLocationMessage ${res.status}: ${rb}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Baixa uma mensagem de mídia da Evolution API e retorna como data URI base64.
 * Aceita o objeto de mensagem completo do webhook { key, message }.
 * Retorna string "data:<mime>;base64,<b64>" ou null se falhar.
 */
export async function getMediaBase64(channel, messageObj) {
  const { evolutionApiUrl: url, evolutionApiKey: key, evolutionInstanceName: inst } = channel;
  if (!url || !key || !inst) return null;

  const endpoint = `${url.replace(/\/$/, '')}/chat/getBase64FromMediaMessage/${inst}`;
  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: messageObj }),
      signal:  AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[evolution] getMediaBase64 falhou: ${res.status}`);
      return null;
    }
    const json = await res.json();
    const b64  = json.base64 || json.base64Data || null;
    // Strip codec params: "audio/ogg; codecs=opus" → "audio/ogg"
    const mime = (json.mimetype || 'application/octet-stream').split(';')[0].trim();
    if (!b64) return null;
    return `data:${mime};base64,${b64}`;
  } catch (e) {
    console.warn(`[evolution] getMediaBase64 erro: ${e.message}`);
    return null;
  }
}

/**
 * Busca a URL da foto de perfil de um contato via Evolution API.
 * Retorna a URL (string) ou null se não disponível / privacidade ativa.
 */
export async function fetchProfilePicture(channel, phone) {
  const { evolutionApiUrl: url, evolutionApiKey: key, evolutionInstanceName: inst } = channel;
  if (!url || !key || !inst) return null;

  const jid      = toJid(phone);
  const endpoint = `${url.replace(/\/$/, '')}/chat/fetchProfilePictureUrl/${inst}`;

  try {
    const res = await fetch(`${endpoint}?number=${encodeURIComponent(jid)}`, {
      headers: { apikey: key },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.profilePictureUrl || json.picture || null;
  } catch {
    return null;
  }
}

/**
 * Converte número para JID completo do WhatsApp.
 * Se já vier com @ (ex: @s.whatsapp.net ou @lid), mantém como está.
 * NOTA: Contas com privacidade avançada usam @lid e NÃO aceitam @s.whatsapp.net.
 */
function toJid(phone) {
  if (phone.includes('@')) return phone;          // já é um JID completo (@s.whatsapp.net ou @lid)
  const digits = phone.replace(/[^\d]/g, '');
  return `${digits}@s.whatsapp.net`;
}
