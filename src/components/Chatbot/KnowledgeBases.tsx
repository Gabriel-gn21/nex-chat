import React, { useState } from 'react';
import { Plus, Trash2, Edit3, X, Save, BookOpen, ChevronDown, ChevronRight, Eye, EyeOff, FileText, Info } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { KnowledgeBase } from '../../types';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Guia de documentação em Markdown ────────────────────────────────────────
const MARKDOWN_GUIDE = `# Guia para documentar sua Base de Conhecimento

## Estrutura recomendada

Use **cabeçalhos** para organizar os tópicos principais:

# Título principal da base
## Seção 1 — Produtos e Serviços
### Subseção 1.1 — Detalhes

---

## Formatos que funcionam bem com IA

### ✅ Perguntas e Respostas (recomendado)
**P: Qual o horário de funcionamento?**
R: Atendemos de segunda a sexta, das 08h às 18h, e sábados das 09h às 13h.

**P: Como cancelo meu pedido?**
R: Entre em contato via WhatsApp em até 2 horas após a compra. Após esse prazo, o cancelamento não é garantido.

---

### ✅ Listas de informações
**Formas de pagamento aceitas:**
- Pix (desconto de 5%)
- Cartão de crédito (até 12x)
- Boleto bancário (vence em 3 dias úteis)

---

### ✅ Tabelas
| Plano     | Preço/mês | Recursos          |
|-----------|-----------|-------------------|
| Básico    | R$ 49     | 1 usuário, 5GB    |
| Pro       | R$ 99     | 5 usuários, 50GB  |
| Business  | R$ 249    | Ilimitado, 500GB  |

---

### ✅ Políticas e regras
**Política de troca:**
Aceitamos trocas em até 7 dias corridos após o recebimento, desde que o produto esteja sem uso e na embalagem original. O cliente arca com o frete de devolução.

---

## Boas práticas

1. **Seja objetivo**: respostas curtas e diretas funcionam melhor
2. **Use linguagem natural**: escreva como você responderia ao cliente
3. **Cubra os casos comuns**: foque nas perguntas mais frequentes
4. **Separe os tópicos**: use linhas em branco e títulos para facilitar
5. **Mantenha atualizado**: revise a base quando preços ou políticas mudarem

---

## Exemplo de base completa

# Loja Virtual ABC

## Sobre nós
Somos uma loja de eletrônicos online fundada em 2018, com mais de 50.000 clientes ativos.

## Entrega
**P: Qual o prazo de entrega?**
R: Entre 3 a 7 dias úteis para todo o Brasil. Regiões Norte e Nordeste podem ter prazo estendido de até 12 dias.

**P: Vocês entregam no mesmo dia?**
R: Sim! Para capitais e regiões metropolitanas, oferecemos entrega expressa no mesmo dia para pedidos realizados até as 12h.

## Trocas e Devoluções
- Prazo: 7 dias após o recebimento
- Condição: produto sem uso e na embalagem original
- Como solicitar: acesse sua conta > Meus pedidos > Solicitar troca

## Suporte
Atendimento humano disponível de segunda a sexta das 09h às 18h.
Para dúvidas urgentes fora do horário, deixe sua mensagem que retornamos no próximo dia útil.
`;

// ─── Preview simples de Markdown ─────────────────────────────────────────────
function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="text-slate-400 text-sm italic p-4">Nenhum conteúdo para visualizar.</p>;
  }
  // Renderização básica linha a linha
  const lines = content.split('\n');
  return (
    <div className="p-4 space-y-1 text-sm text-slate-700 font-sans leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-bold text-slate-800 mt-3 mb-1">{line.slice(4)}</h3>;
        if (line.startsWith('## '))  return <h2 key={i} className="text-base font-bold text-slate-800 mt-4 mb-1 border-b border-slate-200 pb-1">{line.slice(3)}</h2>;
        if (line.startsWith('# '))   return <h1 key={i} className="text-lg font-bold text-slate-900 mt-4 mb-2">{line.slice(2)}</h1>;
        if (line.startsWith('---'))  return <hr key={i} className="border-slate-200 my-2" />;
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
        if (/^\d+\. /.test(line))    return <li key={i} className="ml-4 list-decimal">{line.replace(/^\d+\. /, '')}</li>;
        if (line.startsWith('|'))    return <p key={i} className="font-mono text-xs text-slate-600 bg-slate-50 px-2">{line}</p>;
        if (line.trim() === '')      return <div key={i} className="h-1" />;
        // Bold inline
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i}>
            {parts.map((p, j) =>
              p.startsWith('**') && p.endsWith('**')
                ? <strong key={j}>{p.slice(2, -2)}</strong>
                : p
            )}
          </p>
        );
      })}
    </div>
  );
}

// ─── Modal de criação / edição ────────────────────────────────────────────────
function KBModal({
  kb, onSave, onClose,
}: {
  kb: KnowledgeBase | null;
  onSave: (data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [name,        setName]        = useState(kb?.name        ?? '');
  const [description, setDescription] = useState(kb?.description ?? '');
  const [content,     setContent]     = useState(kb?.content     ?? '');
  const [tab,         setTab]         = useState<'edit' | 'preview' | 'guide'>('edit');

  const isValid = name.trim() && content.trim();

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ height: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-primary-600" />
            <h2 className="font-semibold text-slate-800">{kb ? 'Editar base de conhecimento' : 'Nova base de conhecimento'}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Campos laterais */}
          <div className="w-72 border-r border-slate-100 p-5 space-y-4 shrink-0 overflow-y-auto">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nome *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                placeholder="Ex: FAQ Produtos, Política de troca..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
                placeholder="Descreva brevemente o conteúdo desta base..."
              />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold flex items-center gap-1"><Info size={12} /> Como funciona</p>
              <p>A IA consulta esta base antes de responder. Se a pergunta do cliente estiver coberta, a resposta seguirá o conteúdo documentado aqui.</p>
            </div>
          </div>

          {/* Editor / Preview / Guia */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sub-tabs */}
            <div className="flex gap-0 border-b border-slate-100 px-4 pt-3 shrink-0">
              {([
                { id: 'edit',    label: 'Editor',   icon: Edit3 },
                { id: 'preview', label: 'Preview',  icon: Eye },
                { id: 'guide',   label: 'Guia',     icon: FileText },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition',
                    tab === id ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                  )}
                >
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden">
              {tab === 'edit' && (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full p-4 text-sm font-mono text-slate-800 resize-none focus:outline-none border-0"
                  placeholder="# Minha Base de Conhecimento&#10;&#10;## Perguntas Frequentes&#10;&#10;**P: Como faço para...?**&#10;R: ..."
                />
              )}
              {tab === 'preview' && (
                <div className="h-full overflow-y-auto">
                  <MarkdownPreview content={content} />
                </div>
              )}
              {tab === 'guide' && (
                <div className="h-full overflow-y-auto">
                  <MarkdownPreview content={MARKDOWN_GUIDE} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 shrink-0">
          <p className="text-xs text-slate-400">
            {content.length > 0 ? `${content.length.toLocaleString()} caracteres · ${content.split('\n').length} linhas` : 'Nenhum conteúdo ainda'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button
              onClick={() => isValid && onSave({ name: name.trim(), description: description.trim() || undefined, content })}
              disabled={!isValid}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition"
            >
              <Save size={14} />
              {kb ? 'Salvar alterações' : 'Criar base'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function KnowledgeBases() {
  const { knowledgeBases, addKnowledgeBase, updateKnowledgeBase, deleteKnowledgeBase } = useApp();
  const [modal,   setModal]   = useState<'new' | KnowledgeBase | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const handleSave = (data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (modal === 'new') {
      addKnowledgeBase(data);
    } else if (modal && typeof modal === 'object') {
      updateKnowledgeBase(modal.id, data);
    }
    setModal(null);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Bases de Conhecimento</h2>
          <p className="text-sm text-slate-500 mt-0.5">Documentos em Markdown que a IA consulta antes de responder ao cliente.</p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md"
        >
          <Plus size={15} />
          Nova base
        </button>
      </div>

      {/* Empty state */}
      {knowledgeBases.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
          <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mb-4">
            <BookOpen size={28} className="text-primary-500" strokeWidth={1.5} />
          </div>
          <p className="font-medium text-slate-700 mb-1">Nenhuma base criada ainda</p>
          <p className="text-sm text-slate-400 mb-4 text-center max-w-sm">
            Crie uma base de conhecimento em Markdown e vincule-a ao nó de IA no fluxo do chatbot.
          </p>
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition"
          >
            <Plus size={14} />
            Criar primeira base
          </button>
        </div>
      )}

      {/* Lista */}
      {knowledgeBases.length > 0 && (
        <div className="space-y-3">
          {knowledgeBases.map((kb) => (
            <div key={kb.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start justify-between gap-4 hover:shadow-md transition">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                  <BookOpen size={18} className="text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{kb.name}</p>
                  {kb.description && <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{kb.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-slate-400">
                      {kb.content.length.toLocaleString()} caracteres
                    </span>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-400">
                      Atualizado {format(new Date(kb.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setModal(kb)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 flex items-center justify-center transition"
                  title="Editar"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => setConfirm(kb.id)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition"
                  title="Excluir"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criação/edição */}
      {modal && (
        <KBModal
          kb={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Confirm delete */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-slate-800 mb-2">Excluir base de conhecimento?</h3>
            <p className="text-sm text-slate-500 mb-4">
              Esta ação não pode ser desfeita. Os fluxos que usavam esta base deixarão de consultá-la.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition">
                Cancelar
              </button>
              <button
                onClick={() => { deleteKnowledgeBase(confirm); setConfirm(null); }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
