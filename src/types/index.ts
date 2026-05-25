export type UserRole = 'superadmin' | 'admin' | 'operator';

export interface User {
  id: string; name: string; email: string; login: string; password: string;
  role: UserRole; firstAccess: boolean; twoFactorEnabled: boolean;
  twoFactorSecret?: string; avatar?: string; createdAt: string; active: boolean;
}

export interface SessionConfig { superadmin: number; admin: number; operator: number; }
export const DEFAULT_SESSION_CONFIG: SessionConfig = { superadmin: 480, admin: 240, operator: 120 };

export interface Channel {
  id: string; name: string; phoneNumber: string; phoneNumberId: string;
  wabaId: string; accessToken: string; verifiedName: string;
  qualityRating: string; metaStatus: string;
  status: 'active' | 'inactive' | 'pending'; createdAt: string;
  connectionType?: 'meta' | 'qrcode';
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  evolutionInstanceName?: string;
}

export interface AttendanceGroup {
  id: string; name: string; description?: string;
  memberIds: string[]; // user IDs
  createdAt: string;
}

export interface Contact { id: string; name: string; phone: string; avatar?: string; lastSeen?: string; tags?: string[]; }

export interface Message {
  id: string; conversationId: string; content: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'template';
  direction: 'incoming' | 'outgoing';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string; operatorId?: string;
}

// ─── Tabulação ────────────────────────────────────────────────────────────────
export type TabulationFieldType = 'select' | 'text' | 'textarea' | 'number' | 'pod_product';

export interface TabulationField {
  id: string;
  label: string;
  type: TabulationFieldType;
  required: boolean;
  options?: string[];                          // só para type === 'select'
  showWhen?: { fieldId: string; value: string }; // exibição condicional
  placeholder?: string;
}

export type TabulationAIProvider = 'openai' | 'anthropic' | 'gemini';

export interface TabulationAIConfig {
  provider: TabulationAIProvider;
  apiKey: string;
  model?: string; // usa o padrão do provedor se omitido
}

export interface TabulationConfig {
  id: string;              // identificador único
  name: string;            // nome de exibição (ex: "Pod Sales", "Suporte")
  channelIds?: string[];   // canais vinculados; vazio/ausente = fallback global
  enabled: boolean;
  fields: TabulationField[];
  aiConfig?: TabulationAIConfig;
}

export const DEFAULT_TABULATION: TabulationConfig = {
  id: 'default',
  name: 'Geral',
  channelIds: [],
  enabled: true,
  fields: [
    {
      id: 'resultado',
      label: 'Resultado do atendimento',
      type: 'select',
      required: true,
      options: ['Venda realizada', 'Não houve venda', 'Cliente desistiu', 'Cliente achou caro', 'Cliente cancelou', 'Cliente não respondeu', 'Dúvida resolvida', 'Reclamação'],
    },
    {
      id: 'produto',
      label: 'Produto / serviço vendido',
      type: 'pod_product',
      required: false,
      showWhen: { fieldId: 'resultado', value: 'Venda realizada' },
    },
    {
      id: 'valor',
      label: 'Valor da venda (R$)',
      type: 'number',
      required: false,
      placeholder: '0,00',
      showWhen: { fieldId: 'resultado', value: 'Venda realizada' },
    },
    {
      id: 'responsavel',
      label: 'Responsável pela venda',
      type: 'text',
      required: false,
      placeholder: 'Nome do operador',
      showWhen: { fieldId: 'resultado', value: 'Venda realizada' },
    },
    {
      id: 'observacoes',
      label: 'Observações',
      type: 'textarea',
      required: false,
      placeholder: 'Informações adicionais sobre o atendimento…',
    },
  ],
};

export interface Conversation {
  id: string; contactId: string; contact: Contact; channelId: string;
  status: 'open' | 'in_progress' | 'resolved' | 'bot';
  assignedTo?: string; groupId?: string; // grupo de atendimento
  lastMessage?: Message;
  unreadCount: number; createdAt: string; updatedAt: string; messages: Message[];
  tabulation?: Record<string, string | number>; // dados preenchidos na tabulação
  resolvedAt?: string | null;
}

export type TemplateStatus   = 'pending' | 'approved' | 'rejected';
export type TemplateCategory = 'marketing' | 'utility' | 'authentication';

export interface Template {
  id: string; name: string; category: TemplateCategory; language: string;
  body: string; header?: string; footer?: string;
  buttons?: { type: string; text: string; url?: string }[];
  status: TemplateStatus; channelId: string; createdAt: string;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'completed' | 'paused';

export interface Campaign {
  id: string; name: string; templateId: string; channelId: string;
  status: CampaignStatus; audience: string[]; scheduledAt?: string;
  sentCount: number; deliveredCount: number; readCount: number; createdAt: string;
}

// ─── Chatbot node types ────────────────────────────────────────────────────
export type NodeType =
  | 'start'
  | 'send_text' | 'send_buttons' | 'send_menu'
  | 'send_action_buttons' | 'send_list_buttons'
  | 'send_image' | 'send_audio' | 'send_file' | 'send_video'
  | 'input_text' | 'input_number' | 'input_email' | 'input_link'
  | 'input_date' | 'input_phone' | 'input_cpf' | 'input_rg'
  | 'input_cpf_cnpj' | 'input_custom'
  | 'input_image' | 'input_file' | 'input_audio' | 'input_video'
  | 'input_location'
  | 'integration_ai' | 'integration_email' | 'integration_api' | 'integration_webhook'
  | 'logic_variable' | 'logic_decision' | 'logic_timer'
  | 'logic_suspend' | 'logic_business_hours'
  | 'logic_list_lookup' | 'logic_protocol'
  | 'action_forward'
  | 'end_handoff' | 'end_finish';

export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'mcp' | 'custom';

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  content: string; // markdown
  createdAt: string;
  updatedAt: string;
}

export interface ApiCallData {
  url: string; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: { key: string; value: string }[];
  body: string; responseVar: string;
}

export interface ImageLibraryEntry {
  id: string;       // uuid curto
  name: string;     // slug único (ex: "catalogo", "promo_maio") — usado no marcador [IMAGEM:nome]
  url: string;      // URL pública da imagem
  caption?: string; // legenda opcional enviada junto com a imagem
}

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  message?: string;
  buttons?: { label: string }[];
  menuItems?: { label: string; description?: string }[];
  actionButtons?: { type: 'call' | 'url'; label: string; value: string }[];
  webhookUrl?: string;
  webhookMethod?: 'POST' | 'GET' | 'PUT' | 'PATCH';
  webhookBody?: string;
  mediaUrl?: string;
  caption?: string;
  variable?: string;
  errorMessage?: string;
  maxRetries?: number;
  validationRegex?: string;
  aiProvider?: AiProvider;
  aiApiKey?: string;
  aiModel?: string;
  aiMcpUrl?: string;
  aiSystemPrompt?: string;
  aiUserMessage?: string;
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;
  apiCall?: ApiCallData;
  varValue?: string;
  condition?: string;
  timerSeconds?: number;
  bhStart?: string;
  bhEnd?: string;
  bhDays?: number[];
  bhTimezone?: string;
  listName?: string;
  listSearchValue?: string;
  protocolPrefix?: string;
  // IA — base de conhecimento e memória
  aiKnowledgeBaseIds?: string[];
  aiMemoryTurns?: number;
  // IA — biblioteca de imagens enviáveis via marcador [IMAGEM:nome]
  imageLibrary?: ImageLibraryEntry[];
  // IA — legenda usada nas fotos de produto enviadas via [FOTO_PRODUTO:url]
  fotoProdutoCaption?: string;
  // Delay antes de enviar (send_* nodes)
  delaySeconds?: number;
  // Transferência
  queueName?: string;
  handoffMessage?: string;
  handoffGroupId?: string; // ID do grupo de atendimento
  // Encaminhar mensagem para outro WhatsApp
  forwardTo?: string;
  forwardChannelId?: string;
  forwardMode?: 'last_input' | 'custom' | 'variable';
  forwardCustomText?: string;
  forwardVariable?: string;
  forwardPrefix?: string;
}

export interface FlowNode {
  id: string; type: NodeType; position: { x: number; y: number }; data: FlowNodeData;
}

export interface FlowEdge {
  id: string; source: string; target: string;
  label?: string; sourceHandle?: string; targetHandle?: string;
}

export type ChatbotStatus = 'active' | 'inactive' | 'draft';

export interface ChatbotSchedule {
  enabled: boolean;
  days: number[];       // 0=Dom, 1=Seg, ..., 6=Sáb
  startTime: string;    // "HH:MM"
  endTime: string;      // "HH:MM"
}

export interface Chatbot {
  id: string; name: string; description?: string; channelId?: string;
  status: ChatbotStatus; nodes: FlowNode[]; edges: FlowEdge[];
  createdAt: string; updatedAt: string;
  schedule?: ChatbotSchedule;
}

export interface AuthState {
  user: User | null; isAuthenticated: boolean;
  requirePasswordChange: boolean; require2FA: boolean;
}

export interface ReportData { date: string; value: number; label?: string; }
