import React, { useState } from 'react';
import { FileText, Megaphone, Wifi, Bot, BookOpen } from 'lucide-react';
import Templates from '../components/Chatbot/Templates';
import Campaigns from '../components/Chatbot/Campaigns';
import Channels from '../components/Chatbot/Channels';
import ChatbotList from '../components/Chatbot/ChatbotList';
import KnowledgeBases from '../components/Chatbot/KnowledgeBases';
import clsx from 'clsx';

type SubTab = 'bots' | 'templates' | 'campaigns' | 'channels' | 'knowledge';

const tabs: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: 'bots',      label: 'Chatbots',           icon: Bot },
  { id: 'knowledge', label: 'Bases de Conhec.',   icon: BookOpen },
  { id: 'templates', label: 'Templates',           icon: FileText },
  { id: 'campaigns', label: 'Campanhas',           icon: Megaphone },
  { id: 'channels',  label: 'Canais',              icon: Wifi },
];

export default function ChatbotPage() {
  const [active, setActive] = useState<SubTab>('bots');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">Chatbot & Automações</h1>
        <p className="text-sm text-slate-500">Gerencie fluxos, templates, campanhas e canais</p>
      </div>

      {/* Sub-tabs */}
      <div className="bg-white border-b border-slate-100 px-6">
        <div className="flex gap-0">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition',
                active === id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {active === 'bots'      && <ChatbotList />}
        {active === 'knowledge' && <KnowledgeBases />}
        {active === 'templates' && <Templates />}
        {active === 'campaigns' && <Campaigns />}
        {active === 'channels'  && <Channels />}
      </div>
    </div>
  );
}
