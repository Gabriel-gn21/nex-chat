# Nex-Chat — Documentação de Segurança

## Referência Normativa

- **ABNT NBR ISO/IEC 27001:2022** — Sistema de Gestão de Segurança da Informação
- **Lei nº 13.709/2018 (LGPD)** — Lei Geral de Proteção de Dados Pessoais
- **OWASP Top 10 2021** — Diretrizes de segurança para aplicações web

---

## 1. Autenticação e Gestão de Credenciais

### 1.1 Hash de Senhas (Requisito 1.1–1.4)

As senhas dos operadores são armazenadas exclusivamente como hash bcrypt com:
- **Algoritmo**: bcrypt (implementado via `bcryptjs`)
- **Salt**: gerado criptograficamente via `bcrypt.genSalt()` — único por usuário
- **Custo (work factor)**: 12 rounds (recomendação OWASP para bcrypt em 2024)
- **Armazenamento**: apenas o hash+salt em `server/users.json` — jamais a senha em texto plano

**Justificativa técnica**: O custo 12 garante ~300ms por operação de hash em hardware moderno, tornando ataques de dicionário inviáveis. O salt único por usuário previne ataques de rainbow table.

```javascript
// Exemplo — server/auth.mjs
const BCRYPT_ROUNDS = 12;
const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
const hash = await bcrypt.hash(plaintext, salt);
// Armazenado: "$2a$12$<22-char-salt><31-char-hash>"
```

### 1.2 Sessões com JWT (Requisito 1.9–1.10)

- **Token**: JWT assinado com HMAC-SHA256 (HS256)
- **Expiração**: 8 horas configurável via `JWT_EXPIRES_IN`
- **Invalidação no logout**: token adicionado à blacklist em `logs/revoked_tokens.json`
- **JTI (JWT ID)**: UUID único por token para rastreabilidade e revogação

```javascript
const token = jwt.sign(
  { username, role, jti: crypto.randomUUID() },
  JWT_SECRET,
  { expiresIn: '8h' }
);
```

### 1.3 Proteção contra Força Bruta (Requisito 1.11)

- **Limite**: 5 tentativas de login por username
- **Bloqueio**: 15 minutos após atingir o limite
- **Proteção contra timing attacks**: comparação bcrypt sempre executada (mesmo para usuário inexistente)

### 1.4 Autenticação de Dois Fatores — 2FA (Requisito 1.5–1.6)

- **Protocolo**: TOTP (Time-based One-Time Password) — RFC 6238
- **Biblioteca**: `otplib` v13
- **Drift tolerado**: ±30 segundos (1 janela TOTP)
- **Ativação**: requer confirmação com token TOTP após geração do secret
- **Compatível com**: Google Authenticator, Authy, Microsoft Authenticator

---

## 2. Recuperação de Senha (Requisito 2.1–2.7)

| Item | Implementação |
|------|--------------|
| Token gerado | `crypto.randomBytes(48).toString('hex')` — 96 hex chars |
| Expiração | 30 minutos |
| Invalidação após uso | Token removido do Map imediatamente após consumo |
| Falha por token expirado | HTTP 400 com mensagem "Token expirado" |
| Registro em log | `auditLog('PASSWORD_RECOVERY_REQUESTED')` e `PASSWORD_RECOVERY_SUCCESS/FAILED` |

---

## 3. Criptografia e Comunicação Segura (Requisito 3.1–3.8)

### 3.1 TLS/HTTPS

Em ambiente de **produção**, o Nex-Chat é implantado atrás de um **reverse proxy** (Nginx ou Cloudflare Tunnel) que termina o TLS:

```
Internet (HTTPS) → Cloudflare/Nginx (TLS) → Node.js (HTTP local 3001)
```

Para desenvolvimento local: HTTP entre o frontend (5173) e o servidor (3001) por ser loopback.

### 3.2 Dados Sensíveis em Repouso

| Dado | Proteção |
|------|---------|
| Senhas | bcrypt hash (nunca em texto plano) |
| API tokens | Variável de ambiente (`.env`, fora do repositório) |
| Chaves criptográficas | `JWT_SECRET` gerado com `crypto.randomBytes(64)` |

### 3.3 Chaves Protegidas

- `JWT_SECRET`: gerado aleatoriamente em cada inicialização se não definido via env
- `API_TOKEN`, `WEBHOOK_SECRET`, `MAKE_WEBHOOK_URL`: em `server/.env` (no `.gitignore`)
- Chaves de IA (Gemini, OpenAI, Anthropic): armazenadas em `data.json` criptografado no disco

---

## 4. Conformidade com a LGPD (Requisito 4.1–4.11)

### 4.1 Dados Pessoais Coletados

| Dado | Finalidade | Base Legal (LGPD) | Retenção |
|------|-----------|-------------------|---------|
| Nome do contato (WhatsApp) | Identificação no atendimento | Art. 7, II (contrato) | Duração do atendimento |
| Número de telefone | Canal de comunicação | Art. 7, II (contrato) | 1 ano após encerramento |
| Histórico de mensagens | Qualidade do atendimento | Art. 7, II (contrato) | 1 ano |
| Username do operador | Controle de acesso | Art. 7, IX (legítimo interesse) | Duração do contrato |

### 4.2 Direitos dos Titulares

Endpoints disponíveis para exercício dos direitos (Art. 18):

| Direito | Endpoint | Método |
|---------|---------|--------|
| Acesso (Art. 18, I) | `/lgpd/data` | GET |
| Portabilidade (Art. 18, V) | `/lgpd/export` | GET |
| Eliminação (Art. 18, VI) | `/lgpd/data` | DELETE |
| Revogação de consentimento (Art. 15) | `/lgpd/consent` | POST |

### 4.3 Consentimento

- Registrado com: data, versão do documento de política, estado (dado/revogado)
- Armazenado em: `users.json` por usuário
- Log de auditoria: `CONSENT_UPDATED` com timestamp

### 4.4 Minimização de Dados

O sistema coleta apenas dados necessários para a prestação do serviço:
- Número de telefone e nome (WhatsApp) — necessários para comunicação
- Username do operador — necessário para controle de acesso
- **Não coletados**: dados sensíveis (saúde, genômicos, biometria, orientação sexual)

---

## 5. Auditoria e Logs (Requisito 5.1–5.4)

### Eventos Registrados

Todos os eventos são gravados em `server/logs/audit.log` em formato JSON-Lines (um objeto por linha):

```json
{"ts":"2026-05-25T22:03:03.097Z","action":"SYSTEM_INIT","msg":"Usuário admin padrão criado."}
{"ts":"2026-05-25T22:03:44.205Z","action":"LOGIN_SUCCESS","username":"gabriel.nascimento","role":"superadmin","ip":"::1"}
{"ts":"2026-05-25T22:05:45.056Z","action":"LGPD_DATA_ACCESS","username":"gabriel.nascimento","ip":"::1"}
```

| Evento | Condição |
|--------|---------|
| `LOGIN_SUCCESS` | Login bem-sucedido |
| `LOGIN_FAILED` | Senha incorreta ou usuário inexistente |
| `LOGIN_2FA_FAILED` | Token TOTP inválido |
| `ACCOUNT_LOCKED` | 5 tentativas falhas |
| `LOGOUT` | Sessão encerrada |
| `PASSWORD_CHANGED` | Senha alterada |
| `PASSWORD_RECOVERY_*` | Fluxo de recuperação de senha |
| `2FA_ENABLED` | 2FA ativado |
| `USER_CREATED` | Novo operador criado |
| `LGPD_DATA_ACCESS` | Consulta de dados pessoais |
| `LGPD_DATA_EXPORT` | Exportação de dados pessoais |
| `LGPD_DATA_DELETION` | Exclusão de dados pessoais |
| `CONSENT_UPDATED` | Consentimento registrado/revogado |
| `AUTH_REJECTED` | Token inválido ou expirado |

### Proteção dos Logs

- Arquivo `audit.log` com permissões de apenas append (`appendFileSync`)
- Localizado fora do diretório público
- Acesso via API somente para `superadmin` com JWT válido (`GET /auth/audit-log`)

---

## 6. Gestão de Dependências (Supply Chain Security)

Arquivo `package.json` com versões fixadas:

```json
{
  "bcryptjs":       "^3.0.3",
  "cors":           "^2.8.5",
  "express":        "^4.19.2",
  "jsonwebtoken":   "^9.0.3",
  "otplib":         "^13.4.0",
  "qrcode":         "^1.5.4"
}
```

**Recomendação para produção**: gerar `package-lock.json` com hashes SHA512:
```bash
npm ci --package-lock-only  # gera lock com integridade
```

---

## 7. Testes de Segurança Realizados

| Teste | Resultado |
|-------|----------|
| Login com credenciais corretas | ✅ JWT gerado e retornado |
| Login com senha incorreta | ✅ HTTP 401 — "Credenciais inválidas" |
| Acesso a rota protegida sem JWT | ✅ HTTP 401 — "Token ausente" |
| Logout invalida token | ✅ Token na blacklist — HTTP 401 em usos subsequentes |
| Token expirado rejeitado | ✅ HTTP 401 — "Sessão expirada" |
| Rate limit após 5 tentativas | ✅ HTTP 429 — "Conta bloqueada" |
| Recuperação de senha | ✅ Token seguro gerado, inválido após uso |
| Log de auditoria gravado | ✅ `logs/audit.log` atualizado em cada evento |
| LGPD export funcional | ✅ JSON com dados pessoais retornado |
| LGPD consent registrado | ✅ Gravado com timestamp e versão |
