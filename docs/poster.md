# PÔSTER CIENTÍFICO — NEX-CHAT

## Plataforma de Atendimento via WhatsApp com Segurança da Informação e Conformidade LGPD

**Gabriel Nascimento** | Universidade de Mogi das Cruzes — UMC | 2026

---

## OBJETIVO

Desenvolver e auditar uma plataforma de atendimento ao cliente via WhatsApp com automação de chatbot, demonstrando a aplicação de controles de segurança da informação (ISO/IEC 27001:2022) e conformidade com a LGPD (Lei nº 13.709/2018) em um sistema de produção real.

---

## ARQUITETURA DO SISTEMA

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND: React 18 + TypeScript + Vite + Tailwind (5173)  │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + SSE
┌──────────────────────────▼──────────────────────────────────┐
│  BACKEND: Node.js 22 + Express 4 (porta 3001)              │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────────────┐ │
│  │ auth.mjs │ │engine.mjs│ │ webhook │ │pod-integration │ │
│  │ (segur.) │ │(chatbot) │ │(inbound)│ │ (vendas/Make)  │ │
│  └──────────┘ └──────────┘ └─────────┘ └────────────────┘ │
│         store.mjs → data.json | users.json | audit.log     │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  Evolution API      Mercado Pago       Make/Zapier
  (WhatsApp)         (PIX + Cartão)     (Automações)
```

---

## MECANISMOS DE SEGURANÇA IMPLEMENTADOS

| Controle | Implementação | Referência |
|---------|--------------|-----------|
| **Hash de Senhas** | bcrypt, custo 12, salt único por usuário | OWASP Password Storage |
| **Sessões JWT** | HS256, expiração 8h, blacklist no logout | RFC 7519 |
| **2FA TOTP** | RFC 6238, compatível com Google Authenticator | RFC 6238 |
| **Anti Força Bruta** | 5 tentativas → bloqueio 15 min (HTTP 429) | ISO 27001 A.9.4.2 |
| **Recuperação de Senha** | Token 384-bit, válido 30 min, uso único | NIST SP 800-63B |
| **Logs de Auditoria** | JSON-Lines append-only, 14 tipos de evento | ISO 27001 A.8.15 |
| **CORS Restrito** | Whitelist de origens por padrão regex | OWASP CORS |

---

## FLUXO DE AUTENTICAÇÃO

```
Operador
   │
   ▼
POST /auth/login
   ├─ Rate Limit: 5 tentativas / 15 min bloqueio
   ├─ bcrypt.compare(senha, hash) — custo 12
   ├─ [2FA] TOTP.verify(token, secret) — RFC 6238
   └─ JWT assinado → { username, role, jti, exp }
          │
          ▼
   requireAuth middleware
          │
  ┌───────┴────────────────┐
  │  Rotas protegidas      │
  │  /api/*, /lgpd/*       │
  │  /auth/audit-log       │
  └────────────────────────┘
          │
          ▼
POST /auth/logout
   └─ JTI → blacklist (revoked_tokens.json)
```

---

## CONFORMIDADE LGPD (Lei nº 13.709/2018)

| Artigo LGPD | Implementação |
|-------------|--------------|
| Art. 7º, V — Execução de contrato | Base legal para dados de clientes (nome, telefone) |
| Art. 7º, I — Consentimento | `POST /lgpd/consent` registra consentimento com versão e data |
| Art. 15 — Revogação | `POST /lgpd/consent { given: false }` |
| Art. 18, I — Acesso | `GET /lgpd/data` — dados pessoais retidos |
| Art. 18, V — Portabilidade | `GET /lgpd/export` — export JSON para download |
| Art. 18, VI — Eliminação | `DELETE /lgpd/data` — exclusão com auditoria |

**Dados coletados:** Nome e telefone (WhatsApp), username de operadores, histórico de atendimentos.  
**Dados sensíveis:** Nenhum (Art. 5º, II — não aplicável).  
**Minimização:** Apenas dados necessários para prestação do serviço.

---

## STACK TECNOLÓGICA

```
Backend:   Node.js 22 | Express 4 | bcryptjs 3 | jsonwebtoken 9 | otplib 13
Frontend:  React 18   | TypeScript 5 | Vite 6 | Tailwind CSS 3 | Recharts 2
Infra:     PM2 | Evolution API (Docker) | Mercado Pago | Make.com
```

---

## RESULTADOS

| Requisito | Status |
|-----------|--------|
| Hash bcrypt custo 12 + salt único | ✅ Implementado |
| JWT com expiração + blacklist no logout | ✅ Implementado |
| 2FA TOTP (RFC 6238) | ✅ Implementado |
| Proteção força bruta (rate limit 5/15min) | ✅ Implementado |
| Recuperação de senha segura | ✅ Implementado |
| Logs de auditoria estruturados | ✅ Implementado |
| Endpoints LGPD (acesso/export/exclusão/consentimento) | ✅ Implementado |
| Documentação técnico-científica | ✅ Produzida |
| Relatório de auditoria LaTeX (ISO 27001) | ✅ Gerado |

**Score de Segurança Pós-Remediação: 74/100**

---

## CONCLUSÃO

O Nex-Chat demonstra que é viável integrar controles robustos de segurança da informação e conformidade legal (LGPD) em plataformas de atendimento de pequeno-médio porte sem comprometer a usabilidade. As remediações implementadas eliminaram as principais não-conformidades identificadas na auditoria, tornando o sistema apto para homologação em ambiente de produção com monitoramento contínuo.

---

**Palavras-chave:** Segurança da Informação · LGPD · bcrypt · JWT · 2FA · WhatsApp · Node.js · ISO/IEC 27001
