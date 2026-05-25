import React, { useState, useEffect } from 'react';
import ConversationList from '../components/Messages/ConversationList';
import ChatWindow from '../components/Messages/ChatWindow';

interface MessagesProps {
  onMobileChatChange: (open: boolean) => void;
}

export default function Messages({ onMobileChatChange }: MessagesProps) {
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const handleBack = () => {
    setMobileView('list');
    onMobileChatChange(false);
  };

  const handleSelect = () => {
    setMobileView('chat');
    onMobileChatChange(true);
    // Adiciona entrada no histórico do browser para o botão físico de voltar funcionar
    window.history.pushState({ mobileChat: true }, '');
  };

  const handleInAppBack = () => {
    // Se temos uma entrada de histórico nossa, usa ela (dispara popstate → handleBack)
    // Caso contrário (ex: F5 com chat aberto), volta direto
    if (window.history.state?.mobileChat) {
      window.history.go(-1);
    } else {
      handleBack();
    }
  };

  // Intercepta o botão de voltar do Android / browser
  useEffect(() => {
    if (mobileView !== 'chat') return; // só ouve quando o chat está aberto

    const onPopState = () => handleBack();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [mobileView]); // re-registra sempre que mobileView muda

  return (
    <div className="flex flex-1 h-full min-h-0 overflow-hidden">
      {/* Lista — tela cheia no mobile, largura fixa no desktop */}
      <div className={[
        'flex-col h-full min-h-0 overflow-hidden',
        'w-full md:w-80 md:flex md:shrink-0',
        mobileView === 'chat' ? 'hidden md:flex' : 'flex',
      ].join(' ')}>
        <ConversationList onSelect={handleSelect} />
      </div>

      {/* Chat — tela cheia no mobile, flex-1 no desktop */}
      <div className={[
        'flex-col flex-1 min-w-0 min-h-0 overflow-hidden',
        mobileView === 'list' ? 'hidden md:flex' : 'flex',
      ].join(' ')}>
        <ChatWindow onBack={handleInAppBack} />
      </div>
    </div>
  );
}
