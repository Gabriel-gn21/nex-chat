import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Messages from './pages/Messages';
import Reports from './pages/Reports';
import ChatbotPage from './pages/ChatbotPage';
import Settings from './pages/Settings';
import Stock from './pages/Stock';
import Sidebar from './components/Layout/Sidebar';
import { AppProvider } from './contexts/AppContext';

type View = 'messages' | 'reports' | 'chatbot' | 'stock' | 'settings';

function AppContent() {
  const { isAuthenticated } = useAuth();
  const [activeView,     setActiveView]     = useState<View>('messages');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  if (!isAuthenticated) return <Login />;

  const handleSetView = (v: View) => {
    setActiveView(v);
    setMobileChatOpen(false); // ao trocar de aba, fecha o chat mobile
  };

  return (
    <AppProvider>
      <div className="h-[100dvh] flex overflow-hidden bg-slate-50">
        {/* Sidebar: desktop (esquerda) e mobile (rodapé) */}
        <Sidebar
          activeView={activeView}
          setActiveView={handleSetView}
          mobileChatOpen={mobileChatOpen}
        />

        {/* Conteúdo principal */}
        <main className={`flex-1 flex overflow-hidden min-h-0 min-w-0 ${!mobileChatOpen ? 'mb-14 md:mb-0' : ''}`}>
          {activeView === 'messages'  && <Messages onMobileChatChange={setMobileChatOpen} />}
          {activeView === 'reports'   && <Reports />}
          {activeView === 'chatbot'   && <ChatbotPage />}
          {activeView === 'stock'     && <Stock />}
          {activeView === 'settings'  && <Settings />}
        </main>
      </div>
    </AppProvider>
  );
}

export default function App() {
  return <AppContent />;
}
