# Log Anonymizer

## Padronização e Anonimização de dados em arquivos de LOG - CSV/TXT

<br />

<div align="center">
	<img src="https://i.imgur.com/r9lrbPG.png" title="source: imgur.com" width="35%"/>
</div>

<br />

<div align="center">
  <img src="https://img.shields.io/badge/licen%C3%A7a-MIT-00ff9f?style=flat-square" alt="Licença MIT">
  <img src="https://img.shields.io/badge/LGPD-compliant-ff4d6d?style=flat-square" alt="LGPD compliant">
  <img src="https://img.shields.io/badge/tecnologia-HTML%20%2B%20JS%20puro-7b61ff?style=flat-square" alt="Tecnologia HTML + JS puro">
  <img src="https://img.shields.io/badge/depend%C3%AAncias-nenhuma-00ff9f?style=flat-square" alt="Dependências nenhuma">
</div>


---

## Visão Geral

O **CSV Log Anonymizer** é uma aplicação de página única (HTML/JS) que roda **inteiramente no navegador** — nenhum dado é transmitido a servidores externos. Ele processa arquivos de log nos formatos CSV e TXT/LOG aplicando um conjunto completo de regras de tratamento e anonimização, produzindo um dataset padronizado, seguro e pronto para análise por modelos de IA.

```
Arquivo CSV ou TXT/LOG  →  Parsing & Limpeza  →  Anonimização LGPD  →  Validação Amostral  →  CSV seguro
```

---

## Funcionalidades Principais

### Formatos de Entrada Suportados

| Formato | Detalhes |
|---|---|
| **CSV** | Separadores configuráveis: vírgula, ponto-e-vírgula, tab ou pipe |
| **TXT / LOG** | Auto-detecção de 5 padrões de log (syslog, bracket level, level-only, timestamped, plain) |

**Padrões de log TXT reconhecidos automaticamente:**

```
2024-06-01 09:00:15 INFO  EventName - Mensagem de log
2024-06-01 09:00:15 [INFO] EventName - Mensagem de log
2024-06-01 09:00:15 ERROR Mensagem sem nome de evento
2024-06-01 09:00:15 Mensagem sem nível
Linha de texto simples sem timestamp
```

### Tratamento e Padronização (Automático)

| Regra | Comportamento |
|---|---|
| **Cabeçalhos PascalCase** | Cada palavra inicia com maiúscula, sem espaços ou acentos |
| **Separador de saída** | Sempre `;` (ponto-e-vírgula), com BOM UTF-8 para compatibilidade com Excel |
| **Valores ausentes** | Preenchidos com `Não informado` |
| **Deduplicação** | Linhas idênticas removidas automaticamente |
| **Normalização de colunas** | Cada linha garantida com o mesmo número de campos |
| **Decimal PT-BR** | Separador decimal ponto (`.`) convertido para vírgula (`,`) |

### Anonimização e Segurança (Inline + Por Coluna)

| Tipo | Resultado |
|---|---|
| Endereços IP (v4 e v6) | `IP_GERAL` |
| E-mails | `EMAIL_GERAL` |
| CPF | `CPF_GERAL` |
| CNPJ | `CNPJ_GERAL` |
| Domínios e URLs | `DOMINIO_GERAL` |
| Nomes de usuários (coluna dedicada) | `Usuario_N` (pseudônimo consistente) |
| Nomes de usuários inline no texto | `[USER_REDACTED]` (detectado por `User 'x'`, `login: x`, etc.) |
| Nomes de empresas | `Empresa_N` (pseudônimo consistente) |
| Servidores (coluna dedicada) | `Servidor_N` (pseudônimo consistente) |
| Caminhos de diretório (Unix/Windows) | `[PATH_REDACTED]` |
| Servidores internos (inline) | `[SERVER_REDACTED]` |
| Datas | `YYYY-MM-XX` (dia removido) |
| Colunas confidenciais | Apagadas |

### Preservação Inteligente de Contexto

- Colunas de **Serviços Afetados** são preservadas com sanitização inline
- Colunas de **Feedback, Detalhes e Descrição** mantêm o conteúdo original, removendo apenas dados identificáveis embutidos
- Pseudônimos são **consistentes** ao longo de todo o arquivo (`Usuario_1` sempre referencia o mesmo indivíduo)
- A **classificação do pseudônimo** (usuário, empresa ou servidor) é determinada pelo **nome da coluna**, não pelo conteúdo do valor

### Validação Amostral

Verificação automática de 15 linhas aleatórias do output para confirmar que nenhum dado sensível permaneceu identificável, com relatório por categoria (IPs, e-mails, CPFs, CNPJs, paths, servidores).

---

## Como Usar

**Nenhuma instalação necessária.** Basta abrir o arquivo `csv-anonymizer.html` em qualquer navegador moderno.

### Passo a Passo

1. **Selecione o arquivo** — arraste ou clique para fazer upload do CSV, TXT ou LOG
2. **Configure o separador de entrada** — vírgula, ponto-e-vírgula, tab ou pipe (apenas para CSV)
3. **Revise as colunas** — use "Auto-detectar" ou ajuste manualmente o tipo de anonimização de cada coluna
4. **Visualize** — pré-visualização ao vivo com valores tratados (vermelho = anonimizado, amarelo = preenchido)
5. **Valide** — clique em "Validar Amostra" para confirmar a limpeza do dataset
6. **Exporte** — clique em "Processar & Baixar CSV" para obter o arquivo final

### Tipos de Tratamento por Coluna

| Tipo | Descrição |
|---|---|
| `Manter (sanitizar inline)` | Preserva o valor, mas remove dados sensíveis embutidos no texto |
| `Manter — Nível de Log` | Preserva o valor original sem sanitização (ideal para `INFO`, `ERROR`, etc.) |
| `Pseudônimo` | Substitui por `Usuario_N`, `Empresa_N` ou `Servidor_N` conforme o nome da coluna |
| `Sanitizar texto` | Remove IPs, e-mails, paths, usernames e outros identificadores do texto |
| `→ IP_GERAL` | Substitui o campo inteiro por `IP_GERAL` |
| `→ EMAIL_GERAL` | Substitui o campo inteiro por `EMAIL_GERAL` |
| `→ CPF_GERAL` | Substitui o campo inteiro por `CPF_GERAL` |
| `→ CNPJ_GERAL` | Substitui o campo inteiro por `CNPJ_GERAL` |
| `→ DOMINIO_GERAL` | Substitui o campo inteiro por `DOMINIO_GERAL` |
| `Anonimizar Data` | Mantém ano e mês, remove o dia (`2024-03-XX`) |
| `Apagar coluna` | Remove o valor da coluna (campo fica vazio) |

---

## Compatibilidade

| Navegador | Suporte |
|---|---|
| Google Chrome 90+ | ✅ |
| Mozilla Firefox 88+ | ✅ |
| Microsoft Edge 90+ | ✅ |
| Safari 14+ | ✅ |
| Opera 76+ | ✅ |

**APIs utilizadas:** `FileReader`, `Blob`, `URL.createObjectURL`, `navigator.clipboard`

---

## Privacidade e Segurança

- **100% client-side** — nenhum dado sai do navegador
- **Sem dependências externas** de runtime (fontes do Google são opcionais e podem ser removidas)
- **Sem localStorage** — nenhum dado persiste entre sessões
- **Sem rastreamento** — sem analytics, sem cookies

---

## Estrutura do Projeto

```
📦anonymizer
 ┣ 📂assets
 ┃ ┣ 📂css
 ┃ ┃ ┗ 📜styles.css
 ┃ ┣ 📂img
 ┃ ┃ ┗ 📜favicon.svg
 ┃ ┗ 📂js
 ┃ ┃ ┗ 📜scripts.js
 ┣ 📂docs
 ┃ ┗ 📜anonymizer.md
 ┣ 📜.gitignore
 ┣ 📜index.html
 ┗ 📜README.md
```

---

## Conformidade LGPD

Esta ferramenta foi desenvolvida para auxiliar equipes a preparar datasets em conformidade com a **Lei Geral de Proteção de Dados (Lei nº 13.709/2018)**. As regras implementadas cobrem os principais artigos relacionados ao tratamento de dados pessoais sensíveis, pseudonimização e minimização de dados.

> **Aviso:** Esta ferramenta é um auxílio técnico. A conformidade legal final deve ser validada pela equipe jurídica ou DPO responsável.

---

## Licença

MIT © 2025