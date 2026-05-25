import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import {
  ReactFlow, ReactFlowProvider, addEdge, useNodesState, useEdgesState,
  Controls, MiniMap,
  Handle, Position, useReactFlow,
  BaseEdge, EdgeLabelRenderer, getBezierPath,
  type NodeTypes, type EdgeTypes, type Connection, type Node, type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Save, X, Trash2, Plus, ChevronDown, ChevronRight, Info, Copy,
  MessageSquare, MousePointer2, List, Image, Volume2, Paperclip, Video,
  Type, Hash, AtSign, Link2, CalendarDays, Phone, CreditCard, BadgeCheck,
  Building2, Code2, Upload, Mic, MapPin, Brain, Send, Globe,
  Tag, GitBranch, Timer, PauseCircle, Clock, Search, FileText, Headphones, CheckCircle2,
  PlayCircle, Lock, Zap, ListChecks, Webhook, PhoneCall, ExternalLink, Forward, ImagePlus, ImageOff,
} from 'lucide-react';
import {
  Chatbot, FlowNode, FlowEdge, NodeType, FlowNodeData, ApiCallData, AiProvider, KnowledgeBase, ImageLibraryEntry,
} from '../../types';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════════
// CUSTOM EDGE - com botão de exclusão ao clicar
// ═══════════════════════════════════════════════════════════════
function DeletableEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, style, markerEnd, selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              title="Remover conexão"
              onClick={(e) => {
                e.stopPropagation();
                setEdges((eds) => eds.filter((edge) => edge.id !== id));
              }}
              className="w-5 h-5 bg-white border-2 border-red-400 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-md"
            >
              <X size={10} strokeWidth={3} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes: EdgeTypes = { deletable: DeletableEdge };

// ═══════════════════════════════════════════════════════════════
// NODE REGISTRY
// ═══════════════════════════════════════════════════════════════
type NodeStyle = { bg: string; border: string; text: string; icon: React.ElementType; label: string };

const E  = { bg: 'bg-emerald-500', br: 'border-emerald-600', tx: 'text-white'       };
const B  = { bg: 'bg-blue-50',    br: 'border-blue-300',    tx: 'text-blue-700'    };
const T  = { bg: 'bg-teal-50',    br: 'border-teal-300',    tx: 'text-teal-700'    };
const V  = { bg: 'bg-violet-50',  br: 'border-violet-300',  tx: 'text-violet-700'  };
const A  = { bg: 'bg-amber-50',   br: 'border-amber-300',   tx: 'text-amber-700'   };
const Y  = { bg: 'bg-yellow-50',  br: 'border-yellow-300',  tx: 'text-yellow-700'  };
const R  = { bg: 'bg-red-50',     br: 'border-red-300',     tx: 'text-red-600'     };

const ns = (c: typeof B, icon: React.ElementType, label: string): NodeStyle =>
  ({ bg: c.bg, border: c.br, text: c.tx, icon, label });

const NODE_STYLES: Record<NodeType, NodeStyle> = {
  // Sistema
  start:        ns(E, PlayCircle,     'Início'),
  // Envios
  send_text:           ns(B, MessageSquare, 'Texto'),
  send_buttons:        ns(B, MousePointer2, 'Botões'),
  send_menu:           ns(B, List,          'Menu'),
  send_action_buttons: ns(B, Zap,           'Botões de ação'),
  send_list_buttons:   ns(B, ListChecks,    'Lista de botões'),
  send_image:          ns(B, Image,         'Imagem'),
  send_audio:          ns(B, Volume2,       'Áudio'),
  send_file:           ns(B, Paperclip,     'Arquivo'),
  send_video:          ns(B, Video,         'Vídeo'),
  // Entradas
  input_text:     ns(T, Type,         'Texto'),
  input_number:   ns(T, Hash,         'Número'),
  input_email:    ns(T, AtSign,       'Email'),
  input_link:     ns(T, Link2,        'Link'),
  input_date:     ns(T, CalendarDays, 'Data'),
  input_phone:    ns(T, Phone,        'Telefone'),
  input_cpf:      ns(T, CreditCard,   'CPF'),
  input_rg:       ns(T, BadgeCheck,   'RG'),
  input_cpf_cnpj: ns(T, Building2,    'CPF/CNPJ'),
  input_custom:   ns(T, Code2,        'Customizado'),
  input_image:    ns(T, Image,        'Imagem'),
  input_file:     ns(T, Upload,       'Arquivo'),
  input_audio:    ns(T, Mic,          'Áudio'),
  input_video:    ns(T, Video,        'Vídeo'),
  input_location: ns(T, MapPin,       'Localização'),
  // Integrações
  integration_ai:      ns(V, Brain,   'AI Agent'),
  integration_email:   ns(V, Send,    'Email'),
  integration_api:     ns(V, Globe,   'API'),
  integration_webhook: ns(V, Webhook, 'Webhook'),
  // Lógica
  logic_variable:       ns(A, Tag,         'Variável'),
  logic_decision:       ns(A, GitBranch,   'Decisão'),
  logic_timer:          ns(A, Timer,       'Temporizador'),
  logic_suspend:        ns(A, PauseCircle, 'Suspender'),
  logic_business_hours: ns(A, Clock,       'Verificar horário'),
  logic_list_lookup:    ns(A, Search,      'Localizar em lista'),
  logic_protocol:       ns(A, FileText,    'Gerar Protocolo'),
  // Ações
  action_forward: ns({ bg: 'bg-indigo-50', br: 'border-indigo-300', tx: 'text-indigo-700' }, Forward, 'Encaminhar'),
  // Terminações
  end_handoff: ns(Y, Headphones,    'Atendimento'),
  end_finish:  ns(R, CheckCircle2,  'Finalização'),
};

const NODE_DESCRIPTIONS: Record<NodeType, string> = {
  start:        'Ponto de entrada do fluxo. Todo atendimento começa aqui. Não pode ser removido.',
  send_text:    'Envia uma mensagem de texto ao usuário. Suporta variáveis como {{nome}}.',
  send_buttons:        'Envia uma mensagem com até 3 botões clicáveis. Cada botão gera um caminho diferente no fluxo.',
  send_menu:           'Envia um menu numerado. O usuário digita um número para escolher a opção.',
  send_action_buttons: 'Envia botões de ação imediata (ligação ou link). O fluxo continua sem aguardar resposta. Exclusivo para WhatsApp Chip.',
  send_list_buttons:   'Envia uma lista de opções com descrição em cada item. O usuário escolhe uma opção para avançar. Exclusivo para WhatsApp Chip.',
  send_image:   'Envia uma imagem ao usuário via URL ou upload.',
  send_audio:   'Envia um arquivo de áudio ao usuário.',
  send_file:    'Envia um arquivo ou documento ao usuário.',
  send_video:   'Envia um vídeo ao usuário.',
  input_text:     'Captura qualquer digitação livre do usuário e armazena em uma variável.',
  input_number:   'Captura e valida um número digitado pelo usuário.',
  input_email:    'Captura e valida um endereço de e-mail.',
  input_link:     'Captura e valida uma URL.',
  input_date:     'Captura e valida uma data no formato DD/MM/AAAA.',
  input_phone:    'Captura e valida um número de telefone.',
  input_cpf:      'Captura e valida um CPF (com verificação dos dígitos).',
  input_rg:       'Captura e valida um RG.',
  input_cpf_cnpj: 'Detecta automaticamente e valida CPF ou CNPJ.',
  input_custom:   'Captura texto com uma expressão regular (regex) de validação personalizada.',
  input_image:    'Aguarda o usuário enviar uma imagem.',
  input_file:     'Aguarda o usuário enviar um arquivo ou documento.',
  input_audio:    'Aguarda o usuário enviar um áudio.',
  input_video:    'Aguarda o usuário enviar um vídeo.',
  input_location: 'Aguarda o usuário compartilhar sua localização geográfica.',
  integration_ai:      'Conecta a um agente de IA (OpenAI, Claude, MCP). Processa a mensagem e retorna uma resposta.',
  integration_email:   'Envia um e-mail a partir de um endereço configurado na plataforma.',
  integration_api:     'Realiza uma chamada a uma API REST externa e armazena a resposta em uma variável.',
  integration_webhook: 'Envia dados automaticamente para um servidor externo (POST) sem aguardar resposta do cliente.',
  logic_variable:       'Declara ou atribui um valor a uma variável de fluxo.',
  logic_decision:       'Ramifica o fluxo com base em uma condição. Saídas: Verdadeiro (direita) e Falso (esquerda).',
  logic_timer:          'Aguarda resposta do cliente por N segundos. Se o tempo esgotar sem resposta, redireciona pelo caminho "Tempo esgotado".',
  logic_suspend:        'Pausa o fluxo aguardando uma ação externa (ex: confirmação de pagamento).',
  logic_business_hours: 'Verifica se está dentro do horário comercial. Saídas: Dentro e Fora do horário.',
  logic_list_lookup:    'Busca um valor em uma lista cadastrada na plataforma.',
  logic_protocol:       'Gera um número de protocolo único para o atendimento atual.',
  action_forward:       'Encaminha a última mensagem do cliente (ou um texto customizado) para outro número de WhatsApp.',
  end_handoff: 'Transfere o atendimento para a fila de operadores humanos.',
  end_finish:  'Encerra a conversa com o usuário.',
};

const PALETTE_GROUPS: { label: string; color: string; types: NodeType[] }[] = [
  {
    label: 'Envios', color: 'text-blue-700 bg-blue-50 border-blue-200',
    types: ['send_text','send_buttons','send_menu','send_action_buttons','send_list_buttons','send_image','send_audio','send_file','send_video'],
  },
  {
    label: 'Entradas', color: 'text-teal-700 bg-teal-50 border-teal-200',
    types: ['input_text','input_number','input_email','input_link','input_date','input_phone',
            'input_cpf','input_rg','input_cpf_cnpj','input_custom',
            'input_image','input_file','input_audio','input_video','input_location'],
  },
  {
    label: 'Integrações', color: 'text-violet-700 bg-violet-50 border-violet-200',
    types: ['integration_ai','integration_email','integration_api','integration_webhook'],
  },
  {
    label: 'Lógica', color: 'text-amber-700 bg-amber-50 border-amber-200',
    types: ['logic_variable','logic_decision','logic_timer','logic_suspend',
            'logic_business_hours','logic_list_lookup','logic_protocol'],
  },
  {
    label: 'Ações', color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    types: ['action_forward'],
  },
  {
    label: 'Terminações', color: 'text-slate-700 bg-slate-50 border-slate-200',
    types: ['end_handoff','end_finish'],
  },
];

// ─── Handle layout determination ──────────────────────────────────────────────
type HandleLayout = 'default' | 'start' | 'binary' | 'buttons' | 'menu' | 'terminal' | 'decision';

type DecisionCondition = { label: string; condition: string };

const getHandleLayout = (type: NodeType, data?: FlowNodeData): HandleLayout => {
  if (type === 'start') return 'start';
  if (type === 'end_handoff' || type === 'end_finish') return 'terminal';
  if (type === 'logic_decision') {
    const conds = data?.conditions as DecisionCondition[] | undefined;
    return conds && conds.length > 0 ? 'decision' : 'binary';
  }
  if (type === 'logic_business_hours' || type === 'logic_list_lookup' || type === 'logic_timer') return 'binary';
  if (type === 'send_buttons') return 'buttons';
  if (type === 'send_menu' || type === 'send_list_buttons') return 'menu';
  return 'default';
};

const BINARY_LABELS: Record<string, [string, string]> = {
  logic_decision:       ['Verdadeiro', 'Falso'],
  logic_business_hours: ['Dentro', 'Fora'],
  logic_list_lookup:    ['Encontrado', 'Não encontrado'],
  logic_timer:          ['Respondeu', 'Tempo esgotado'],
};

// ═══════════════════════════════════════════════════════════════
// CANVAS NODE COMPONENT
// ═══════════════════════════════════════════════════════════════
/** Evenly-spaced percentages for N right-side handles */
const evenPct = (n: number) =>
  Array.from({ length: n }, (_, i) => Math.round((100 / (n + 1)) * (i + 1)));

function FlowNodeComponent({ data, type: rawType, selected }: {
  data: Record<string, unknown>; type: string; selected?: boolean;
}) {
  const type    = rawType as NodeType;
  const s       = NODE_STYLES[type] ?? NODE_STYLES.send_text;
  const Icon    = s.icon;
  const d       = data as FlowNodeData;
  const layout  = getHandleLayout(type, d);
  const isStart = type === 'start';

  const btns       = (d.buttons       ?? []).slice(0, 3);
  const menuItems  = (d.menuItems    ?? []).slice(0, 8);
  const actionBtns = (d.actionButtons ?? []).slice(0, 3);
  const conditions = (d.conditions   ?? []) as DecisionCondition[];

  return (
    <div className={clsx(
      'min-w-[180px] max-w-[220px] rounded-xl border-2 shadow-md text-[11px] relative',
      s.bg, s.border,
      isStart && 'ring-2 ring-emerald-300 ring-offset-1',
      selected && 'ring-2 ring-offset-1 ring-primary-500 shadow-lg',
    )}>

      {/* ── TARGET handle - LEFT side (all nodes except start) ── */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-white !border-2 !border-slate-400 hover:!border-primary-500"
        />
      )}

      {/* ── Node body ── */}
      <div className="px-3 py-2">
        {/* Header */}
        <div className={clsx('flex items-center gap-1.5 mb-1', s.text)}>
          <Icon size={12} strokeWidth={2.5} />
          <span className="font-bold uppercase tracking-wider text-[10px]">{s.label}</span>
          {isStart && (
            <span className="ml-auto text-[9px] text-emerald-200 uppercase tracking-widest">início</span>
          )}
        </div>

        {/* Label */}
        <p className={clsx('font-semibold truncate', isStart ? 'text-white' : 'text-slate-800')}>
          {d.label}
        </p>

        {/* Message preview (not for buttons/menu/action_buttons/list_buttons which show their own list) */}
        {d.message && !['send_buttons', 'send_menu', 'send_action_buttons', 'send_list_buttons'].includes(type) && (
          <p className="text-slate-500 mt-0.5 line-clamp-2 leading-snug text-[10px]">
            {String(d.message)}
          </p>
        )}

        {/* Buttons preview */}
        {type === 'send_buttons' && (
          <div className="space-y-0.5 mt-1">
            {btns.length === 0
              ? <p className="text-slate-400 italic text-[10px]">Sem botões</p>
              : btns.map((b, i) => (
                  <div key={i} className={clsx(
                    'flex items-center justify-between px-1.5 py-0.5 rounded-md border bg-white/70',
                    s.border,
                  )}>
                    <span className={clsx('truncate text-[10px]', s.text)}>{b.label || `Botão ${i + 1}`}</span>
                    <span className="text-slate-300 text-[9px] ml-1 shrink-0">→</span>
                  </div>
                ))
            }
          </div>
        )}

        {/* Menu preview */}
        {(type === 'send_menu' || type === 'send_list_buttons') && menuItems.length > 0 && (
          <div className="mt-0.5 space-y-0.5">
            {menuItems.slice(0, 3).map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-500 truncate text-[10px]">{i + 1}. {m.label}</p>
                  {type === 'send_list_buttons' && m.description && (
                    <p className="text-slate-400 truncate text-[9px] italic">{m.description}</p>
                  )}
                </div>
                <span className="text-slate-300 text-[9px] shrink-0">→</span>
              </div>
            ))}
            {menuItems.length > 3 && (
              <p className="text-slate-400 text-[10px]">+{menuItems.length - 3} mais</p>
            )}
          </div>
        )}

        {/* Action buttons preview */}
        {type === 'send_action_buttons' && (
          <div className="space-y-0.5 mt-1">
            {actionBtns.length === 0
              ? <p className="text-slate-400 italic text-[10px]">Sem botões</p>
              : actionBtns.map((b, i) => (
                  <div key={i} className={clsx('flex items-center gap-1 px-1.5 py-0.5 rounded-md border bg-white/70', s.border)}>
                    {b.type === 'call'
                      ? <PhoneCall size={9} className={s.text} />
                      : <ExternalLink size={9} className={s.text} />}
                    <span className={clsx('truncate text-[10px]', s.text)}>{b.label || `Botão ${i+1}`}</span>
                  </div>
                ))
            }
          </div>
        )}

        {/* Variable output */}
        {d.variable && (
          <code className={clsx('block mt-0.5 truncate text-[10px]', s.text)}>
            → {String(d.variable)}
          </code>
        )}

        {/* Delay indicator (send_* nodes) */}
        {type.startsWith('send_') && d.delaySeconds && Number(d.delaySeconds) > 0 && (
          <div className="flex items-center gap-0.5 mt-0.5 text-[9px] text-slate-400">
            <Clock size={9} />
            <span>aguardar {String(d.delaySeconds)}s</span>
          </div>
        )}

        {/* Misc previews */}
        {type === 'logic_timer' && d.timerSeconds && (
          <p className={clsx('mt-0.5 font-semibold text-[10px]', s.text)}>{String(d.timerSeconds)}s</p>
        )}
        {type === 'integration_api' && d.apiCall && (
          <p className="text-violet-600 mt-0.5 truncate text-[10px]">
            {(d.apiCall as ApiCallData).method} {(d.apiCall as ApiCallData).url}
          </p>
        )}
        {type === 'integration_ai' && d.aiModel && (
          <p className="text-violet-600 mt-0.5 truncate text-[10px]">
            {String(d.aiProvider)} · {String(d.aiModel)}
          </p>
        )}
        {type === 'end_handoff' && (d.handoffGroupId || d.queueName) && (
          <p className={clsx('mt-0.5 truncate text-[10px]', s.text)}>
            {d.handoffGroupId ? `Grupo: ${String(d.handoffGroupId)}` : `Fila: ${String(d.queueName)}`}
          </p>
        )}

        {/* Binary labels - aligned to right-side handle positions */}
        {layout === 'binary' && BINARY_LABELS[type] && (
          <div className="mt-1 pt-1 border-t border-current/10 space-y-0.5">
            <div className="flex items-center justify-end gap-0.5 text-[9px] font-bold text-emerald-600">
              {BINARY_LABELS[type][0]} <span className="opacity-60">→</span>
            </div>
            <div className="flex items-center justify-end gap-0.5 text-[9px] font-bold text-red-500">
              {BINARY_LABELS[type][1]} <span className="opacity-60">→</span>
            </div>
          </div>
        )}

        {/* Decision labels - one per named condition */}
        {layout === 'decision' && conditions.length > 0 && (
          <div className="mt-1 pt-1 border-t border-current/10 space-y-0.5">
            {conditions.map((c, i) => (
              <div key={i} className="flex items-center justify-end gap-0.5 text-[9px] font-bold text-amber-700">
                <span className="truncate max-w-[100px]">{c.label || `Condição ${i + 1}`}</span>
                <span className="opacity-60">→</span>
              </div>
            ))}
          </div>
        )}

        {/* Optional path label on send blocks */}
        {!!d.pathLabel && (
          <div className="mt-0.5 flex items-center gap-0.5 text-[9px] text-slate-400 italic">
            <span className="truncate">#{String(d.pathLabel)}</span>
          </div>
        )}
      </div>

      {/* ── SOURCE handles - RIGHT side ── */}

      {/* default / start: single centered */}
      {(layout === 'default' || layout === 'start') && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-white !border-2 !border-slate-400 hover:!border-primary-500"
        />
      )}

      {/* binary: two stacked (true=top, false=bottom) */}
      {layout === 'binary' && (
        <>
          <Handle type="source" id="true"  position={Position.Right} style={{ top: '33%' }}
            className="!w-3 !h-3 !bg-white !border-2 !border-emerald-500 hover:!bg-emerald-50" />
          <Handle type="source" id="false" position={Position.Right} style={{ top: '67%' }}
            className="!w-3 !h-3 !bg-white !border-2 !border-red-400 hover:!bg-red-50" />
        </>
      )}

      {/* buttons: one per button, evenly spaced */}
      {layout === 'buttons' && (
        btns.length > 0
          ? evenPct(btns.length).map((pct, i) => (
              <Handle key={`btn-${i}`} type="source" id={`btn-${i}`}
                position={Position.Right} style={{ top: `${pct}%` }}
                className="!w-3 !h-3 !bg-white !border-2 !border-blue-400 hover:!bg-blue-50" />
            ))
          : <Handle type="source" position={Position.Right}
              className="!w-3 !h-3 !bg-white !border-2 !border-slate-400" />
      )}

      {/* menu: one per item, evenly spaced */}
      {layout === 'menu' && (
        menuItems.length > 0
          ? evenPct(menuItems.length).map((pct, i) => (
              <Handle key={`menu-${i}`} type="source" id={`menu-${i}`}
                position={Position.Right} style={{ top: `${pct}%` }}
                className="!w-3 !h-3 !bg-white !border-2 !border-blue-400 hover:!bg-blue-50" />
            ))
          : <Handle type="source" position={Position.Right}
              className="!w-3 !h-3 !bg-white !border-2 !border-slate-400" />
      )}

      {/* decision: one handle per named condition, evenly spaced */}
      {layout === 'decision' && (
        conditions.length > 0
          ? evenPct(conditions.length).map((pct, i) => (
              <Handle key={`cond-${i}`} type="source" id={`cond-${i}`}
                position={Position.Right} style={{ top: `${pct}%` }}
                className="!w-3 !h-3 !bg-white !border-2 !border-amber-500 hover:!bg-amber-50" />
            ))
          : <Handle type="source" position={Position.Right}
              className="!w-3 !h-3 !bg-white !border-2 !border-slate-400" />
      )}

      {/* terminal: target only (no source) - handled by the left handle above */}
    </div>
  );
}

const nodeTypes: NodeTypes = Object.fromEntries(
  (Object.keys(NODE_STYLES) as NodeType[]).map((k) => [k, FlowNodeComponent])
) as NodeTypes;

// ═══════════════════════════════════════════════════════════════
// PALETTE GROUP
// ═══════════════════════════════════════════════════════════════
function PaletteGroup({
  group, onDragStart, onDescribe,
}: {
  group: typeof PALETTE_GROUPS[0];
  onDragStart: (e: React.DragEvent, t: NodeType) => void;
  onDescribe: (t: NodeType) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx('w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border mb-1', group.color)}
      >
        {group.label}
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="space-y-0.5 mb-2">
          {group.types.map((type) => {
            const s = NODE_STYLES[type];
            const Icon = s.icon;
            return (
              <div
                key={type}
                draggable
                onDragStart={(e) => onDragStart(e, type)}
                onDoubleClick={() => onDescribe(type)}
                title="Arraste para o canvas · Duplo clique = info"
                className={clsx(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing',
                  'hover:shadow-sm hover:scale-[1.01] transition-all select-none',
                  s.bg, s.border
                )}
              >
                <Icon size={13} className={s.text} strokeWidth={2} />
                <span className={clsx('text-xs font-medium flex-1', s.text)}>{s.label}</span>
                <span className="text-slate-300 text-[10px]">⠿</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BUILDER INNER (uses useReactFlow)
// ═══════════════════════════════════════════════════════════════
type RFNode = Node<FlowNodeData>;

interface Props { chatbot: Chatbot; onSave: (n: FlowNode[], e: FlowEdge[]) => void; onClose: () => void; }

function BuilderInner({ chatbot, onSave, onClose }: Props) {
  const { screenToFlowPosition } = useReactFlow();
  const { groups, knowledgeBases, channels } = useApp();
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(
    chatbot.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data as FlowNodeData }))
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    chatbot.edges.map((e) => ({ id: e.id, type: 'deletable', source: e.source, target: e.target, label: e.label, animated: true, sourceHandle: e.sourceHandle }))
  );
  const [selectedNode, setSelectedNode] = useState<RFNode | null>(null);
  const [descNode,     setDescNode]     = useState<NodeType | null>(null);

  // ── Collect all declared variables from the current flow ──────
  const availableVars = useMemo<string[]>(() => {
    const vars = new Set<string>();
    const extractBraces = (text: unknown) => {
      if (typeof text !== 'string') return;
      for (const m of text.matchAll(/\{([^}]+)\}/g)) {
        const name = m[1].trim();
        if (name) vars.add(name);
      }
    };
    for (const n of nodes) {
      const d = n.data as FlowNodeData;
      // Variável de saída de qualquer nó (input, logic_variable, integration_ai, etc.)
      if (d.variable && typeof d.variable === 'string' && d.variable.trim())
        vars.add(d.variable.trim());
      // Variável de retorno de chamada de API
      if (d.apiCall) {
        const rv = (d.apiCall as ApiCallData).responseVar;
        if (rv?.trim()) vars.add(rv.trim());
      }
      // Variáveis referenciadas no system prompt e mensagem do agente IA
      // tornam-se variáveis declaradas no fluxo a partir deste nó
      if (n.type === 'integration_ai') {
        extractBraces(d.aiSystemPrompt);
        extractBraces(d.aiUserMessage);
      }
    }
    return [...vars];
  }, [nodes]);

  // ── DnD ──────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData('application/nex-node', type);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/nex-node') as NodeType;
    if (!type || !NODE_STYLES[type]) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newNode: RFNode = {
      id: `n_${Date.now()}`,
      type,
      position,
      data: {
        label:         NODE_STYLES[type].label,
        buttons:       type === 'send_buttons'        ? [{ label: 'Botão 1' }]                              : undefined,
        menuItems:     type === 'send_menu'           ? [{ label: 'Opção 1' }]                              :
                       type === 'send_list_buttons'   ? [{ label: 'Opção 1', description: 'Descrição...' }] : undefined,
        actionButtons: type === 'send_action_buttons' ? [{ type: 'url', label: 'Acessar site', value: 'https://' }] : undefined,
        webhookMethod: type === 'integration_webhook' ? 'POST' : undefined,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [screenToFlowPosition, setNodes]);

  // ── Edges ─────────────────────────────────────────────────────
  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge({ ...conn, type: 'deletable', animated: true }, eds)),
    [setEdges]
  );

  // ── Node click ────────────────────────────────────────────────
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node as unknown as RFNode);
  }, []);

  // ── Guard: impede Delete key no nó start ──────────────────────
  const onNodesDelete = useCallback((deleted: Node[]) => {
    const hasStart = deleted.some((n) => n.type === 'start');
    if (hasStart) {
      // reinjeta o nó start se o React Flow tentar removê-lo
      setNodes((nds) => {
        const stillHasStart = nds.some((n) => n.type === 'start');
        if (stillHasStart) return nds;
        const original = deleted.find((n) => n.type === 'start')!;
        return [...nds, original as RFNode];
      });
    }
  }, [setNodes]);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  // ── Update / delete ───────────────────────────────────────────
  const updateNodeData = useCallback((id: string, patch: Partial<FlowNodeData>) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
    setSelectedNode((prev) => prev?.id === id ? { ...prev, data: { ...prev.data, ...patch } } : prev);
  }, [setNodes]);

  const deleteNode = useCallback((id: string) => {
    // O nó de início nunca pode ser excluído
    if (nodes.find((n) => n.id === id && n.type === 'start')) return;
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedNode(null);
  }, [nodes, setNodes, setEdges]);

  const duplicateNode = useCallback((id: string) => {
    const original = nodes.find((n) => n.id === id);
    if (!original || original.type === 'start') return;
    const newId   = `node_${Date.now()}`;
    const newNode = {
      ...original,
      id:       newId,
      position: { x: original.position.x + 60, y: original.position.y + 60 },
      data:     { ...original.data },
      selected: false,
    };
    setNodes((nds) => [...nds, newNode]);
    // Seleciona o nó duplicado para o usuário já poder editar
    setSelectedNode(newNode as unknown as RFNode);
  }, [nodes, setNodes]);

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = () => {
    onSave(
      nodes.map((n) => ({ id: n.id, type: (n.type ?? 'send_text') as NodeType, position: n.position, data: n.data })),
      edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: typeof e.label === 'string' ? e.label : undefined, sourceHandle: e.sourceHandle ?? undefined }))
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="font-semibold text-slate-800">{chatbot.name}</h2>
            <p className="text-xs text-slate-400">Arraste blocos para o canvas · Duplo clique = descrição · Delete = remover nó</p>
          </div>
        </div>
        <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition shadow-md">
          <Save size={15} />Salvar fluxo
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Palette sidebar ── */}
        <aside className="w-52 bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2.5 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Blocos</p>
          </div>

          {/* Description tooltip */}
          {descNode && (
            <div className={clsx('mx-2 mt-2 p-2.5 rounded-xl border', NODE_STYLES[descNode].bg, NODE_STYLES[descNode].border)}>
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-1.5 mb-1">
                  {React.createElement(NODE_STYLES[descNode].icon, { size: 13, className: NODE_STYLES[descNode].text })}
                  <span className={clsx('text-xs font-bold', NODE_STYLES[descNode].text)}>{NODE_STYLES[descNode].label}</span>
                </div>
                <button onClick={() => setDescNode(null)} className="shrink-0 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-snug">{NODE_DESCRIPTIONS[descNode]}</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {PALETTE_GROUPS.map((g) => (
              <PaletteGroup key={g.label} group={g} onDragStart={onDragStart} onDescribe={setDescNode} />
            ))}
          </div>

          <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400 leading-tight">
            <Info size={10} className="inline mr-1" />
            Arraste para o canvas. Duplo clique = info.
          </div>
        </aside>

        {/* ── Canvas ── */}
        <div className="flex-1 bg-white">
          <ReactFlow
            nodes={nodes as any}
            edges={edges}
            onNodesChange={onNodesChange as any}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodesDelete={onNodesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            deleteKeyCode="Delete"
            defaultEdgeOptions={{ type: 'deletable', animated: true, style: { stroke: '#2563eb', strokeWidth: 2 } }}
            style={{ background: '#ffffff' }}
          >
            <Controls className="!bg-white !rounded-xl !shadow-md !border !border-slate-200" />
            <MiniMap className="!bg-white !rounded-xl !shadow-md !border !border-slate-200" pannable zoomable />
          </ReactFlow>
        </div>

        {/* ── Config panel ── */}
        {selectedNode && selectedNode.type === 'integration_ai' && (
          <AiConfigModal
            node={selectedNode}
            availableVars={availableVars}
            knowledgeBases={knowledgeBases}
            onUpdate={(p) => updateNodeData(selectedNode.id, p)}
            onDelete={() => { deleteNode(selectedNode.id); setSelectedNode(null); }}
            onDuplicate={() => duplicateNode(selectedNode.id)}
            onClose={() => setSelectedNode(null)}
          />
        )}
        {selectedNode && selectedNode.type !== 'integration_ai' && (
          <NodeConfigPanel
            node={selectedNode}
            availableVars={availableVars}
            groups={groups}
            knowledgeBases={knowledgeBases}
            channels={channels}
            onUpdate={(p) => updateNodeData(selectedNode.id, p)}
            onDelete={() => deleteNode(selectedNode.id)}
            onDuplicate={() => duplicateNode(selectedNode.id)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NODE CONFIG PANEL
// ═══════════════════════════════════════════════════════════════
function NodeConfigPanel({ node, availableVars, groups, knowledgeBases, channels, onUpdate, onDelete, onDuplicate, onClose }: {
  node: RFNode;
  availableVars: string[];
  groups: import('../../types').AttendanceGroup[];
  knowledgeBases: KnowledgeBase[];
  channels: import('../../types').Channel[];
  onUpdate: (p: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const type     = node.type as NodeType;
  const style    = NODE_STYLES[type] ?? NODE_STYLES.send_text;
  const Icon     = style.icon;
  const d        = node.data;
  const isStart  = type === 'start';

  return (
    <aside className="w-72 bg-white border-l border-slate-200 flex flex-col overflow-hidden shrink-0">
      {/* Panel header */}
      <div className={clsx(
        'flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0',
        isStart ? 'bg-emerald-500' : style.bg,
      )}>
        <div className="flex items-center gap-2">
          <Icon size={15} className={isStart ? 'text-white' : style.text} />
          <span className={clsx('text-sm font-bold', isStart ? 'text-white' : style.text)}>{style.label}</span>
        </div>
        <div className="flex gap-1">
          {isStart ? (
            /* Nó de início não pode ser excluído nem duplicado */
            <div title="Este nó não pode ser removido" className="w-7 h-7 rounded-lg text-emerald-200 flex items-center justify-center cursor-not-allowed">
              <Lock size={13} />
            </div>
          ) : (
            <>
              <button onClick={onDuplicate} title="Duplicar nó" className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary-600 flex items-center justify-center transition">
                <Copy size={13} />
              </button>
              <button onClick={onDelete} title="Excluir nó" className="w-7 h-7 rounded-lg text-red-400 hover:bg-red-100 flex items-center justify-center transition">
                <Trash2 size={13} />
              </button>
            </>
          )}
          <button onClick={onClose} className={clsx('w-7 h-7 rounded-lg flex items-center justify-center transition', isStart ? 'text-emerald-100 hover:bg-emerald-600' : 'text-slate-400 hover:bg-slate-100')}>
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Description banner */}
        <div className={clsx('border rounded-xl p-2.5 mb-4', isStart ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200')}>
          <p className={clsx('text-xs leading-snug', isStart ? 'text-emerald-700' : 'text-slate-500')}>{NODE_DESCRIPTIONS[type]}</p>
        </div>

        {isStart && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-start gap-2">
            <Lock size={13} className="text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700">
              O nó <strong>Início</strong> é criado automaticamente e não pode ser excluído. Ele marca o ponto de entrada do fluxo.
            </p>
          </div>
        )}

        {/* Label (all nodes) */}
        <Fld label="Rótulo do nó">
          <input value={d.label} onChange={(e) => onUpdate({ label: e.target.value })} className="input" />
        </Fld>

        {/* ── Type-specific config ── */}
        {/* ENVIOS ─────────────────────────────────────────── */}
        {type === 'send_text' && (
          <Fld label="Mensagem - use {variavel} para inserir valores">
            <VarTextarea value={d.message ?? ''} onChange={(v) => onUpdate({ message: v })}
              rows={4} availableVars={availableVars} placeholder="Olá {nome}, como posso ajudar?" />
          </Fld>
        )}

        {type === 'send_buttons' && (
          <>
            <Fld label="Mensagem - use {variavel} para inserir valores">
              <VarTextarea value={d.message ?? ''} onChange={(v) => onUpdate({ message: v })}
                rows={3} availableVars={availableVars} />
            </Fld>
            <Fld label="Botões (até 3 - cada um cria um caminho de saída)">
              <div className="space-y-1.5">
                {(d.buttons ?? [{ label: '' }]).map((btn, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input value={btn.label}
                      onChange={(e) => {
                        const next = [...(d.buttons ?? [])];
                        next[i] = { label: e.target.value };
                        onUpdate({ buttons: next });
                      }}
                      className="input flex-1" placeholder={`Botão ${i + 1}`} />
                    {(d.buttons ?? []).length > 1 && (
                      <button onClick={() => {
                        const next = (d.buttons ?? []).filter((_, j) => j !== i);
                        onUpdate({ buttons: next });
                      }} className="w-8 h-8 rounded-lg text-red-400 hover:bg-red-50 flex items-center justify-center shrink-0">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {(d.buttons ?? []).length < 3 && (
                  <button onClick={() => onUpdate({ buttons: [...(d.buttons ?? []), { label: '' }] })}
                    className="w-full py-1.5 border border-dashed border-primary-300 text-primary-600 rounded-lg text-xs hover:bg-primary-50 transition flex items-center justify-center gap-1">
                    <Plus size={12} />Adicionar botão
                  </button>
                )}
              </div>
            </Fld>
          </>
        )}

        {type === 'send_menu' && (
          <>
            <Fld label="Mensagem do menu - use {variavel} para inserir valores">
              <VarTextarea value={d.message ?? ''} onChange={(v) => onUpdate({ message: v })}
                rows={3} availableVars={availableVars} placeholder="Escolha uma opção:" />
            </Fld>
            <Fld label="Opções do menu">
              <div className="space-y-1.5">
                {(d.menuItems ?? [{ label: '' }]).map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-5 text-xs text-slate-400 font-mono shrink-0">{i + 1}.</span>
                    <input value={item.label}
                      onChange={(e) => {
                        const next = [...(d.menuItems ?? [])];
                        next[i] = { label: e.target.value };
                        onUpdate({ menuItems: next });
                      }}
                      className="input flex-1" placeholder={`Opção ${i + 1}`} />
                    {(d.menuItems ?? []).length > 1 && (
                      <button onClick={() => onUpdate({ menuItems: (d.menuItems ?? []).filter((_, j) => j !== i) })}
                        className="w-7 h-7 rounded-lg text-red-400 hover:bg-red-50 flex items-center justify-center">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => onUpdate({ menuItems: [...(d.menuItems ?? []), { label: '' }] })}
                  className="w-full py-1.5 border border-dashed border-primary-300 text-primary-600 rounded-lg text-xs hover:bg-primary-50 transition flex items-center justify-center gap-1">
                  <Plus size={12} />Adicionar opção
                </button>
              </div>
            </Fld>
          </>
        )}

        {type === 'send_action_buttons' && (
          <>
            <Fld label="Mensagem">
              <VarTextarea value={d.message ?? ''} onChange={(v) => onUpdate({ message: v })}
                rows={2} availableVars={availableVars} placeholder="Escolha uma ação:" />
            </Fld>
            <Fld label="Botões de ação (o fluxo NÃO aguarda resposta)">
              <div className="space-y-2">
                {(d.actionButtons ?? [{ type: 'url', label: '', value: '' }]).map((btn, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-2 space-y-1.5 bg-slate-50">
                    <div className="flex gap-1.5 items-center">
                      <select
                        value={btn.type}
                        onChange={(e) => {
                          const next = [...(d.actionButtons ?? [])];
                          next[i] = { ...next[i], type: e.target.value as 'call' | 'url' };
                          onUpdate({ actionButtons: next });
                        }}
                        className="input w-28 text-xs"
                      >
                        <option value="url">🔗 Link</option>
                        <option value="call">📞 Ligação</option>
                      </select>
                      {(d.actionButtons ?? []).length > 1 && (
                        <button onClick={() => onUpdate({ actionButtons: (d.actionButtons ?? []).filter((_, j) => j !== i) })}
                          className="w-7 h-7 rounded text-red-400 hover:bg-red-50 flex items-center justify-center ml-auto">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <input value={btn.label}
                      onChange={(e) => { const next = [...(d.actionButtons ?? [])]; next[i] = { ...next[i], label: e.target.value }; onUpdate({ actionButtons: next }); }}
                      className="input text-xs" placeholder="Texto do botão (ex: Ligar agora)" />
                    <input value={btn.value}
                      onChange={(e) => { const next = [...(d.actionButtons ?? [])]; next[i] = { ...next[i], value: e.target.value }; onUpdate({ actionButtons: next }); }}
                      className="input text-xs font-mono" placeholder={btn.type === 'call' ? '+5511999999999' : 'https://exemplo.com'} />
                  </div>
                ))}
                {(d.actionButtons ?? []).length < 3 && (
                  <button onClick={() => onUpdate({ actionButtons: [...(d.actionButtons ?? []), { type: 'url', label: '', value: '' }] })}
                    className="w-full py-1.5 border border-dashed border-primary-300 text-primary-600 rounded-lg text-xs hover:bg-primary-50 flex items-center justify-center gap-1">
                    <Plus size={12} />Adicionar botão
                  </button>
                )}
              </div>
            </Fld>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 text-xs text-blue-700">
              <span className="font-semibold">Exclusivo WhatsApp Chip.</span> O fluxo avança imediatamente após o envio, sem aguardar clique.
            </div>
          </>
        )}

        {type === 'send_list_buttons' && (
          <>
            <Fld label="Mensagem do menu - use {variavel} para inserir valores">
              <VarTextarea value={d.message ?? ''} onChange={(v) => onUpdate({ message: v })}
                rows={3} availableVars={availableVars} placeholder="Escolha uma opção:" />
            </Fld>
            <Fld label="Opções com descrição">
              <div className="space-y-1.5">
                {(d.menuItems ?? [{ label: '', description: '' }]).map((item, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                    <div className="flex gap-1.5 items-center">
                      <span className="w-5 text-xs text-slate-400 font-mono shrink-0">{i + 1}.</span>
                      <input value={item.label}
                        onChange={(e) => { const next = [...(d.menuItems ?? [])]; next[i] = { ...next[i], label: e.target.value }; onUpdate({ menuItems: next }); }}
                        className="input flex-1 text-xs" placeholder={`Título da opção ${i + 1}`} />
                      {(d.menuItems ?? []).length > 1 && (
                        <button onClick={() => onUpdate({ menuItems: (d.menuItems ?? []).filter((_, j) => j !== i) })}
                          className="w-7 h-7 rounded text-red-400 hover:bg-red-50 flex items-center justify-center">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <input value={item.description ?? ''}
                      onChange={(e) => { const next = [...(d.menuItems ?? [])]; next[i] = { ...next[i], description: e.target.value }; onUpdate({ menuItems: next }); }}
                      className="input text-xs text-slate-500" placeholder="Descrição breve (opcional)" />
                  </div>
                ))}
                <button onClick={() => onUpdate({ menuItems: [...(d.menuItems ?? []), { label: '', description: '' }] })}
                  className="w-full py-1.5 border border-dashed border-primary-300 text-primary-600 rounded-lg text-xs hover:bg-primary-50 flex items-center justify-center gap-1">
                  <Plus size={12} />Adicionar opção
                </button>
              </div>
            </Fld>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 text-xs text-blue-700">
              <span className="font-semibold">Exclusivo WhatsApp Chip.</span> Cada opção cria um caminho de saída no fluxo.
            </div>
          </>
        )}

        {['send_image','send_audio','send_file','send_video'].includes(type) && (
          <>
            <Fld label="URL da mídia">
              <input value={d.mediaUrl ?? ''} onChange={(e) => onUpdate({ mediaUrl: e.target.value })}
                className="input" placeholder="https://exemplo.com/arquivo.mp4" />
            </Fld>
            <Fld label="Legenda (opcional)">
              <input value={d.caption ?? ''} onChange={(e) => onUpdate({ caption: e.target.value })}
                className="input" />
            </Fld>
          </>
        )}

        {/* Delay - compartilhado entre todos os nós de envio */}
        {type.startsWith('send_') && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Fld label="Delay antes de enviar (segundos)">
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={300} step={1}
                  value={d.delaySeconds ?? 0}
                  onChange={(e) => onUpdate({ delaySeconds: Math.max(0, Number(e.target.value)) })}
                  className="input w-24"
                />
                <span className="text-xs text-slate-400">
                  {Number(d.delaySeconds) > 0
                    ? `O bot aguarda ${d.delaySeconds}s antes de enviar esta mensagem`
                    : 'Sem delay (envio imediato)'}
                </span>
              </div>
            </Fld>
            {Number(d.delaySeconds) > 0 && (
              <div className="flex items-center gap-1.5 mt-1 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-600">
                <Clock size={11} />
                Simula tempo de digitação entre mensagens.
              </div>
            )}
          </div>
        )}

        {/* ENTRADAS ───────────────────────────────────────── */}
        {type.startsWith('input_') && (
          <>
            <Fld label="Mensagem de solicitação - use {variavel} para personalizar">
              <VarTextarea value={d.message ?? ''} onChange={(v) => onUpdate({ message: v })}
                rows={3} availableVars={availableVars} placeholder="Por favor, informe seu..." />
            </Fld>
            <Fld label="Salvar em variável">
              <input value={d.variable ?? ''} onChange={(e) => onUpdate({ variable: e.target.value })}
                className="input font-mono" placeholder="ex: nome_cliente" />
            </Fld>
            {!['input_image','input_file','input_audio','input_video','input_location','input_text'].includes(type) && (
              <Fld label="Mensagem de erro (validação falha)">
                <input value={d.errorMessage ?? ''} onChange={(e) => onUpdate({ errorMessage: e.target.value })}
                  className="input" placeholder="Valor inválido. Tente novamente." />
              </Fld>
            )}
            {!['input_image','input_file','input_audio','input_video','input_location','input_text'].includes(type) && (
              <Fld label="Máx. tentativas">
                <input type="number" min={1} max={10} value={d.maxRetries ?? 3}
                  onChange={(e) => onUpdate({ maxRetries: Number(e.target.value) })}
                  className="input w-24" />
              </Fld>
            )}
            {type === 'input_custom' && (
              <Fld label="Expressão regular (regex)">
                <input value={d.validationRegex ?? ''} onChange={(e) => onUpdate({ validationRegex: e.target.value })}
                  className="input font-mono" placeholder="^[A-Za-z]+$" />
              </Fld>
            )}
          </>
        )}

        {/* INTEGRAÇÕES ─────────────────────────────────────── */}
        {type === 'integration_ai' && <AiPanel d={d} onUpdate={onUpdate} availableVars={availableVars} knowledgeBases={knowledgeBases} />}
        {type === 'integration_api' && <ApiPanel d={d} onUpdate={onUpdate} availableVars={availableVars} />}
        {type === 'integration_webhook' && <WebhookPanel d={d} onUpdate={onUpdate} availableVars={availableVars} />}
        {type === 'integration_email' && (
          <>
            <Fld label="Para (endereço de e-mail)">
              <input value={d.emailTo ?? ''} onChange={(e) => onUpdate({ emailTo: e.target.value })}
                className="input" placeholder="destinatario@exemplo.com ou {{var_email}}" />
            </Fld>
            <Fld label="Assunto">
              <input value={d.emailSubject ?? ''} onChange={(e) => onUpdate({ emailSubject: e.target.value })}
                className="input" />
            </Fld>
            <Fld label="Corpo do e-mail - use {variavel} para personalizar">
              <VarTextarea value={d.emailBody ?? ''} onChange={(v) => onUpdate({ emailBody: v })}
                rows={4} availableVars={availableVars} />
            </Fld>
          </>
        )}

        {/* LÓGICA ─────────────────────────────────────────── */}
        {type === 'logic_variable' && (
          <>
            <Fld label="Nome da variável">
              <input value={d.variable ?? ''} onChange={(e) => onUpdate({ variable: e.target.value })}
                className="input font-mono" placeholder="ex: nome_cliente" />
            </Fld>
            <Fld label="Valor">
              <input value={d.varValue ?? ''} onChange={(e) => onUpdate({ varValue: e.target.value })}
                className="input" placeholder='ex: "fixo" ou {{outra_var}}' />
            </Fld>
          </>
        )}
        {type === 'logic_decision' && (() => {
          const conds: DecisionCondition[] = Array.isArray(d.conditions) ? (d.conditions as DecisionCondition[]) : [];
          const setConds = (next: DecisionCondition[]) => onUpdate({ conditions: next });
          const addCond  = () => setConds([...conds, { label: `Caminho ${conds.length + 1}`, condition: '' }]);
          const delCond  = (i: number) => setConds(conds.filter((_, idx) => idx !== i));
          const updCond  = (i: number, patch: Partial<DecisionCondition>) =>
            setConds(conds.map((c, idx) => idx === i ? { ...c, ...patch } : c));

          return (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-600">Condições</span>
                <button type="button" onClick={addCond}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition">
                  <Plus size={11} /> Adicionar
                </button>
              </div>

              {conds.length === 0 && (
                <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 mb-3 text-center">
                  Nenhuma condição. Clique em <span className="font-medium text-primary-600">+ Adicionar</span> para criar caminhos nomeados.<br />
                  <span className="text-[10px]">Sem condições, o nó mantém o comportamento binário (Verdadeiro / Falso).</span>
                </div>
              )}

              <div className="space-y-3 mb-3">
                {conds.map((c, i) => (
                  <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                        Caminho {i + 1} - handle <code className="bg-amber-100 px-1 rounded">cond-{i}</code>
                      </span>
                      <button type="button" onClick={() => delCond(i)}
                        className="w-6 h-6 rounded-md text-red-400 hover:bg-red-100 flex items-center justify-center transition shrink-0">
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <Fld label="Nome do caminho">
                      <input
                        value={c.label}
                        onChange={(e) => updCond(i, { label: e.target.value })}
                        className="input"
                        placeholder={`ex: Cliente VIP, Opção 1, Não respondeu…`}
                      />
                    </Fld>
                    <Fld label="Condição - digite { para variáveis">
                      <VarInput
                        value={c.condition}
                        onChange={(v) => updCond(i, { condition: v })}
                        availableVars={availableVars}
                        placeholder="ex: {resposta} == '1'"
                      />
                    </Fld>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 space-y-1 text-[10px] text-amber-700">
                <p className="font-semibold text-xs">Como funciona</p>
                <p>As condições são avaliadas <strong>de cima para baixo</strong>. O fluxo segue pelo primeiro caminho cuja condição for verdadeira.</p>
                <p className="font-medium pt-1 border-t border-amber-200">Exemplos:</p>
                <p className="font-mono">{'{resposta}'} == '1'</p>
                <p className="font-mono">{'{valor}'} &gt; 100</p>
                <p className="font-mono">{'{nome}'}.includes('João')</p>
              </div>
            </>
          );
        })()}
        {type === 'logic_timer' && (
          <>
            <Fld label="Tempo limite (segundos)">
              <input type="number" min={1} value={d.timerSeconds ?? 30}
                onChange={(e) => onUpdate({ timerSeconds: Number(e.target.value) })}
                className="input w-28" />
            </Fld>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 space-y-1 text-xs text-amber-700">
              <p><span className="font-semibold">→ Direita superior:</span> Respondeu (dentro do prazo)</p>
              <p><span className="font-semibold">→ Direita inferior:</span> Tempo esgotado (sem resposta)</p>
              <p className="text-[10px] text-amber-500 mt-1">O bot aguarda resposta do cliente. Se o tempo expirar sem mensagem, o fluxo segue pelo caminho de timeout.</p>
            </div>
          </>
        )}
        {type === 'logic_suspend' && (
          <Fld label="Descrição (o que aguardar)">
            <VarTextarea value={d.message ?? ''} onChange={(v) => onUpdate({ message: v })}
              rows={2} availableVars={availableVars} placeholder="ex: Confirmação de pagamento" />
          </Fld>
        )}
        {type === 'logic_business_hours' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Fld label="Início"><input type="time" value={d.bhStart ?? '09:00'} onChange={(e) => onUpdate({ bhStart: e.target.value })} className="input" /></Fld>
              <Fld label="Fim"><input type="time" value={d.bhEnd ?? '18:00'} onChange={(e) => onUpdate({ bhEnd: e.target.value })} className="input" /></Fld>
            </div>
            <Fld label="Dias da semana">
              <div className="flex flex-wrap gap-1">
                {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((day, i) => {
                  const active = (d.bhDays ?? [1,2,3,4,5]).includes(i);
                  return (
                    <button key={i} type="button"
                      onClick={() => {
                        const days = d.bhDays ?? [1,2,3,4,5];
                        onUpdate({ bhDays: active ? days.filter((d) => d !== i) : [...days, i] });
                      }}
                      className={clsx('px-2 py-0.5 rounded-md text-xs font-medium transition', active ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </Fld>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 space-y-1 text-xs text-amber-700">
              <p><span className="font-semibold">→ Direita:</span> Dentro do horário</p>
              <p><span className="font-semibold">← Esquerda:</span> Fora do horário</p>
            </div>
          </>
        )}
        {type === 'logic_list_lookup' && (
          <>
            <Fld label="Nome da lista">
              <input value={d.listName ?? ''} onChange={(e) => onUpdate({ listName: e.target.value })}
                className="input" placeholder="nome_da_lista" />
            </Fld>
            <Fld label="Valor a buscar">
              <input value={d.listSearchValue ?? ''} onChange={(e) => onUpdate({ listSearchValue: e.target.value })}
                className="input font-mono" placeholder="{{variavel}}" />
            </Fld>
            <Fld label="Salvar resultado em variável">
              <input value={d.variable ?? ''} onChange={(e) => onUpdate({ variable: e.target.value })}
                className="input font-mono" placeholder="ex: item_encontrado" />
            </Fld>
          </>
        )}
        {type === 'logic_protocol' && (
          <>
            <Fld label="Prefixo do protocolo (opcional)">
              <input value={d.protocolPrefix ?? ''} onChange={(e) => onUpdate({ protocolPrefix: e.target.value })}
                className="input" placeholder="ex: ATD ou SUP" />
            </Fld>
            <Fld label="Salvar protocolo em variável">
              <input value={d.variable ?? ''} onChange={(e) => onUpdate({ variable: e.target.value })}
                className="input font-mono" placeholder="ex: numero_protocolo" />
            </Fld>
          </>
        )}

        {/* AÇÕES ───────────────────────────────────────────── */}
        {type === 'action_forward' && (
          <ForwardPanel d={d} onUpdate={onUpdate} availableVars={availableVars} channels={channels} />
        )}

        {/* TERMINAÇÕES ─────────────────────────────────────── */}
        {type === 'end_handoff' && (
          <>
            <Fld label="Grupo de atendimento">
              <select
                value={d.handoffGroupId ?? ''}
                onChange={(e) => onUpdate({ handoffGroupId: e.target.value || undefined })}
                className="input"
              >
                <option value=""> -  Sem grupo (fila geral)  - </option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {groups.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Crie grupos em Configurações → Grupos de atend.</p>
              )}
            </Fld>
            <Fld label="Mensagem ao transferir (opcional)">
              <textarea value={d.handoffMessage ?? ''} onChange={(e) => onUpdate({ handoffMessage: e.target.value })}
                rows={3} className="input resize-none" placeholder="Em breve um operador irá atendê-lo..." />
            </Fld>
          </>
        )}
        {type === 'end_finish' && (
          <Fld label="Mensagem de encerramento - use {variavel} para personalizar">
            <VarTextarea value={d.message ?? ''} onChange={(v) => onUpdate({ message: v })}
              rows={3} availableVars={availableVars} placeholder="Obrigado pelo contato, {nome}! Até mais." />
          </Fld>
        )}

        {/* ── Etiqueta de caminho (opcional - blocos de envio) ── */}
        {type.startsWith('send_') && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <Fld label="Etiqueta de caminho (opcional)">
              <input
                value={(d.pathLabel as string) ?? ''}
                onChange={(e) => onUpdate({ pathLabel: e.target.value || undefined })}
                className="input"
                placeholder="ex: Cliente VIP, Fora do horário, Opção 2…"
              />
            </Fld>
            <p className="text-[10px] text-slate-400 -mt-2">
              Identifica visualmente a qual caminho de decisão este bloco pertence. Não afeta a execução.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Webhook panel ───────────────────────────────────────────────────────────
function WebhookPanel({ d, onUpdate, availableVars }: { d: FlowNodeData; onUpdate: (p: Partial<FlowNodeData>) => void; availableVars: string[] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Fld label="Método">
          <select value={d.webhookMethod ?? 'POST'} onChange={(e) => onUpdate({ webhookMethod: e.target.value as FlowNodeData['webhookMethod'] })} className="input">
            {['POST','GET','PUT','PATCH'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Fld>
        <div className="col-span-2">
          <Fld label="URL do servidor">
            <input value={d.webhookUrl ?? ''} onChange={(e) => onUpdate({ webhookUrl: e.target.value })} className="input font-mono text-xs" placeholder="https://servidor.com/webhook" />
          </Fld>
        </div>
      </div>
      <Fld label="Body (JSON) - use {variavel} para dados dinâmicos">
        <VarTextarea value={d.webhookBody ?? ''} onChange={(v) => onUpdate({ webhookBody: v })}
          rows={4} availableVars={availableVars} placeholder={'{\n  "telefone": "{telefone}",\n  "nome": "{nome}"\n}'} />
      </Fld>
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-2 text-xs text-violet-700">
        Os dados são enviados em segundo plano. O fluxo continua independente da resposta do servidor.
      </div>
    </div>
  );
}

// ─── Forward panel ───────────────────────────────────────────────────────────
function ForwardPanel({ d, onUpdate, availableVars, channels }: {
  d: FlowNodeData;
  onUpdate: (p: Partial<FlowNodeData>) => void;
  availableVars: string[];
  channels: import('../../types').Channel[];
}) {
  const mode = d.forwardMode ?? 'last_input';
  const activeChannels = channels.filter(c => c.status === 'active' && c.connectionType === 'qrcode');

  return (
    <div className="space-y-3">
      {/* Canal de envio */}
      <Fld label="Canal de envio">
        <select
          value={d.forwardChannelId ?? ''}
          onChange={(e) => onUpdate({ forwardChannelId: e.target.value || undefined })}
          className="input"
        >
          <option value=""> -  Mesmo canal da conversa atual  - </option>
          {activeChannels.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {activeChannels.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">Nenhum canal WhatsApp Chip ativo encontrado.</p>
        )}
      </Fld>

      {/* Número de destino */}
      <Fld label="Número de destino (com DDI) - use {variavel} se necessário">
        <VarTextarea
          value={d.forwardTo ?? ''}
          onChange={(v) => onUpdate({ forwardTo: v })}
          rows={1}
          availableVars={availableVars}
          placeholder="ex: 5511999887766 ou {numero_destino}"
        />
        <p className="text-xs text-slate-400 mt-1">Somente dígitos + DDI (sem +, espaços ou traços).</p>
      </Fld>

      {/* Prefixo opcional */}
      <Fld label="Prefixo da mensagem (opcional) - use {variavel} para personalizar">
        <VarTextarea
          value={d.forwardPrefix ?? ''}
          onChange={(v) => onUpdate({ forwardPrefix: v })}
          rows={2}
          availableVars={availableVars}
          placeholder="ex: 📩 Mensagem de {contact_name}:"
        />
      </Fld>

      {/* O que enviar */}
      <Fld label="O que encaminhar">
        <select
          value={mode}
          onChange={(e) => onUpdate({ forwardMode: e.target.value as FlowNodeData['forwardMode'] })}
          className="input"
        >
          <option value="last_input">Última mensagem do cliente</option>
          <option value="variable">Conteúdo de uma variável</option>
          <option value="custom">Texto personalizado</option>
        </select>
      </Fld>

      {mode === 'variable' && (
        <Fld label="Variável a encaminhar">
          <select
            value={d.forwardVariable ?? ''}
            onChange={(e) => onUpdate({ forwardVariable: e.target.value })}
            className="input font-mono"
          >
            <option value=""> -  Selecione uma variável  - </option>
            {availableVars.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {availableVars.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">Nenhuma variável declarada no fluxo ainda.</p>
          )}
        </Fld>
      )}

      {mode === 'custom' && (
        <Fld label="Texto a encaminhar - use {variavel} para valores dinâmicos">
          <VarTextarea
            value={d.forwardCustomText ?? ''}
            onChange={(v) => onUpdate({ forwardCustomText: v })}
            rows={3}
            availableVars={availableVars}
            placeholder="ex: Novo pedido de {contact_name}: {descricao}"
          />
        </Fld>
      )}

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 text-xs text-indigo-700 flex items-start gap-2">
        <Forward size={13} className="shrink-0 mt-0.5" />
        <span>
          O fluxo continua normalmente após o encaminhamento. O cliente não recebe nenhuma mensagem neste nó.
        </span>
      </div>
    </div>
  );
}

// ─── API panel ───────────────────────────────────────────────────────────────
function ApiPanel({ d, onUpdate, availableVars }: { d: FlowNodeData; onUpdate: (p: Partial<FlowNodeData>) => void; availableVars: string[] }) {
  const api: ApiCallData = (d.apiCall as ApiCallData) ?? { url: '', method: 'GET', headers: [], body: '', responseVar: '' };
  const set = (p: Partial<ApiCallData>) => onUpdate({ apiCall: { ...api, ...p } });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Fld label="Método">
          <select value={api.method} onChange={(e) => set({ method: e.target.value as ApiCallData['method'] })} className="input">
            {['GET','POST','PUT','PATCH','DELETE'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Fld>
        <div className="col-span-2">
          <Fld label="URL">
            <input value={api.url} onChange={(e) => set({ url: e.target.value })} className="input font-mono text-xs" placeholder="https://api.exemplo.com" />
          </Fld>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-600">Headers</span>
          <button onClick={() => set({ headers: [...api.headers, { key: '', value: '' }] })}
            className="text-xs text-primary-600 flex items-center gap-0.5 hover:underline"><Plus size={11} />Add</button>
        </div>
        {api.headers.map((h, i) => (
          <div key={i} className="flex gap-1 mb-1">
            <input value={h.key} onChange={(e) => { const hs = [...api.headers]; hs[i] = { ...hs[i], key: e.target.value }; set({ headers: hs }); }} className="input text-xs font-mono flex-1" placeholder="Key" />
            <input value={h.value} onChange={(e) => { const hs = [...api.headers]; hs[i] = { ...hs[i], value: e.target.value }; set({ headers: hs }); }} className="input text-xs font-mono flex-1" placeholder="Value" />
            <button onClick={() => set({ headers: api.headers.filter((_, j) => j !== i) })} className="w-7 h-8 text-red-400 flex items-center justify-center"><X size={11} /></button>
          </div>
        ))}
      </div>
      {['POST','PUT','PATCH'].includes(api.method) && (
        <Fld label="Body (JSON) - use {variavel} para valores dinâmicos">
          <VarTextarea value={api.body} onChange={(v) => set({ body: v })} rows={3}
            availableVars={availableVars} placeholder={'{ "campo": "{variavel}" }'} />
        </Fld>
      )}
      <Fld label="Salvar resposta em variável">
        <input value={api.responseVar} onChange={(e) => set({ responseVar: e.target.value })} className="input font-mono" placeholder="ex: api_retorno" />
      </Fld>
    </div>
  );
}

// ─── AI models por provedor ───────────────────────────────────────────────────
const AI_MODELS: Record<AiProvider, string[]> = {
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  gemini:    ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'],
  mcp:       ['mcp-default'],
  custom:    ['custom'],
};

// ─── AI config modal (pop-up amplo para integração IA) ───────────────────────
function AiConfigModal({ node, availableVars, knowledgeBases, onUpdate, onDelete, onDuplicate, onClose }: {
  node: RFNode;
  availableVars: string[];
  knowledgeBases: KnowledgeBase[];
  onUpdate: (p: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const d     = node.data;
  const style = NODE_STYLES['integration_ai'] ?? NODE_STYLES.send_text;
  const Icon  = style.icon;

  const prov        = (d.aiProvider ?? 'openai') as AiProvider;
  const selectedKBs = (d.aiKnowledgeBaseIds ?? []) as string[];
  const memoryTurns = d.aiMemoryTurns ?? 5;

  const toggleKB = (id: string) => {
    const next = selectedKBs.includes(id)
      ? selectedKBs.filter(k => k !== id)
      : [...selectedKBs, id];
    onUpdate({ aiKnowledgeBaseIds: next });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Cabeçalho */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0 ${style.bg}`}>
          <div className="flex items-center gap-2">
            <Icon size={16} className={style.text} />
            <span className={`text-sm font-bold ${style.text}`}>{style.label}</span>
          </div>
          <div className="flex gap-1">
            <button onClick={onDuplicate} title="Duplicar nó" className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary-600 flex items-center justify-center transition">
              <Copy size={13} />
            </button>
            <button onClick={onDelete} title="Excluir nó" className="w-7 h-7 rounded-lg text-red-400 hover:bg-red-100 flex items-center justify-center transition">
              <Trash2 size={13} />
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center transition">
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Corpo com scroll */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Banner descrição */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500 leading-snug">{NODE_DESCRIPTIONS['integration_ai']}</p>
          </div>

          {/* Linha 1: Rótulo + Provedor/API/Modelo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <Fld label="Rótulo do nó">
                <input value={d.label} onChange={(e) => onUpdate({ label: e.target.value })} className="input" />
              </Fld>
              <Fld label="Provedor">
                <select value={prov}
                  onChange={(e) => onUpdate({ aiProvider: e.target.value as AiProvider, aiModel: AI_MODELS[e.target.value as AiProvider][0] })}
                  className="input">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="mcp">MCP Server</option>
                  <option value="custom">API Customizada</option>
                </select>
              </Fld>
              {prov === 'mcp' ? (
                <Fld label="URL do MCP Server">
                  <input value={d.aiMcpUrl ?? ''} onChange={(e) => onUpdate({ aiMcpUrl: e.target.value })}
                    className="input font-mono text-xs" placeholder="https://mcp.exemplo.com" />
                </Fld>
              ) : (
                <>
                  <Fld label={prov === 'gemini' ? 'API Key (Google AI Studio)' : 'API Key'}>
                    <input type="password" value={d.aiApiKey ?? ''} onChange={(e) => onUpdate({ aiApiKey: e.target.value })}
                      className="input font-mono text-xs" placeholder={prov === 'gemini' ? 'AIzaSy...' : 'sk-...'} />
                  </Fld>
                  <Fld label="Modelo">
                    <select value={d.aiModel ?? AI_MODELS[prov][0]}
                      onChange={(e) => onUpdate({ aiModel: e.target.value })} className="input">
                      {AI_MODELS[prov].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Fld>
                </>
              )}
              <Fld label="Salvar resposta em variável">
                <input value={d.variable ?? ''} onChange={(e) => onUpdate({ variable: e.target.value })}
                  className="input font-mono" placeholder="ex: ai_resposta" />
              </Fld>
            </div>

            <div className="space-y-3">
              {/* Bases de conhecimento */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Bases de Conhecimento</p>
                {knowledgeBases.length === 0 ? (
                  <div className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    Nenhuma base criada. Acesse <span className="font-medium text-primary-600">Chatbot → Bases de Conhec.</span> para criar.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {knowledgeBases.map(kb => {
                      const active = selectedKBs.includes(kb.id);
                      return (
                        <label key={kb.id} className={clsx(
                          'flex items-start gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition',
                          active ? 'bg-primary-50 border-primary-200' : 'bg-white border-slate-100 hover:border-slate-200'
                        )}>
                          <input type="checkbox" checked={active} onChange={() => toggleKB(kb.id)}
                            className="mt-0.5 accent-primary-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className={clsx('text-xs font-medium truncate', active ? 'text-primary-700' : 'text-slate-700')}>{kb.name}</p>
                            {kb.description && <p className="text-[10px] text-slate-400 truncate">{kb.description}</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                {selectedKBs.length > 0 && (
                  <p className="text-[10px] text-primary-600 mt-1.5">
                    {selectedKBs.length} base{selectedKBs.length > 1 ? 's' : ''} vinculada{selectedKBs.length > 1 ? 's' : ''} - a IA consultará antes de responder.
                  </p>
                )}
              </div>

              {/* Memória */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Memória do Agente</p>
                <Fld label="Turnos de memória (pares pergunta/resposta)">
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={20} step={1} value={Number(memoryTurns)}
                      onChange={(e) => onUpdate({ aiMemoryTurns: Number(e.target.value) })}
                      className="flex-1 accent-primary-600" />
                    <span className="text-sm font-semibold text-slate-700 w-8 text-center">
                      {Number(memoryTurns) === 0 ? ' - ' : Number(memoryTurns)}
                    </span>
                  </div>
                </Fld>
                <p className="text-[10px] text-slate-400 mt-1">
                  {Number(memoryTurns) === 0
                    ? 'Sem memória - cada mensagem é independente.'
                    : `A IA lembra dos últimos ${memoryTurns} pares de pergunta/resposta da conversa.`}
                </p>
              </div>
            </div>
          </div>

          {/* System Prompt - campo grande */}
          <Fld label="System prompt">
            <VarTextarea value={d.aiSystemPrompt ?? ''} onChange={(v) => onUpdate({ aiSystemPrompt: v })}
              rows={10} availableVars={availableVars} placeholder="Você é um assistente útil..." />
          </Fld>

          {/* Mensagem do usuário */}
          <Fld label="Mensagem do usuário - use {variavel} para contexto">
            <VarTextarea value={d.aiUserMessage ?? ''} onChange={(v) => onUpdate({ aiUserMessage: v })}
              rows={4} availableVars={availableVars} placeholder="{resposta_usuario}" />
          </Fld>

        </div>

        {/* Rodapé */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-100 flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI panel (usado na aba lateral para outros contextos) ───────────────────
function AiPanel({ d, onUpdate, availableVars, knowledgeBases }: {
  d: FlowNodeData;
  onUpdate: (p: Partial<FlowNodeData>) => void;
  availableVars: string[];
  knowledgeBases: KnowledgeBase[];
}) {
  const prov        = (d.aiProvider ?? 'openai') as AiProvider;
  const selectedKBs = (d.aiKnowledgeBaseIds ?? []) as string[];
  const memoryTurns = d.aiMemoryTurns ?? 5;
  const imageLib    = (d.imageLibrary ?? []) as ImageLibraryEntry[];

  // ── Estado local do formulário de nova imagem ──
  const [newImgName,    setNewImgName]    = useState('');
  const [newImgUrl,     setNewImgUrl]     = useState('');
  const [newImgCaption, setNewImgCaption] = useState('');
  const [imgFormOpen,   setImgFormOpen]   = useState(false);

  const toggleKB = (id: string) => {
    const next = selectedKBs.includes(id)
      ? selectedKBs.filter(k => k !== id)
      : [...selectedKBs, id];
    onUpdate({ aiKnowledgeBaseIds: next });
  };

  const addImage = () => {
    const slug = newImgName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!slug || !newImgUrl.trim()) return;
    if (imageLib.some(i => i.name === slug)) { alert(`Já existe uma imagem com o nome "${slug}".`); return; }
    const entry: ImageLibraryEntry = {
      id:      `img_${Date.now()}`,
      name:    slug,
      url:     newImgUrl.trim(),
      caption: newImgCaption.trim() || undefined,
    };
    onUpdate({ imageLibrary: [...imageLib, entry] });
    setNewImgName(''); setNewImgUrl(''); setNewImgCaption(''); setImgFormOpen(false);
  };

  const removeImage = (id: string) => {
    onUpdate({ imageLibrary: imageLib.filter(i => i.id !== id) });
  };

  return (
    <div className="space-y-3">
      {/* Provedor */}
      <Fld label="Provedor">
        <select value={prov} onChange={(e) => onUpdate({ aiProvider: e.target.value as AiProvider, aiModel: AI_MODELS[e.target.value as AiProvider][0] })} className="input">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="gemini">Google Gemini</option>
          <option value="mcp">MCP Server</option>
          <option value="custom">API Customizada</option>
        </select>
      </Fld>

      {prov === 'mcp' ? (
        <Fld label="URL do MCP Server">
          <input value={d.aiMcpUrl ?? ''} onChange={(e) => onUpdate({ aiMcpUrl: e.target.value })} className="input font-mono text-xs" placeholder="https://mcp.exemplo.com" />
        </Fld>
      ) : (
        <>
          <Fld label={prov === 'gemini' ? 'API Key (Google AI Studio)' : 'API Key'}>
            <input type="password" value={d.aiApiKey ?? ''} onChange={(e) => onUpdate({ aiApiKey: e.target.value })} className="input font-mono text-xs"
              placeholder={prov === 'gemini' ? 'AIzaSy...' : 'sk-...'} />
          </Fld>
          <Fld label="Modelo">
            <select value={d.aiModel ?? AI_MODELS[prov][0]} onChange={(e) => onUpdate({ aiModel: e.target.value })} className="input">
              {AI_MODELS[prov].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Fld>
        </>
      )}

      {/* System prompt */}
      <Fld label="System prompt">
        <VarTextarea value={d.aiSystemPrompt ?? ''} onChange={(v) => onUpdate({ aiSystemPrompt: v })}
          rows={3} availableVars={availableVars} placeholder="Você é um assistente útil..." />
      </Fld>

      {/* Mensagem do usuário */}
      <Fld label="Mensagem do usuário - use {variavel} para contexto">
        <VarTextarea value={d.aiUserMessage ?? ''} onChange={(v) => onUpdate({ aiUserMessage: v })}
          rows={2} availableVars={availableVars} placeholder="{resposta_usuario}" />
      </Fld>

      {/* Bases de conhecimento */}
      <div className="pt-1 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Bases de Conhecimento</p>
        {knowledgeBases.length === 0 ? (
          <div className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            Nenhuma base criada. Acesse <span className="font-medium text-primary-600">Chatbot → Bases de Conhec.</span> para criar.
          </div>
        ) : (
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {knowledgeBases.map(kb => {
              const active = selectedKBs.includes(kb.id);
              return (
                <label key={kb.id} className={clsx(
                  'flex items-start gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition',
                  active ? 'bg-primary-50 border-primary-200' : 'bg-white border-slate-100 hover:border-slate-200'
                )}>
                  <input type="checkbox" checked={active} onChange={() => toggleKB(kb.id)}
                    className="mt-0.5 accent-primary-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-xs font-medium truncate', active ? 'text-primary-700' : 'text-slate-700')}>{kb.name}</p>
                    {kb.description && <p className="text-[10px] text-slate-400 truncate">{kb.description}</p>}
                  </div>
                </label>
              );
            })}
          </div>
        )}
        {selectedKBs.length > 0 && (
          <p className="text-[10px] text-primary-600 mt-1.5">
            {selectedKBs.length} base{selectedKBs.length > 1 ? 's' : ''} vinculada{selectedKBs.length > 1 ? 's' : ''} - a IA consultará antes de responder.
          </p>
        )}
      </div>

      {/* Memória do agente */}
      <div className="pt-1 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Memória do Agente</p>
        <Fld label="Turnos de memória (pares pergunta/resposta)">
          <div className="flex items-center gap-3">
            <input
              type="range" min={0} max={20} step={1}
              value={Number(memoryTurns)}
              onChange={(e) => onUpdate({ aiMemoryTurns: Number(e.target.value) })}
              className="flex-1 accent-primary-600"
            />
            <span className="text-sm font-semibold text-slate-700 w-8 text-center">
              {Number(memoryTurns) === 0 ? ' - ' : Number(memoryTurns)}
            </span>
          </div>
        </Fld>
        <p className="text-[10px] text-slate-400 mt-1">
          {Number(memoryTurns) === 0
            ? 'Sem memória - cada mensagem é independente.'
            : `A IA lembra dos últimos ${memoryTurns} pares de pergunta/resposta da conversa.`}
        </p>
      </div>

      {/* ── Foto do produto (KB) ── */}
      <div className="pt-1 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Foto do Produto (Base de Conhecimento)</p>
        <Fld label="Legenda enviada junto com a foto">
          <input
            value={d.fotoProdutoCaption as string ?? ''}
            onChange={(e) => onUpdate({ fotoProdutoCaption: e.target.value })}
            className="input text-xs"
            placeholder="Seria esse mesmo, certo?"
          />
        </Fld>
        <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
          Adicione <code className="bg-slate-100 px-1 rounded">foto: https://...</code> em cada produto na base de conhecimento.
          Instrua a IA no prompt a usar <code className="bg-slate-100 px-1 rounded">[FOTO_PRODUTO:URL]</code> ao identificar um produto.
        </p>
      </div>

      {/* ── Biblioteca de Imagens ── */}
      <div className="pt-1 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Biblioteca de Imagens</p>
          <button
            onClick={() => setImgFormOpen(v => !v)}
            className="flex items-center gap-1 text-[10px] font-medium text-primary-600 hover:text-primary-700 px-2 py-0.5 rounded border border-primary-200 hover:border-primary-300 bg-primary-50 hover:bg-primary-100 transition"
          >
            <ImagePlus size={11} />
            Adicionar
          </button>
        </div>

        {/* Formulário de nova imagem */}
        {imgFormOpen && (
          <div className="mb-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <Fld label="Nome (slug sem espaços)">
              <input
                value={newImgName}
                onChange={e => setNewImgName(e.target.value)}
                className="input font-mono text-xs"
                placeholder="ex: catalogo, promo_maio, cardapio"
              />
              {newImgName.trim() && (
                <p className="text-[10px] text-primary-600 mt-0.5">
                  Marcador: <code className="bg-primary-50 px-1 rounded">[IMAGEM:{newImgName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}]</code>
                </p>
              )}
            </Fld>
            <Fld label="URL da imagem (pública)">
              <input
                value={newImgUrl}
                onChange={e => setNewImgUrl(e.target.value)}
                className="input text-xs"
                placeholder="https://..."
              />
            </Fld>
            <Fld label="Legenda (opcional)">
              <input
                value={newImgCaption}
                onChange={e => setNewImgCaption(e.target.value)}
                className="input text-xs"
                placeholder="Ex: Nosso catálogo completo de pods"
              />
            </Fld>
            <div className="flex gap-2 pt-1">
              <button
                onClick={addImage}
                disabled={!newImgName.trim() || !newImgUrl.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg px-3 py-1.5 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Plus size={12} /> Adicionar à biblioteca
              </button>
              <button onClick={() => setImgFormOpen(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 rounded-lg border border-slate-200 hover:border-slate-300 transition">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de imagens cadastradas */}
        {imageLib.length === 0 && !imgFormOpen ? (
          <div className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex items-center gap-2">
            <ImageOff size={13} className="shrink-0 opacity-60" />
            Nenhuma imagem cadastrada. Adicione imagens e instrua a IA a enviá-las com o marcador <code className="bg-slate-100 px-1 rounded mx-0.5">[IMAGEM:nome]</code> no prompt.
          </div>
        ) : (
          <div className="space-y-1.5">
            {imageLib.map(img => (
              <div key={img.id} className="flex items-start gap-2 px-2.5 py-2 bg-white border border-slate-100 rounded-lg group hover:border-slate-200 transition">
                <Image size={13} className="mt-0.5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <code className="text-[11px] font-semibold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">[IMAGEM:{img.name}]</code>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{img.url}</p>
                  {img.caption && <p className="text-[10px] text-slate-500 truncate italic">"{img.caption}"</p>}
                </div>
                <button
                  onClick={() => removeImage(img.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition shrink-0 mt-0.5"
                  title="Remover imagem"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
          No prompt, instrua: <em>"Quando for mostrar o catálogo, inclua <code>[IMAGEM:catalogo]</code> na resposta."</em>
          O marcador não é exibido ao cliente - apenas a imagem é enviada.
        </p>
      </div>

      {/* Variável de saída */}
      <Fld label="Salvar resposta em variável">
        <input value={d.variable ?? ''} onChange={(e) => onUpdate({ variable: e.target.value })} className="input font-mono" placeholder="ex: ai_resposta" />
      </Fld>
    </div>
  );
}

// ─── Variable-aware textarea ──────────────────────────────────────────────────
/**
 * Textarea that detects when the user types `{` and shows a dropdown
 * of declared flow variables. Highlights known/unknown `{var}` tokens below.
 */
function VarTextarea({
  value, onChange, placeholder, rows = 3, availableVars,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number; availableVars: string[];
}) {
  const [show,  setShow]  = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v   = e.target.value;
    const cur = e.target.selectionStart ?? v.length;
    onChange(v);
    const m = v.slice(0, cur).match(/\{([^}]*)$/);
    if (m) { setQuery(m[1]); setShow(true); }
    else     setShow(false);
  };

  const pick = (varName: string) => {
    const ta = ref.current;
    if (!ta) return;
    const cur      = ta.selectionStart ?? value.length;
    const braceAt  = value.slice(0, cur).lastIndexOf('{');
    const next     = value.slice(0, braceAt) + `{${varName}}` + value.slice(cur);
    onChange(next);
    setShow(false);
    const pos = braceAt + varName.length + 2;
    setTimeout(() => { ta.focus(); ta.setSelectionRange(pos, pos); }, 0);
  };

  const filtered = availableVars.filter(v =>
    !query || v.toLowerCase().includes(query.toLowerCase())
  );
  const vars = value.match(/\{([^}]+)\}/g) ?? [];

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        rows={rows}
        className="input resize-none"
        placeholder={placeholder}
      />

      {/* Autocomplete dropdown */}
      {show && (
        <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-44 overflow-y-auto">
          <div className="px-2.5 py-1.5 bg-primary-50 border-b border-primary-100 flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-primary-600 uppercase tracking-wider">Variáveis do fluxo</span>
          </div>
          {availableVars.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">
              Nenhuma variável declarada ainda. Adicione blocos de <strong>Entrada</strong> ou <strong>Variável</strong>.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400 italic">Sem resultados para "{query}"</p>
          ) : (
            filtered.map((v) => (
              <button
                key={v} type="button" onMouseDown={() => pick(v)}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-primary-50 transition"
              >
                <code className="text-[11px] font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                  {`{${v}}`}
                </code>
                <span className="text-xs text-slate-500">{v}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Variable preview */}
      {vars.length > 0 && (
        <div className="mt-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] leading-relaxed">
          <span className="text-slate-400 text-[10px] block mb-0.5">Pré-visualização:</span>
          {value.split(/(\{[^}]+\})/g).map((part, i) => {
            if (!/^\{[^}]+\}$/.test(part))
              return <span key={i} className="text-slate-600">{part}</span>;
            const vn    = part.slice(1, -1);
            const known = availableVars.includes(vn);
            return known
              ? <span key={i} className="bg-blue-100 text-blue-700 font-mono rounded px-0.5 mx-0.5">{part}</span>
              : <span key={i} className="bg-red-100 text-red-600 font-mono rounded px-0.5 mx-0.5" title="Variável não declarada">{part}</span>;
          })}
          {vars.some((m) => !availableVars.includes(m.slice(1, -1))) && (
            <p className="mt-0.5 text-[10px] text-red-500">⚠ Variável em vermelho não foi declarada no fluxo</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Variable-aware single-line input ────────────────────────────────────────
function VarInput({
  value, onChange, placeholder, className = '', availableVars,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; className?: string; availableVars: string[];
}) {
  const [show,  setShow]  = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v   = e.target.value;
    const cur = e.target.selectionStart ?? v.length;
    onChange(v);
    const m = v.slice(0, cur).match(/\{([^}]*)$/);
    if (m) { setQuery(m[1]); setShow(true); }
    else     setShow(false);
  };

  const pick = (varName: string) => {
    const el = ref.current;
    if (!el) return;
    const cur     = el.selectionStart ?? value.length;
    const braceAt = value.slice(0, cur).lastIndexOf('{');
    const next    = value.slice(0, braceAt) + `{${varName}}` + value.slice(cur);
    onChange(next);
    setShow(false);
    const pos = braceAt + varName.length + 2;
    setTimeout(() => { el.focus(); el.setSelectionRange(pos, pos); }, 0);
  };

  const filtered = availableVars.filter(v =>
    !query || v.toLowerCase().includes(query.toLowerCase())
  );

  const tokens = value.match(/\{([^}]+)\}/g) ?? [];

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder={placeholder}
        className={`input font-mono ${className}`}
      />

      {/* Autocomplete dropdown */}
      {show && (
        <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-44 overflow-y-auto">
          <div className="px-2.5 py-1.5 bg-primary-50 border-b border-primary-100 flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-primary-600 uppercase tracking-wider">Variáveis do fluxo</span>
          </div>
          {availableVars.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">
              Nenhuma variável declarada. Adicione blocos de <strong>Entrada</strong> ou <strong>Variável</strong>.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400 italic">Sem resultados para "{query}"</p>
          ) : (
            filtered.map((v) => (
              <button
                key={v} type="button" onMouseDown={() => pick(v)}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-primary-50 transition"
              >
                <code className="text-[11px] font-mono text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                  {`{${v}}`}
                </code>
                <span className="text-xs text-slate-500">{v}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Pré-visualização de variáveis */}
      {tokens.length > 0 && (
        <div className="mt-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] leading-relaxed">
          <span className="text-slate-400 text-[10px] block mb-0.5">Pré-visualização:</span>
          {value.split(/(\{[^}]+\})/g).map((part, i) => {
            if (!/^\{[^}]+\}$/.test(part))
              return <span key={i} className="text-slate-600 font-mono">{part}</span>;
            const vn    = part.slice(1, -1);
            const known = availableVars.includes(vn);
            return known
              ? <span key={i} className="bg-blue-100 text-blue-700 font-mono rounded px-0.5 mx-0.5">{part}</span>
              : <span key={i} className="bg-red-100 text-red-600 font-mono rounded px-0.5 mx-0.5" title="Variável não declarada">{part}</span>;
          })}
          {tokens.some((m) => !availableVars.includes(m.slice(1, -1))) && (
            <p className="mt-0.5 text-[10px] text-red-500">⚠ Variável em vermelho não foi declarada no fluxo</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────
function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ─── Exported wrapper ─────────────────────────────────────────────────────────
export default function ChatbotBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}
