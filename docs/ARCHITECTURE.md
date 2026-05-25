# Nex-Chat - Arquitetura do Sistema

## Visão Geral

O **Nex-Chat** é uma plataforma de atendimento via WhatsApp que integra automação de chatbot orientada a eventos (chatflow), gestão de operadores humanos, integrações externas (Mercado Pago, Make/Zapier, Pod Sales) e conformidade com segurança da informação (ISO/IEC 27001) e LGPD.

---

## Padrão Arquitetural

**Arquitetura em Camadas (Layered Architecture) com orientação a eventos via SSE**

```
┌─────────────────────────────────────────────────────────────────┐
│                        CAMADA DE APRESENTAÇÃO                    │
│              React 18 + TypeScript + Vite + Tailwind CSS         │
│   (SPA - Single Page Application, porta 5173)                   │
├─────────────────────────────────────────────────────────────────┤
│                      CAMADA DE API / NEGÓCIOS                    │
│              Node.js 22 + Express 4 (ESM, porta 3001)           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ auth.mjs │ │engine.mjs│ │webhook.mjs│ │pod-integration.mjs│ │
│  │ (segur.) │ │(chatbot) │ │(inbound) │ │ (vendas/Make)    │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     CAMADA DE PERSISTÊNCIA                       │
│   store.mjs (in-memory) → data.json (persistência em disco)     │
│   users.json (credenciais bcrypt) │ logs/audit.log (auditoria)  │
├─────────────────────────────────────────────────────────────────┤
│                     CAMADA DE INTEGRAÇÃO                         │
│   Evolution API (WhatsApp) │ Mercado Pago │ Make/Zapier         │
│   Gemini / OpenAI / Anthropic (IA generativa)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Módulos Principais

| Módulo | Responsabilidade |
|--------|-----------------|
| `index.mjs` | Servidor Express, roteamento, SSE, middleware de segurança |
| `auth.mjs` | Autenticação JWT, bcrypt, 2FA TOTP, rate limit, recuperação de senha, logs de auditoria, LGPD |
| `engine.mjs` | Motor de chatbot - executa nós do chatflow, gerencia sessões, integra IA |
| `webhook.mjs` | Recebe eventos da Evolution API (mensagens inbound) |
| `evolution.mjs` | Envia mensagens via Evolution API (outbound) |
| `store.mjs` | Estado global em memória com persistência em `data.json` |
| `pod-integration.mjs` | Sincroniza vendas com Pod Sales Manager e dispara webhook Make/Zapier |
| `pix.mjs` | Gera pagamentos PIX via Mercado Pago |
| `stock.mjs` | Gerenciamento de estoque (CRUD) |
| `timer.mjs` | Jobs agendados (respostas automáticas por tempo) |

---

## Fluxo de Autenticação

```
Operador
   │
   ▼
POST /auth/login
   ├─ Rate Limit Check (5 tentativas → bloqueio 15min)
   ├─ bcrypt.compare(senha, hash armazenado) - custo 12
   ├─ [se 2FA ativo] TOTP.verify(token, secret)
   └─ jwt.sign({ username, role, jti }, JWT_SECRET, { expiresIn: '8h' })
         │
         ▼
     JWT Token ──► requireAuth middleware ──► rotas protegidas
         │
         ▼
POST /auth/logout
   └─ Token adicionado à blacklist (revoked_tokens.json)
```

---

## Fluxo de Mensagens (Chatbot)

```
WhatsApp → Evolution API → POST /webhook
                                 │
                           webhook.mjs
                                 │
                           engine.mjs
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              (sessão ativa)           (sem sessão / nova)
                    │                         │
              continua fluxo           inicia fluxo do
              do nó atual              bot configurado
                    │                         │
              ┌─────┴─────┐                   │
              │   tipos   │                   │
              │   de nó   │                   │
              └─────┬─────┘                   │
                    │                         │
     text/image/audio/menu/API/IA/pagamento   │
                    │                         │
              Evolution API ──► WhatsApp ◄────┘
```

---

## Fluxo de Dados LGPD

```
Usuário/Operador
     │
     ├── GET  /lgpd/data    → Consulta dados pessoais retidos (Art. 18, I)
     ├── GET  /lgpd/export  → Exporta dados em JSON (Art. 18, V)
     ├── DELETE /lgpd/data  → Solicita exclusão (Art. 18, VI)
     └── POST /lgpd/consent → Registra/revoga consentimento (Art. 7, I)
```

---

## Stack Tecnológica

### Backend
| Tecnologia | Versão | Finalidade |
|-----------|--------|-----------|
| Node.js | 22.x | Runtime JavaScript ESM |
| Express | 4.x | Framework HTTP |
| bcryptjs | 3.x | Hash de senhas (custo 12) |
| jsonwebtoken | 9.x | Sessões JWT (HS256) |
| otplib | 13.x | 2FA TOTP (RFC 6238) |

### Frontend
| Tecnologia | Versão | Finalidade |
|-----------|--------|-----------|
| React | 18.x | Interface SPA |
| TypeScript | 5.x | Tipagem estática |
| Vite | 6.x | Build e dev server |
| Tailwind CSS | 3.x | Estilização utilitária |
| Recharts | 2.x | Gráficos de relatórios |

---

## Ativos do Sistema

| Ativo | Classificação | Criticidade |
|-------|--------------|-------------|
| `data.json` | Dados de conversas e configurações | Alta |
| `users.json` | Credenciais de operadores (hashes bcrypt) | Crítica |
| `server/.env` | Segredos: API_TOKEN, WEBHOOK_SECRET, MAKE_WEBHOOK_URL | Crítica |
| `logs/audit.log` | Registro de eventos de segurança | Alta |
| Evolution API Key | Credencial de acesso ao WhatsApp Business | Crítica |
| Mercado Pago Token | Credencial de pagamento | Crítica |

---

## Ameaças Identificadas e Contramedidas

| Ameaça | Superfície | Contramedida |
|--------|-----------|-------------|
| Força bruta em login | `/auth/login` | Rate limit (5 tentativas, bloqueio 15min) |
| Sequestro de sessão | JWT | Expiração de 8h + blacklist no logout |
| Phishing de credenciais | Operadores | 2FA TOTP obrigatório (configurável) |
| Injeção via webhook | `/webhook` | Validação de `WEBHOOK_SECRET` + IP whitelist |
| Vazamento de dados pessoais | `data.json` | Minimização de dados + endpoints LGPD |
| Supply chain attack | `node_modules` | Versionamento exato no `package.json` |
| Exposição de API keys | `.env` | Arquivo fora do repositório (`.gitignore`) |

---

## Diagrama de Componentes

```
┌───────────────┐    HTTPS/WS    ┌──────────────────┐
│  WhatsApp     │ ◄────────────► │  Evolution API   │
│  Business     │                │  (Docker/local)  │
└───────────────┘                └────────┬─────────┘
                                          │ POST /webhook
                                          ▼
┌──────────────────────────────────────────────────────┐
│                    Nex-Chat Server                    │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │  Express    │  │ engine   │  │    auth.mjs     │ │
│  │  Router     │  │ (chatbot)│  │ bcrypt+JWT+2FA  │ │
│  └──────┬──────┘  └────┬─────┘  └────────┬────────┘ │
│         │              │                  │          │
│  ┌──────▼──────────────▼──────────────────▼───────┐  │
│  │              store.mjs (in-memory + JSON)      │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
          │                    │
          ▼                    ▼
   ┌─────────────┐    ┌───────────────┐
   │ Mercado     │    │  Make/Zapier  │
   │ Pago API    │    │  Webhook      │
   └─────────────┘    └───────────────┘

Frontend: React SPA (porta 5173)
  └── SSE → /api/events (tempo real)
  └── REST → /api/* (Bearer Token)
  └── REST → /auth/* (JWT)
  └── REST → /lgpd/* (JWT)
```
