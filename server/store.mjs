/**
 * store.mjs — armazenamento em memória com persistência em arquivo
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data.json');

// Estado global
export const store = {
  conversations:  {},  // id -> Conversation (sem messages)
  messages:       {},  // convId -> Message[]
  sessions:       {},  // `${phone}:${channelId}` -> BotSession
  channels:       {},  // instanceName -> Channel
  chatbots:       {},  // channelId -> Chatbot
  groups:         {},  // id -> AttendanceGroup
  knowledgeBases: {},  // id -> KnowledgeBase
  config:         {},  // configurações do servidor (tokens de integrações, etc.)
};

// Carrega estado salvo
if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    Object.assign(store.conversations, saved.conversations || {});
    Object.assign(store.messages,      saved.messages      || {});
    Object.assign(store.sessions,      saved.sessions      || {});
    // ↓ persiste config para sobreviver reinicializações do servidor
    Object.assign(store.channels,       saved.channels       || {});
    Object.assign(store.chatbots,       saved.chatbots       || {});
    Object.assign(store.groups,         saved.groups         || {});
    Object.assign(store.knowledgeBases, saved.knowledgeBases || {});
    Object.assign(store.config,         saved.config         || {});

    console.log(`[store] Carregados:`);
    console.log(`  → ${Object.keys(store.conversations).length} conversa(s)`);
    console.log(`  → ${Object.keys(store.channels).length} canal(is)`);
    console.log(`  → ${Object.keys(store.chatbots).length} chatbot(s)`);
    console.log(`  → ${Object.keys(store.groups).length} grupo(s)`);
  } catch (e) {
    console.warn('[store] Falha ao carregar data.json:', e.message);
  }
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify({
        conversations: store.conversations,
        messages:      store.messages,
        sessions:      store.sessions,
        channels:       store.channels,
        chatbots:       store.chatbots,
        groups:         store.groups,
        knowledgeBases: store.knowledgeBases,
        config:         store.config,
      }, null, 2));
    } catch (e) {
      console.warn('[store] Falha ao salvar:', e.message);
    }
  }, 500);
}
