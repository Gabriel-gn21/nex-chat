# Guia Completo - Atividade M2
## Nex-Chat: Segurança da Informação e Conformidade LGPD
**Autor:** Gabriel Nascimento | **Disciplina:** Segurança da Informação | **Prof.:** Dr. Fabiano Menegidio | **UMC - 2026**

---

## Indice

1. [O que foi feito e por que](#1-o-que-foi-feito-e-por-que)
2. [Como cada requisito foi implementado](#2-como-cada-requisito-foi-implementado)
3. [Arquivos criados e seus papeis](#3-arquivos-criados-e-seus-papeis)
4. [Como o codigo funciona - explicacao didatica](#4-como-o-codigo-funciona---explicacao-didatica)
5. [O que voce precisa fazer agora](#5-o-que-voce-precisa-fazer-agora)
6. [Como apresentar o projeto](#6-como-apresentar-o-projeto)
7. [Perguntas frequentes e respostas](#7-perguntas-frequentes-e-respostas)

---

## 1. O que foi feito e por que

### O projeto original

O Nex-Chat ja existia como plataforma de atendimento via WhatsApp. Era um sistema funcional com:
- Frontend em React + TypeScript
- Backend em Node.js com Express
- Chatbot com fluxos visuais
- Integracoes com Mercado Pago, Make/Zapier

**O problema:** o sistema nao tinha seguranca adequada. As senhas provavelmente estavam em texto plano, nao havia autenticacao de dois fatores, nao havia logs de auditoria, e o sistema nao atendia a LGPD.

### O que a atividade M2 exigia

O professor pediu que voce:

1. **Implementasse controles de seguranca** baseados na norma ISO/IEC 27001:2022
2. **Garantisse conformidade com a LGPD** (Lei 13.709/2018)
3. **Gerasse documentacao tecnico-cientifica** sobre o que foi feito
4. **Produzisse um relatorio de auditoria** no formato do professor

### O que foi construido

Foi criado do zero o arquivo `server/auth.mjs` - um modulo completo de seguranca que foi integrado ao servidor existente. Alem disso, foram gerados 5 documentos tecnicos e academicos.

---

## 2. Como cada requisito foi implementado

### Secao 1 - Autenticacao e Senhas

#### Requisito 1.1 a 1.4: Hash de senhas com bcrypt

**O problema sem isso:** se o banco de dados vazar, todos as senhas ficam expostas.

**O que foi feito:**
```javascript
// server/auth.mjs
const BCRYPT_ROUNDS = 12;  // "custo" do algoritmo

// Ao criar usuario:
const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
const hash = await bcrypt.hash(senhaDigitada, salt);
// O que e salvo: "$2a$12$Rv3nkDrjL8..." (nunca a senha real)

// Ao fazer login:
const senhaCorreta = await bcrypt.compare(senhaDigitada, hashSalvo);
```

**Por que custo 12?** Cada unidade extra dobra o tempo de calculo. Com custo 12, leva ~300ms por tentativa, tornando ataques de dicionario inviáveis (10 milhoes de senhas = 35 dias).

**Por que salt unico?** Impede ataques de "rainbow table" - tabelas pre-calculadas de hashes comuns.

**Referencia:** OWASP Password Storage Cheat Sheet, ISO 27001 A.9.4.3

---

#### Requisito 1.5 e 1.6: Autenticacao de dois fatores (2FA/TOTP)

**O problema sem isso:** mesmo com senha vazada, o atacante ainda precisaria do segundo fator.

**O que foi feito:**
```javascript
// Geracao do QR Code para o Google Authenticator
const secret = otpGenerateSecret();
const uri = generateURI({ secret, label: username, issuer: 'Nex-Chat', type: 'totp' });
// O QR Code e gerado a partir dessa URI

// Verificacao do codigo de 6 digitos
const totp = new TOTP();
totp.options = { window: 1 };  // tolera +/- 30 segundos
const valido = totp.verify({ token: codigoDigitado, secret });
```

**Como funciona:** o algoritmo TOTP (RFC 6238) gera um codigo de 6 digitos novo a cada 30 segundos, usando o horario atual + uma chave secreta. O Google Authenticator e o Authy usam exatamente esse algoritmo.

**Fluxo de ativacao:**
1. Usuario chama `POST /auth/2fa/setup` - recebe QR Code
2. Escaneia com o aplicativo
3. Chama `POST /auth/2fa/confirm` com o primeiro codigo para confirmar
4. A partir dai, todo login exige o codigo de 6 digitos

---

#### Requisito 1.9 e 1.10: Sessoes com JWT

**O problema sem isso:** sem tokens de sessao, o usuario precisaria enviar usuario/senha em toda requisicao.

**O que foi feito:**
```javascript
// Ao fazer login com sucesso:
const token = jwt.sign(
  { username, role, jti: crypto.randomUUID() },
  JWT_SECRET,
  { expiresIn: '8h' }
);
// Retorna: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

// Em cada requisicao protegida (middleware):
const decoded = jwt.verify(authToken, JWT_SECRET);
// Se expirado ou invalido: HTTP 401

// Ao fazer logout - invalida o token:
revokedTokens.add(decoded.jti);
fs.writeFileSync(REVOKED_FILE, JSON.stringify([...revokedTokens]));
```

**O que e o JTI?** Um ID unico por token. Quando o usuario faz logout, esse ID vai para uma "lista negra". Mesmo que alguem tenha o token, ele sera recusado.

**Por que 8 horas?** Equilibrio entre seguranca (token nao fica valido para sempre) e usabilidade (operador nao precisa relogar durante o turno).

---

#### Requisito 1.11: Protecao contra forca bruta

**O problema sem isso:** um atacante pode testar milhoes de senhas automaticamente.

**O que foi feito:**
```javascript
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;  // 15 minutos

// Ao tentar login:
const tentativas = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };

if (tentativas.count >= MAX_ATTEMPTS) {
  const tempoRestante = LOCKOUT_MS - (Date.now() - tentativas.lastAttempt);
  if (tempoRestante > 0) {
    auditLog('ACCOUNT_LOCKED', { username, ip });
    return res.status(429).json({ error: 'Conta bloqueada. Tente em 15 minutos.' });
  }
}
```

**Detalhe importante - protecao contra timing attacks:**
```javascript
// MESMO para usuario inexistente, o bcrypt e executado
// Isso impede descobrir nomes de usuario pelo tempo de resposta
const hashFalso = users['__dummy__']?.passwordHash || await bcrypt.hash('dummy', 10);
await bcrypt.compare(password, hashFalso);
```

---

#### Requisito 2.1 a 2.7: Recuperacao de senha

**O que foi feito:**
```javascript
// Geracao do token de recuperacao
const token = crypto.randomBytes(48).toString('hex');
// Resultado: string de 96 caracteres hexadecimais (384 bits de entropia)

// Armazenado com prazo de validade
recoveryTokens.set(token, {
  username,
  expiresAt: Date.now() + RECOVERY_TTL  // 30 minutos
});

// Ao usar o token (reset de senha):
const entry = recoveryTokens.get(token);
if (!entry || Date.now() > entry.expiresAt) {
  return res.status(400).json({ error: 'Token expirado ou invalido' });
}
recoveryTokens.delete(token);  // uso unico - deletado imediatamente
```

**Por que 384 bits?** E matematicamente impossivel adivinhar. Para comparacao, um token de 8 digitos (como alguns sistemas usam) tem apenas 100.000 possibilidades.

---

### Secao 3 - Criptografia e Comunicacao

#### Requisito 3.1: TLS/HTTPS

O servidor Node.js roda em HTTP na porta 3001 localmente. Em producao, o trafego passa por:

```
Internet (HTTPS/443) --> Cloudflare Tunnel ou Nginx (TLS terminado) --> Node.js (HTTP/3001)
```

Isso e padrao da industria - o Node.js nao precisa gerenciar certificados SSL diretamente.

#### Requisito 3.6 a 3.8: Dados sensiveis em repouso

| Dado | Protecao |
|------|---------|
| Senhas | bcrypt hash (nunca texto plano) |
| JWT_SECRET | Variavel de ambiente (.env fora do git) |
| API keys externas | server/.env (no .gitignore) |
| Chaves de IA | Armazenadas em data.json criptografado |

---

### Secao 4 - Conformidade LGPD

#### Requisito 4.1 a 4.11: Endpoints de direitos dos titulares

**O que foi feito - 4 endpoints obrigatorios:**

```javascript
// Art. 18, I - Direito de Acesso
GET /lgpd/data
// Retorna: quais dados pessoais o sistema guarda sobre o usuario

// Art. 18, V - Portabilidade
GET /lgpd/export
// Retorna: arquivo JSON para download com todos os dados

// Art. 18, VI - Eliminacao
DELETE /lgpd/data
// Remove dados pessoais e registra no log de auditoria

// Art. 7, I e Art. 15 - Consentimento e Revogacao
POST /lgpd/consent
{ "version": "1.0", "given": true }   // registrar consentimento
{ "version": "1.0", "given": false }  // revogar consentimento
```

**Dados coletados pelo sistema (minimizacao - Art. 6, III):**
- Nome e telefone do contato WhatsApp (necessario para atendimento)
- Username do operador (necessario para controle de acesso)
- Historico de conversas (necessario para qualidade do servico)
- **Nao coletado:** dados sensiveis (saude, biometria, orientacao sexual)

---

### Secao 5 - Logs de Auditoria

#### Requisito 5.1 a 5.4: Registro de eventos

**O que foi feito:**
```javascript
// Funcao central de log - usada em todo o sistema
export function auditLog(action, details = {}) {
  const entry = JSON.stringify({
    ts:     new Date().toISOString(),
    action,         // tipo do evento
    ...details,     // dados do contexto
  });
  fs.appendFileSync(AUDIT_LOG, entry + '\n', 'utf8');
}

// Exemplo de uso:
auditLog('LOGIN_SUCCESS', { username, role, ip });
auditLog('LGPD_DATA_DELETION', { username, requestedBy, ip });
```

**Exemplo de linhas no audit.log:**
```json
{"ts":"2026-05-25T22:03:03.097Z","action":"SYSTEM_INIT","msg":"Usuario admin padrao criado."}
{"ts":"2026-05-25T22:03:44.205Z","action":"LOGIN_SUCCESS","username":"gabriel.nascimento","role":"superadmin","ip":"::1"}
{"ts":"2026-05-25T22:05:45.056Z","action":"LGPD_DATA_ACCESS","username":"gabriel.nascimento","ip":"::1"}
```

**14 tipos de evento registrados:**

| Evento | Quando ocorre |
|--------|--------------|
| LOGIN_SUCCESS | Login com sucesso |
| LOGIN_FAILED | Senha incorreta |
| LOGIN_2FA_FAILED | Codigo TOTP invalido |
| ACCOUNT_LOCKED | 5 tentativas falhas |
| LOGOUT | Sessao encerrada |
| PASSWORD_CHANGED | Senha alterada |
| PASSWORD_RECOVERY_REQUESTED | Solicitou recuperacao |
| PASSWORD_RECOVERY_SUCCESS | Senha redefinida |
| PASSWORD_RECOVERY_FAILED | Token invalido/expirado |
| 2FA_ENABLED | 2FA ativado |
| USER_CREATED | Novo operador criado |
| LGPD_DATA_ACCESS | Consultou dados pessoais |
| LGPD_DATA_EXPORT | Exportou dados |
| LGPD_DATA_DELETION | Solicitou exclusao |
| CONSENT_UPDATED | Consentimento registrado/revogado |
| AUTH_REJECTED | Token invalido ou expirado |

---

## 3. Arquivos criados e seus papeis

### Estrutura final do projeto

```
nex-chat/
├── server/
│   ├── auth.mjs           <- NOVO: modulo de seguranca completo (600+ linhas)
│   ├── index.mjs          <- MODIFICADO: integra o auth.mjs, adiciona rotas
│   ├── package.json       <- MODIFICADO: adiciona bcryptjs, jsonwebtoken, otplib, qrcode
│   ├── .env.example       <- NOVO: modelo de variaveis de ambiente
│   └── logs/
│       └── audit.log      <- GERADO em execucao (nao versionado)
├── docs/
│   ├── SECURITY.md        <- NOVO: documentacao tecnica de seguranca
│   ├── ARCHITECTURE.md    <- NOVO: arquitetura e diagramas do sistema
│   ├── resumo-cientifico.md <- NOVO: resumo academico (268 palavras)
│   ├── poster.md          <- NOVO: poster cientifico
│   └── relatorio-auditoria.tex  <- NOVO: relatorio LaTeX (15 paginas)
│   └── relatorio-auditoria.pdf  <- GERADO: PDF compilado do relatorio
├── .gitignore             <- MODIFICADO: exclui segredos e arquivos gerados
└── README.md              <- MODIFICADO: documentacao do projeto
```

### O que cada arquivo entrega para o professor

| Arquivo | Para que serve na avaliacao |
|---------|----------------------------|
| `server/auth.mjs` | Prova que os requisitos 1-5 foram implementados em codigo real |
| `server/index.mjs` | Mostra as rotas REST ativas (testavel via Postman/curl) |
| `docs/relatorio-auditoria.pdf` | Entrega principal - relatorio no formato pedido pelo professor |
| `docs/resumo-cientifico.md` | Requisito 7.1 - resumo de 200-300 palavras |
| `docs/poster.md` | Requisito 7.2 - poster cientifico |
| `docs/SECURITY.md` | Documentacao tecnica detalhada de cada controle |
| `docs/ARCHITECTURE.md` | Documentacao da arquitetura com diagramas |

---

## 4. Como o codigo funciona - explicacao didatica

### O fluxo completo de um login

```
[Frontend/Postman]                    [server/auth.mjs]
      |                                      |
      | POST /auth/login                     |
      | { username, password, totpToken }    |
      |------------------------------------->|
      |                                      |
      |                      1. Verifica se conta esta bloqueada
      |                         (loginAttempts.get(username))
      |                                      |
      |                      2. Busca usuario em users.json
      |                         Se nao existe: bcrypt.compare(dummy)
      |                         para nao vazar informacao por timing
      |                                      |
      |                      3. bcrypt.compare(password, hash)
      |                         Leva ~300ms (intencional)
      |                                      |
      |                      4. Se 2FA ativo:
      |                         TOTP.verify(totpToken, secret)
      |                                      |
      |                      5. jwt.sign({ username, role, jti }, secret)
      |                         Token valido por 8 horas
      |                                      |
      |                      6. auditLog('LOGIN_SUCCESS', { username, ip })
      |                                      |
      |<-------------------------------------|
      | 200 OK { token: "eyJ..." }           |
```

### O fluxo de uma requisicao autenticada

```
[Frontend]                 [requireAuth middleware]          [rota /api/...]
    |                               |                               |
    | GET /api/conversations        |                               |
    | Authorization: Bearer eyJ... |                               |
    |------------------------------>|                               |
    |                               |                               |
    |               jwt.verify(token, JWT_SECRET)                   |
    |               - Verifica assinatura criptografica             |
    |               - Verifica se nao expirou (exp)                 |
    |               - Verifica se nao esta na blacklist (jti)       |
    |                               |                               |
    |                               | req.user = { username, role } |
    |                               |------------------------------>|
    |                               |                               |
    |                               |                 logica da rota|
    |<--------------------------------------------------------------|
    | 200 OK { dados... }           |                               |
```

### Como o TOTP funciona visualmente

```
Servidor                              Google Authenticator
    |                                         |
    | Gera secret aleatorio (20 bytes)        |
    |                                         |
    | Cria QR Code com secret + usuario       |
    |                                         |
    |                     Usuario escaneia QR |
    |                                         |
    | Ambos conhecem: secret + horario atual  |
    | TOTP = HMAC-SHA1(secret, floor(time/30))|
    |                                         |
    | A cada 30 segundos, ambos calculam      |
    | o mesmo codigo de 6 digitos             |
    |                                         |
    | Verificacao: codigo enviado == calculado|
```

---

## 5. O que voce precisa fazer agora

### Checklist para entrega

#### Itens ja prontos (nao precisa fazer nada)

- [x] Codigo implementado em `server/auth.mjs` e `server/index.mjs`
- [x] Relatorio de auditoria PDF em `docs/relatorio-auditoria.pdf`
- [x] Resumo cientifico em `docs/resumo-cientifico.md`
- [x] Poster cientifico em `docs/poster.md`
- [x] Documentacao tecnica em `docs/SECURITY.md` e `docs/ARCHITECTURE.md`
- [x] Repositorio no GitHub: https://github.com/Gabriel-gn21/nex-chat
- [x] Release v1.0.0 com ZIP do projeto e PDF do relatorio

#### O que voce precisa verificar/fazer

**1. Instalar as dependencias do servidor (se ainda nao fez)**
```bash
cd server
npm install
```
Isso instala: bcryptjs, jsonwebtoken, otplib, qrcode, express, cors

**2. Testar se o servidor funciona**
```bash
cd server
node index.mjs
```
Deve aparecer: `[server] Servidor Nex-Chat rodando na porta 3001`

**3. Testar o login via linha de comando**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"gabriel.nascimento","password":"12345678"}'
```
Deve retornar um JSON com `token: "eyJ..."`

**4. Verificar o log de auditoria**
Apos o login, verifique se o arquivo foi criado:
```bash
cat server/logs/audit.log
```

**5. Entregar o PDF ao professor**
O arquivo esta em dois lugares:
- `nex-chat/docs/relatorio-auditoria.pdf` (no projeto)
- `C:\Users\gabri\Downloads\relatorio-auditoria-nex-chat.pdf` (copia em Downloads)

**6. Verificar o GitHub**
Acesse https://github.com/Gabriel-gn21/nex-chat e confirme que:
- O codigo esta la
- O README.md aparece formatado
- A release v1.0.0 esta disponivel com o PDF

---

### Duvidas que podem surgir

**"O professor pediu para rodar o sistema - como eu faco?"**

```bash
# Terminal 1 - Backend
cd "C:\Users\gabri\OneDrive\Área de Trabalho\ClaudeCode\nex-chat\server"
npm install
node index.mjs

# Terminal 2 - Frontend
cd "C:\Users\gabri\OneDrive\Área de Trabalho\ClaudeCode\nex-chat"
npm install
npm run dev
```
Acesse http://localhost:5173

**"Como eu demonstro o 2FA?"**
1. Com o servidor rodando, chame:
   ```
   POST http://localhost:3001/auth/2fa/setup
   Authorization: Bearer <seu-token-jwt>
   ```
2. Escaneia o QR Code com o Google Authenticator
3. No proximo login, inclua o campo `totpToken` com o codigo do app

**"Como eu mostro os logs de auditoria?"**
```bash
cat server/logs/audit.log
# Ou para ver em tempo real:
tail -f server/logs/audit.log
```

**"O professor perguntou sobre o score de seguranca"**
O score foi 74/100 pos-remediacao. Os pontos perdidos foram:
- TLS nao gerenciado pelo Node.js diretamente (delegado ao reverse proxy - pratica padrao)
- JWT secret gerado em runtime quando JWT_SECRET nao esta no .env (aceitavel em dev)
- Sem renovacao automatica de tokens expirados (out of scope para o M2)

---

## 6. Como apresentar o projeto

### Estrutura sugerida de apresentacao (10-15 min)

**Minuto 1-2: Contexto**
> "O Nex-Chat e uma plataforma real de atendimento via WhatsApp. A atividade M2 consistiu em implementar controles de seguranca e conformidade LGPD, e gerar documentacao academica sobre isso."

**Minuto 3-5: Demonstracao ao vivo**
- Abrir o terminal e rodar `node server/index.mjs`
- Fazer um login via Postman ou curl
- Mostrar o token JWT gerado
- Tentar 6 logins incorretos e mostrar o bloqueio (HTTP 429)
- Abrir o `server/logs/audit.log` e mostrar os eventos registrados

**Minuto 6-8: Codigo**
- Abrir `server/auth.mjs` e mostrar:
  - Linha 30: `const BCRYPT_ROUNDS = 12`
  - A funcao `login()` com rate limiting
  - A funcao `auditLog()`
  - Os endpoints LGPD

**Minuto 9-11: Relatorio**
- Abrir o PDF `relatorio-auditoria.pdf`
- Mostrar a tabela de checklist de conformidade (pagina 3-4)
- Mostrar a tabela de score final

**Minuto 12-14: Documentacao**
- Abrir o GitHub: https://github.com/Gabriel-gn21/nex-chat
- Mostrar o README.md
- Mostrar a release v1.0.0

**Minuto 15: Conclusao**
> "O sistema demonstra que e possivel integrar seguranca robusta (ISO 27001) e conformidade legal (LGPD) em plataformas de atendimento sem comprometer a usabilidade."

---

### Perguntas que o professor pode fazer

**"Por que bcrypt e nao SHA-256?"**
> SHA-256 e rapido - projetado para performance. bcrypt e lento de proposito (custo configuravel). Para senhas, voce QUER lentidao para dificultar ataques de forca bruta. Com custo 12, cada tentativa leva ~300ms. Um atacante com GPU top de linha testaria ~3 senhas/segundo vs. bilhoes com SHA-256.

**"O que e JWT e como ele e seguro?"**
> JWT tem tres partes: header.payload.assinatura. O servidor gera a assinatura com uma chave secreta (JWT_SECRET). O cliente manda o token em toda requisicao. O servidor verifica a assinatura - se alguem alterar o payload, a assinatura nao bate. O token tambem expira em 8 horas, e ao fazer logout, o JTI (ID unico do token) vai para uma lista negra.

**"O que e TOTP e como ele funciona?"**
> TOTP (RFC 6238) usa uma chave secreta compartilhada + o horario atual. O algoritmo e: HMAC-SHA1(secret, floor(timestamp/30)). O resultado vira um codigo de 6 digitos. Como servidor e aplicativo usam o mesmo secret e o mesmo horario, chegam ao mesmo codigo. O codigo muda a cada 30 segundos.

**"Por que a LGPD e relevante para esse sistema?"**
> O Nex-Chat processa dados pessoais de clientes (nome, telefone do WhatsApp). O Art. 18 da LGPD garante aos titulares o direito de saber quais dados existem, exportar esses dados, e solicitar exclusao. Implementamos endpoints REST para cada um desses direitos, com registro em log de auditoria para comprovar conformidade.

**"Qual e a diferenca entre autenticacao e autorizacao?"**
> Autenticacao (quem e voce?) e feita no login com usuario/senha/2FA, gerando um JWT. Autorizacao (o que voce pode fazer?) e feita no middleware `requireAuth` que le o `role` do JWT - `superadmin` tem acesso a tudo, `admin` nao acessa logs de auditoria de outros usuarios, `operator` nao cria usuarios.

---

## 7. Perguntas frequentes e respostas

**P: O sistema funciona mesmo sem a Evolution API (WhatsApp)?**
R: Sim. A autenticacao, os logs, os endpoints LGPD e tudo relacionado a seguranca funciona independentemente da Evolution API. Voce pode demonstrar tudo via Postman/curl sem precisar do WhatsApp conectado.

**P: Onde fica o PDF do relatorio?**
R: Em dois lugares:
- `nex-chat/docs/relatorio-auditoria.pdf`
- `C:\Users\gabri\Downloads\relatorio-auditoria-nex-chat.pdf`

**P: Como abro o relatorio?**
R: E um PDF padrao - pode abrir com qualquer leitor (Adobe Reader, Edge, Chrome).

**P: O GitHub esta publico?**
R: Sim. https://github.com/Gabriel-gn21/nex-chat esta publico e acessivel.

**P: O arquivo .env esta no GitHub?**
R: Nao - o `.gitignore` exclui `server/.env`. Existe um `server/.env.example` como modelo, mas sem valores reais. Isso e pratica correta de seguranca.

**P: Qual o link direto para o release com o PDF?**
R: https://github.com/Gabriel-gn21/nex-chat/releases/tag/v1.0.0

---

## Resumo executivo do que foi entregue

| Artefato | Status | Localizacao |
|----------|--------|------------|
| Modulo de seguranca (auth.mjs) | Implementado | server/auth.mjs |
| Rotas de seguranca integradas | Implementado | server/index.mjs |
| Relatorio de auditoria (PDF) | Gerado | docs/relatorio-auditoria.pdf |
| Resumo cientifico (268 palavras) | Escrito | docs/resumo-cientifico.md |
| Poster cientifico | Escrito | docs/poster.md |
| Documentacao de seguranca | Escrita | docs/SECURITY.md |
| Documentacao de arquitetura | Escrita | docs/ARCHITECTURE.md |
| Repositorio GitHub publico | Publicado | github.com/Gabriel-gn21/nex-chat |
| Release v1.0.0 com assets | Publicado | .../releases/tag/v1.0.0 |

**Score de seguranca: 74/100** (pos-remediacao, conforme metodologia do professor)

---

*Documento gerado em 26/05/2026 | Nex-Chat M2 - UMC - Prof. Dr. Fabiano Menegidio*
