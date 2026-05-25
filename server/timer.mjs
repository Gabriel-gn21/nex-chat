/**
 * timer.mjs — Job de background para expiração do nó Temporizador (logic_timer)
 *
 * Verifica a cada 3 segundos se alguma sessão está aguardando resposta
 * com o temporizador vencido. Se sim, aciona o caminho "timeout" no fluxo.
 */
import { store, save } from './store.mjs';
import { runFlow }     from './engine.mjs';

export function startTimerJob() {
  setInterval(async () => {
    const now = Date.now();

    for (const [key, session] of Object.entries(store.sessions)) {
      if (session.waitingFor !== 'timer') continue;
      if (!session.timerExpiry || now < session.timerExpiry) continue;

      // Chatbots são indexados pelo próprio id, não pelo channelId —
      // precisa iterar para encontrar o bot ativo do canal da sessão.
      const bot = Object.values(store.chatbots).find(
        b => b.channelId === session.channelId && b.status === 'active'
      ) ?? null;
      if (!bot) {
        // Sem bot associado — limpa estado para não ficar em loop
        session.waitingFor  = null;
        session.timerExpiry = null;
        save();
        continue;
      }

      console.log(`[timer] Tempo esgotado para sessão "${key}" → acionando caminho timeout`);
      try {
        await runFlow(session, bot, '__timeout__');
        save();
      } catch (err) {
        console.error(`[timer] Erro ao executar timeout da sessão "${key}":`, err.message);
        // Previne loop infinito: marca como encerrado se falhar
        session.waitingFor  = null;
        session.timerExpiry = null;
        session.ended       = true;
        save();
      }
    }
  }, 3000); // verifica a cada 3 segundos

  console.log('[timer] Job de temporizador iniciado (verificação a cada 3s)');
}
