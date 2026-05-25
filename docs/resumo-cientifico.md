# Resumo Científico - Nex-Chat

## Plataforma de Atendimento via WhatsApp com Segurança da Informação e Conformidade LGPD

**Gabriel Nascimento**
Universidade de Mogi das Cruzes - UMC
Engenharia de Software / Segurança da Informação
2026

---

## Resumo

O presente trabalho descreve o desenvolvimento e a análise de segurança do **Nex-Chat**, uma plataforma de atendimento ao cliente via WhatsApp Business, construída sobre arquitetura em camadas com Node.js (ESM), React e integração com a Evolution API. O objetivo principal consiste em demonstrar a aplicação de práticas consolidadas de segurança da informação - alinhadas à norma ABNT NBR ISO/IEC 27001:2022 - e de conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD) em um sistema de produção real.

A metodologia adotada compreendeu: (i) implementação de autenticação com hash bcrypt (fator de custo 12, salt único por usuário), sessões JWT com expiração de oito horas e invalidação no logout via blacklist; (ii) mecanismo de autenticação de dois fatores (2FA) baseado em TOTP (RFC 6238), compatível com aplicativos autenticadores padrão; (iii) proteção contra ataques de força bruta mediante limitação de tentativas e bloqueio temporário de conta; (iv) fluxo seguro de recuperação de senha com token criptograficamente aleatório de 96 caracteres hexadecimais e validade de trinta minutos; e (v) registro imutável de eventos de segurança em arquivo de auditoria (JSON-Lines).

No âmbito da LGPD, foram implementados endpoints RESTful para exercício dos direitos dos titulares: acesso, portabilidade, eliminação e registro/revogação de consentimento, em conformidade com o Art. 18 da lei. A plataforma processa exclusivamente dados pessoais comuns (nome e telefone de contato), com finalidade determinada, minimização de coleta e retenção limitada.

Os resultados demonstram que é viável integrar requisitos de segurança da informação e conformidade legal em sistemas de atendimento de pequeno porte sem comprometer a usabilidade operacional, servindo como referência para projetos similares no contexto empresarial brasileiro.

**Palavras-chave**: Segurança da Informação; LGPD; Autenticação; bcrypt; JWT; 2FA; WhatsApp; Node.js.

---

**Contagem de palavras**: ~268 palavras (entre 200 e 300 - requisito 7.1 atendido)
