# Nex-Chat 🤖💬

**Plataforma de Atendimento via WhatsApp com Automação de Chatbot, Segurança da Informação e Conformidade LGPD**

[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![ISO 27001](https://img.shields.io/badge/ISO%2FIEC-27001%3A2022-orange.svg)](https://www.iso.org/standard/27001)
[![LGPD](https://img.shields.io/badge/LGPD-Lei%2013.709%2F2018-purple.svg)](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

---

## Sobre o Projeto

O Nex-Chat é uma plataforma completa de atendimento ao cliente via WhatsApp Business, desenvolvida em **Node.js 22 + React 18 + TypeScript**. Integra automação de chatbot orientada a fluxos visuais, gestão de operadores humanos, integrações de pagamento (Mercado Pago — PIX e cartão de crédito) e automações externas via Make/Zapier.

O projeto implementa **controles robustos de segurança da informação** alinhados à norma **ABNT NBR ISO/IEC 27001:2022** e **conformidade plena com a LGPD** (Lei nº 13.709/2018).

---

## Funcionalidades Principais

- 🤖 **Chatbot visual** com editor de fluxos drag-and-drop
- 👥 **Multi-operador** com grupos de atendimento e transferências
- 📊 **Dashboard de relatórios** em tempo real (atendimentos, tempo médio, funil de chatbot)
- 💳 **Pagamentos** via PIX e cartão de crédito (Mercado Pago)
- 🧠 **IA Generativa** integrada (Gemini, GPT-4o, Claude)
- 📋 **Tabulação de atendimentos** com sincronização automática de vendas
- 🔒 **Segurança**: bcrypt + JWT + 2FA TOTP + rate limiting + logs de auditoria
- ⚖️ **LGPD**: endpoints de acesso, exportação, exclusão e consentimento

---

## Stack Tecnológica

### Backend
| Tecnologia | Versão | Função |
|-----------|--------|--------|
| Node.js | 22.x | Runtime (ESM) |
| Express | 4.x | Framework HTTP |
| bcryptjs | 3.x | Hash de senhas (custo 12) |
| jsonwebtoken | 9.x | Sessões JWT (HS256) |
| otplib | 13.x | 2FA TOTP (RFC 6238) |

### Frontend
| Tecnologia | Versão | Função |
|-----------|--------|--------|
| React | 18.x | Interface SPA |
| TypeScript | 5.x | Tipagem estática |
| Vite | 6.x | Build e dev server |
| Tailwind CSS | 3.x | Estilização |

---

## Segurança Implementada

| Controle | Implementação |
|---------|--------------|
| Hash de Senhas | bcrypt (custo 12, salt único por usuário) |
| Sessões | JWT HS256, expiração 8h, blacklist no logout |
| 2FA | TOTP RFC 6238 (Google Authenticator) |
| Anti Força Bruta | 5 tentativas → bloqueio 15 min |
| Recuperação de Senha | Token 384-bit, válido 30 min, uso único |
| Logs de Auditoria | JSON-Lines, 14 tipos de evento |
| CORS | Whitelist de origens |

---

## Conformidade LGPD

| Artigo | Implementação |
|--------|--------------|
| Art. 7º — Base Legal | Execução de contrato + legítimo interesse |
| Art. 18, I — Acesso | `GET /lgpd/data` |
| Art. 18, V — Portabilidade | `GET /lgpd/export` |
| Art. 18, VI — Eliminação | `DELETE /lgpd/data` |
| Art. 15 — Revogação | `POST /lgpd/consent` |

---

## Estrutura do Projeto

```
nex-chat/
├── server/                    # Backend Node.js
│   ├── auth.mjs               # 🔒 Autenticação: bcrypt, JWT, 2FA, logs LGPD
│   ├── index.mjs              # Servidor Express, rotas, middleware
│   ├── engine.mjs             # Motor de chatbot
│   ├── webhook.mjs            # Recebimento de mensagens (Evolution API)
│   ├── evolution.mjs          # Envio de mensagens
│   ├── store.mjs              # Estado global + persistência
│   ├── pod-integration.mjs    # Integração com Pod Sales + Make/Zapier
│   ├── pix.mjs                # Pagamentos Mercado Pago
│   ├── stock.mjs              # Gestão de estoque
│   ├── timer.mjs              # Jobs agendados
│   ├── logs/                  # Logs de auditoria (audit.log)
│   └── .env                   # Variáveis de ambiente (⚠️ não commitar)
├── src/                       # Frontend React + TypeScript
│   ├── components/            # Componentes UI
│   └── main.tsx               # Entry point
├── docs/                      # Documentação técnica
│   ├── ARCHITECTURE.md        # Arquitetura e diagramas
│   ├── SECURITY.md            # Documentação de segurança
│   ├── resumo-cientifico.md   # Resumo científico (200-300 palavras)
│   ├── poster.md              # Pôster científico
│   └── relatorio-auditoria.tex # Relatório LaTeX (ISO 27001 / LGPD)
├── README.md
├── package.json               # Frontend dependencies
└── index.html
```

---

## Instalação e Execução

### Pré-requisitos
- Node.js 22+
- Evolution API rodando localmente (Docker)

### Backend
```bash
cd server
npm install
cp .env.example .env   # configurar variáveis
node index.mjs         # ou: npx pm2 start index.mjs --name nex-chat
```

### Frontend
```bash
npm install
npm run dev            # http://localhost:5173
```

### Variáveis de Ambiente (server/.env)
```env
API_TOKEN=<token-gerado>
WEBHOOK_SECRET=<secret-para-evolution-api>
JWT_SECRET=<secret-jwt-64bytes-hex>
MAKE_WEBHOOK_URL=<url-make-webhook>  # opcional
```

---

## API de Autenticação

```http
# Login
POST /auth/login
{ "username": "gabriel.nascimento", "password": "12345678", "totpToken": "123456" }

# Verificar sessão
GET /auth/me
Authorization: Bearer <jwt>

# Logout (invalida token)
POST /auth/logout
Authorization: Bearer <jwt>

# Configurar 2FA
POST /auth/2fa/setup
Authorization: Bearer <jwt>

# Recuperação de senha
POST /auth/recovery/request   { "username": "..." }
POST /auth/recovery/reset     { "token": "...", "newPassword": "..." }
```

## API LGPD

```http
GET    /lgpd/data          # Consultar dados pessoais
GET    /lgpd/export        # Exportar dados (JSON download)
DELETE /lgpd/data          # Solicitar exclusão
POST   /lgpd/consent       # Registrar/revogar consentimento
GET    /auth/audit-log     # Logs de auditoria (superadmin)
```

---

## Documentação Técnica

- **[Arquitetura](docs/ARCHITECTURE.md)** — Stack, padrões, diagramas, ativos, ameaças
- **[Segurança](docs/SECURITY.md)** — Todos os controles implementados com exemplos de código
- **[Resumo Científico](docs/resumo-cientifico.md)** — 268 palavras, metodologia e resultados
- **[Pôster Científico](docs/poster.md)** — Visualização dos mecanismos de segurança
- **[Relatório de Auditoria LaTeX](docs/relatorio-auditoria.tex)** — Auditoria completa ISO 27001 / LGPD

---

## Referências

- ABNT NBR ISO/IEC 27001:2022
- Lei nº 13.709/2018 (LGPD)
- RFC 6238 — TOTP
- RFC 7519 — JWT
- OWASP Top 10 2021
- NIST SP 800-63B

---

*Desenvolvido para fins acadêmicos e comerciais — Universidade de Mogi das Cruzes (UMC) — 2026*
