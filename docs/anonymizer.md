# Documentação Técnica — CSV Log Anonymizer

**Versão:** 2.1.0
 **Última atualização:** 2025
 **Conformidade:** LGPD (Lei nº 13.709/2018)

------

## Sumário

1. [Arquitetura](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#1-arquitetura)
2. [Fluxo de Processamento](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#2-fluxo-de-processamento)
3. [Regras de Tratamento de Dados](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#3-regras-de-tratamento-de-dados)
4. [Parser de Arquivos TXT/LOG](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#4-parser-de-arquivos-txtlog)
5. [Engine de Anonimização](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#5-engine-de-anonimização)
6. [Sistema de Pseudônimos](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#6-sistema-de-pseudônimos)
7. [Auto-detecção de Colunas](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#7-auto-detecção-de-colunas)
8. [Validação Amostral](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#8-validação-amostral)
9. [Formato de Saída](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#9-formato-de-saída)
10. [Referência de Expressões Regulares](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#10-referência-de-expressões-regulares)
11. [Exemplos de Transformação](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#11-exemplos-de-transformação)
12. [Decisões de Design](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#12-decisões-de-design)
13. [Limitações Conhecidas](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#13-limitações-conhecidas)
14. [Conformidade LGPD](https://claude.ai/chat/09d01739-fb53-4df5-bf87-057caa81dad0#14-conformidade-lgpd)

------

## 1. Arquitetura

### Visão Geral

A aplicação é um único arquivo HTML auto-contido com CSS e JavaScript inline. Não possui dependências externas de runtime, build system ou servidor — funciona abrindo o arquivo diretamente no navegador.

```
┌─────────────────────────────────────────────────────────┐
│                     Navegador (Client)                   │
│                                                         │
│  ┌──────────┐   ┌──────────────────┐   ┌─────────────┐ │
│  │  FileAPI  │──▶│  Parser CSV/TXT  │──▶│  Trat./Anon │ │
│  └──────────┘   └──────────────────┘   └──────┬──────┘ │
│                                                │         │
│  ┌──────────┐   ┌──────────┐   ┌──────────────▼──────┐ │
│  │ Download │◀──│  Encoder │◀──│    Validação         │ │
│  └──────────┘   └──────────┘   └─────────────────────┘ │
│                                                         │
│  ⚠ Nenhum dado sai do navegador                        │
└─────────────────────────────────────────────────────────┘
```

### Componentes Principais

| Módulo                | Função                                                       |
| --------------------- | ------------------------------------------------------------ |
| **File Handler**      | Leitura do arquivo via `FileReader` com detecção automática de codificação (UTF-8, UTF-16LE/BE, Windows-1252) |
| **CSV Parser**        | Parser com suporte a campos entre aspas e separadores configuráveis |
| **TXT/LOG Parser**    | Parser com auto-detecção de formato entre 5 padrões de log estruturado |
| **PascalCase Engine** | Normalização de cabeçalhos sem acentos e caracteres especiais |
| **Deduplicator**      | Remoção de linhas duplicadas via `Set` com chave hash        |
| **Sanitize Engine**   | Motor de regex inline aplicado a qualquer valor de texto     |
| **Pseudonym Maps**    | Três mapas de substituição consistente: `userMap`, `companyMap`, `serverMap` |
| **Anonymizer**        | Roteador de tipos de anonimização por coluna                 |
| **Validator**         | Verificação amostral do output por categorias de dados sensíveis |
| **CSV Encoder**       | Geração do arquivo CSV final com BOM UTF-8 e processamento assíncrono em chunks |

------

## 2. Fluxo de Processamento

```
Arquivo CSV ou TXT/LOG de entrada
        │
        ▼
┌───────────────────┐
│ 1. Leitura        │  FileReader API · detecção automática de codificação
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 2. Roteamento     │  Extensão .csv → CSV Parser | .txt/.log → TXT/LOG Parser
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 3. Parsing        │  CSV: separador configurável + suporte a aspas
│                   │  TXT: auto-detecção de padrão de log em 5 formatos
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 4. Normalização   │  PascalCase nos cabeçalhos · Normalização de colunas por linha
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 5. Deduplicação   │  Remoção de linhas 100% idênticas
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 6. Config. colunas│  Auto-detecção ou configuração manual por tipo
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 7. Anonimização   │  Aplicação das regras célula a célula
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 8. Preenchimento  │  Células vazias → "Não informado"
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 9. Validação      │  Amostragem aleatória · 6 categorias de dados sensíveis
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 10. Exportação    │  CSV com BOM UTF-8 · separador ; · CRLF
└───────────────────┘
```

------

## 3. Regras de Tratamento de Dados

### 3.1 Conversão de Cabeçalhos para PascalCase

Todos os cabeçalhos são convertidos automaticamente para PascalCase. A transformação segue estas etapas em ordem:

1. Normalização Unicode NFD (decomposição de caracteres acentuados)
2. Remoção de diacríticos (acentos, cedilha, til, etc.)
3. Substituição de caracteres especiais por espaço
4. Colapso de espaços múltiplos
5. Divisão por espaços e underscores
6. Capitalização da primeira letra de cada palavra
7. Junção sem separador

**Exemplos:**

| Cabeçalho Original  | PascalCase         |
| ------------------- | ------------------ |
| `nome do usuário`   | `NomeDoUsuario`    |
| `e-mail`            | `Email`            |
| `data_criacao`      | `DataCriacao`      |
| `IP Address`        | `IpAddress`        |
| `CNPJ/CPF`          | `CnpjCpf`          |
| `Serviços Afetados` | `ServicosAfetados` |

**Implementação:**

```javascript
function toPascalCase(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^a-zA-Z0-9\s_]/g, ' ')                  // especiais → espaço
    .replace(/\s+/g, ' ').trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('') || 'Coluna';
}
```

### 3.2 Normalização de Linhas

Cada linha de dados é normalizada para ter exatamente o mesmo número de colunas que o cabeçalho:

- **Linhas com menos colunas:** campos vazios (`''`) adicionados ao final
- **Linhas com mais colunas:** colunas excedentes truncadas

### 3.3 Deduplicação

Linhas 100% idênticas são removidas. A detecção usa um `Set` com chave composta por todos os campos separados por `\x00` (caractere nulo, improvável em dados reais).

```javascript
const seen = new Set();
const key = row.join('\x00');
if (!seen.has(key)) { seen.add(key); unique.push(row); }
```

### 3.4 Preenchimento de Valores Ausentes

Qualquer campo vazio, `null`, `undefined` ou composto apenas por espaços é substituído por `Não informado` no momento da anonimização, exceto em colunas configuradas como "Apagar coluna".

### 3.5 Normalização de Decimal

Valores que correspondem ao padrão de número decimal com ponto (`^\d+\.\d+$`) têm o ponto substituído por vírgula, conforme o padrão PT-BR.

### 3.6 Detecção de Codificação

O arquivo é lido como `ArrayBuffer` e a codificação é detectada automaticamente antes do decode:

| Condição                         | Codificação detectada |
| -------------------------------- | --------------------- |
| BOM `EF BB BF`                   | UTF-8                 |
| BOM `FF FE`                      | UTF-16LE              |
| BOM `FE FF`                      | UTF-16BE              |
| Decodificação UTF-8 bem-sucedida | UTF-8                 |
| Falha na decodificação UTF-8     | Windows-1252          |

O usuário pode sobrescrever a detecção automática via seletor de codificação na interface.

------

## 4. Parser de Arquivos TXT/LOG

Arquivos com extensão `.txt` ou `.log` são processados por um parser especializado que detecta automaticamente o formato de log predominante.

### 4.1 Padrões Suportados (em ordem de prioridade)

| #    | Formato                  | Exemplo                                             | Colunas geradas                           |
| ---- | ------------------------ | --------------------------------------------------- | ----------------------------------------- |
| 1    | Syslog com evento        | `2024-06-01 09:00:15 INFO  Login - User logged in`  | `Data · Hora · Nivel · Evento · Mensagem` |
| 2    | Bracket level com evento | `2024-06-01 09:00:15 [INFO] Login - User logged in` | `Data · Hora · Nivel · Evento · Mensagem` |
| 3    | Level sem evento         | `2024-06-01 09:00:15 ERROR Something failed`        | `Data · Hora · Nivel · Mensagem`          |
| 4    | Timestamp sem level      | `2024-06-01 09:00:15 Texto livre`                   | `Data · Hora · Mensagem`                  |
| 5    | Texto simples (fallback) | `Qualquer linha de texto`                           | `Mensagem`                                |

> Os padrões 1 e 2 são detectados pela mesma expressão regular, com e sem colchetes ao redor do nível.

### 4.2 Algoritmo de Detecção

A detecção testa cada padrão (exceto o fallback) contra **todas as linhas do arquivo** e seleciona o padrão que obtiver o maior número de correspondências. Linhas que não correspondem ao padrão majoritário têm seu conteúdo integral colocado na última coluna.

```javascript
let bestPattern = fallback;
let bestCount = 0;
for (const p of PATTERNS.slice(0, -1)) {
  const count = lines.filter(l => p.re.test(l.trim())).length;
  if (count > bestCount) { bestCount = count; bestPattern = p; }
}
```

### 4.3 Comportamento Pós-parsing

Após a detecção e parsing, o fluxo é idêntico ao do CSV: normalização PascalCase, deduplicação, contagem de campos vazios, auto-detecção de tipos de coluna e renderização da interface.

------

## 5. Engine de Anonimização

### 5.1 Sanitização Inline (`sanitizeText`)

A sanitização inline é aplicada a **qualquer valor de texto**, independentemente do tipo de coluna configurado. As substituições ocorrem na seguinte ordem (importante para evitar conflitos):

| Ordem | Padrão detectado                                             | Substituição        |
| ----- | ------------------------------------------------------------ | ------------------- |
| 1     | Caminhos Windows (`C:\pasta\arquivo`)                        | `[PATH_REDACTED]`   |
| 2     | Caminhos Unix com prefixos internos (`/home/`, `/var/`, `/etc/`, etc.) | `[PATH_REDACTED]`   |
| 3     | Caminhos Unix genéricos (3+ segmentos)                       | `[PATH_REDACTED]`   |
| 4     | IPv6 completo                                                | `IP_GERAL`          |
| 5     | IPv4 (`x.x.x.x`)                                             | `IP_GERAL`          |
| 6     | Endereços de e-mail                                          | `EMAIL_GERAL`       |
| 7     | CPF (formatado ou não)                                       | `CPF_GERAL`         |
| 8     | CNPJ (formatado ou não)                                      | `CNPJ_GERAL`        |
| 9     | URLs completas (`http://`, `https://`)                       | `DOMINIO_GERAL`     |
| 10    | Domínios com `www.`                                          | `DOMINIO_GERAL`     |
| 11    | Nomes de servidores internos                                 | `[SERVER_REDACTED]` |
| 12    | Usernames inline entre aspas (`User 'x'`, `user "x"`)        | `[USER_REDACTED]`   |
| 13    | Usernames após dois-pontos (`username: x`, `login: x`)       | `[USER_REDACTED]`   |

> **Nota:** A ordem é crítica. Caminhos são processados antes de IPs para evitar que segmentos numéricos de paths sejam capturados pela regex de IPv4. Usernames são processados por último para não interferir com os demais padrões.

### 5.2 Tipos de Anonimização por Coluna

#### `keep` — Manter com Sanitização Inline

O valor original é preservado, mas passa obrigatoriamente pela sanitização inline (`sanitizeText`). Dados sensíveis embutidos no texto são substituídos.

#### `keep_level` — Manter Nível de Log

O valor é preservado **sem** sanitização inline. Destinado a colunas de nível de log (`INFO`, `ERROR`, `WARNING`, etc.) cujo conteúdo nunca contém dados pessoais e não deve ser alterado.

#### `pseudonym` — Pseudônimo Consistente

O valor é substituído por um pseudônimo genérico e consistente ao longo de todo o dataset. O tipo de pseudônimo é determinado pelo **nome da coluna**, não pelo conteúdo do valor:

- **`Empresa_N`**: colunas com `empresa`, `company`, `organiz`, `client`, `fornec`, `parceiro` ou `cnpj` no nome
- **`Servidor_N`**: colunas com `servidor` ou `server` no nome
- **`Usuario_N`**: todos os outros casos (padrão)

#### `sanitize` — Sanitização Completa de Texto

Equivalente ao modo `keep`, mas sinalizado visualmente na interface como tratado. Ideal para colunas de texto livre (logs, mensagens de erro, descrições) onde o contexto deve ser mantido.

#### `generic_ip` / `generic_email` / `generic_cpf` / `generic_cnpj` / `generic_domain`

O campo inteiro é substituído pelo marcador genérico correspondente, independentemente do conteúdo.

#### `date` — Anonimização de Data

Remove o dia da data, preservando apenas ano e mês:

| Entrada           | Saída        |
| ----------------- | ------------ |
| `2024-03-15`      | `2024-03-XX` |
| `2024/03/15`      | `2024-03-XX` |
| `15/03/2024`      | `XX-2024`    |
| `outros formatos` | `XXXX-XX-XX` |

#### `delete` — Apagar Coluna

O campo é esvaziado. Diferente de "Não informado" — o campo fica literalmente em branco.

### 5.3 Colunas com Preservação Forçada

Independentemente do tipo configurado pelo usuário, colunas cujos nomes correspondem aos padrões abaixo são sempre processadas com sanitização inline (nunca substituídas por marcadores genéricos):

- **Serviços/Afetados:** `/servico|service|afetado|affected/i`
- **Feedback/Comentários:** `/feedback|comentario|comment|observ|avaliacao/i`

Isso garante que o contexto técnico e o conteúdo de feedback sejam preservados enquanto dados identificáveis embutidos são removidos.

------

## 6. Sistema de Pseudônimos

### Funcionamento

Os pseudônimos são gerados a partir de três mapas independentes, cada um com seu contador sequencial:

```javascript
userMap    = { "jdoe": "Usuario_1", "asmith": "Usuario_2" }
companyMap = { "empresa xyz ltda": "Empresa_1", "acme corp": "Empresa_2" }
serverMap  = { "web-server-01": "Servidor_1", "db-prod": "Servidor_2" }
```

A chave de lookup é sempre o valor original em minúsculas e sem espaços extras (`val.trim().toLowerCase()`).

### Determinação do Tipo por Nome de Coluna

A função `pseudoPrefix` analisa o **nome da coluna** (não o valor) para decidir qual mapa e prefixo usar:

```javascript
function pseudoPrefix(colName) {
  if (/empresa|company|organiz|client|fornec|parceiro|cnpj/i.test(colName))
    return ['Empresa', companyMap, companyCtr];
  if (/servidor|server/i.test(colName))
    return ['Servidor', serverMap, serverCtr];
  return ['Usuario', userMap, userCtr]; // padrão
}
```

> Esta abordagem é mais estável que analisar o valor: nomes de empresas sem sufixo jurídico, usuários com nomes corporativos e servidores com nomes ambíguos são todos classificados corretamente com base no contexto semântico da coluna.

### Consistência

O mesmo valor original sempre recebe o mesmo pseudônimo dentro de um processamento. Isso é essencial para manter a integridade referencial do dataset — por exemplo, todas as ocorrências de um mesmo usuário em diferentes linhas serão representadas pelo mesmo `Usuario_N`.

### Reset

Os três mapas são reiniciados a cada novo processamento (`processAndDownload`) e a cada validação amostral (`runValidation`). Isso garante numeração sequencial limpa e consistente no arquivo final.

------

## 7. Auto-detecção de Colunas

A função `autoDetect()` analisa o **nome de cada cabeçalho** (já em PascalCase) e atribui automaticamente o tipo de anonimização mais adequado. As regras são verificadas em ordem de prioridade:

| Prioridade | Tipo             | Padrões no nome da coluna                                    |
| ---------- | ---------------- | ------------------------------------------------------------ |
| 1          | `generic_ip`     | `ip`, `ipaddr`, `enderecoip`                                 |
| 2          | `generic_email`  | `email`, `mail`, `correio`                                   |
| 3          | `generic_cpf`    | `cpf`                                                        |
| 4          | `generic_cnpj`   | `cnpj`                                                       |
| 5          | `generic_domain` | `dominio`, `domain`, `url`, `site`                           |
| 6          | `pseudonym`      | `nome`, `name`, `id[Maiúscula]`, `[a-z]+Id`, `usuario`, `user`, `login`, `author`, `empresa`, `company`, `cliente`, `client`, `organiz*`, `servidor` |
| 7          | `date`           | `data`, `date`, `timestamp`, `created`, `updated`, `dt_`, `hora`, `time` (exceto `timeout` e variantes) |
| 8          | `keep_level`     | `nivel`, `level`, `severity`, `prioridade`, `loglevel`       |
| 9          | `sanitize`       | `detalhe`, `detail`, `descri*`, `mensagem`, `message`, `log`, `erro`, `error`, `stack`, `path`, `caminho`, `feedback`, `comentario`, `comment`, `observ*`, `evento`, `event` |
| 10         | `delete`         | `senha`, `password`, `pass`, `token`, `secret`, `private`, `chave`, `key` (exceto `keyword`) |
| —          | `keep`           | Padrão para qualquer coluna não identificada                 |

> **Importante:** A auto-detecção é uma sugestão inicial. Recomenda-se sempre revisar e ajustar manualmente conforme o contexto específico do dataset.

------

## 8. Validação Amostral

### Metodologia

Após o processamento, a validação seleciona aleatoriamente até 15 linhas do dataset já anonimizado e verifica a presença de padrões de dados sensíveis nas células resultantes.

### Categorias Verificadas

| Categoria           | Expressão Regular                                            |
| ------------------- | ------------------------------------------------------------ |
| IPs IPv4            | `\b(?:\d{1,3}\.){3}\d{1,3}\b`                                |
| E-mails             | `\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b`       |
| CPFs                | `\b\d{3}[.\-]?\d{3}[.\-]?\d{3}[.\-]?\d{2}\b`                 |
| CNPJs               | `\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[.\-]?\d{2}\b`               |
| Paths Unix/Win      | `(?:[A-Za-z]:\                                               |
| Servidores internos | `\b(?:srv|db|server|node|replica|master|slave)\d*[-.][\w.\-]+\b` |

### Interpretação dos Resultados

- **✓ Limpo:** Nenhuma ocorrência do padrão encontrada na amostra
- **✗ Detectado:** Possível dado sensível remanescente — revisar o tipo de anonimização das colunas sinalizadas

> **Atenção:** A validação é amostral (máximo 15 linhas). Um resultado "limpo" indica que a amostra está correta, mas não garante matematicamente que todo o dataset está livre de dados sensíveis. Para datasets críticos, recomenda-se aumentar a amostragem ou realizar verificação adicional pós-exportação.

------

## 9. Formato de Saída

### Especificações do CSV Gerado

| Atributo             | Valor                                                        |
| -------------------- | ------------------------------------------------------------ |
| Separador de colunas | `;` (ponto-e-vírgula)                                        |
| Separador de linhas  | `\r\n` (CRLF — padrão RFC 4180)                              |
| Codificação          | UTF-8 com BOM (`\uFEFF`)                                     |
| Aspas                | Campos com `;`, `"`, `\n` ou `\r` são envolvidos em aspas duplas |
| Aspas internas       | Dobradas (`""`) conforme RFC 4180                            |
| Nome do arquivo      | `lgpd_anonimizado_{timestamp}.csv`                           |

### Por Que BOM UTF-8?

O BOM (`\uFEFF`) é adicionado ao início do arquivo para garantir que o Microsoft Excel reconheça automaticamente a codificação UTF-8, evitando problemas de exibição de caracteres especiais (acentos, cedilha, etc.) ao abrir o arquivo diretamente.

### Processamento Assíncrono

O processamento é feito em chunks de 300 linhas com `setTimeout`, liberando o event loop entre os chunks para manter a interface responsiva em arquivos grandes. Uma barra de progresso exibe o andamento em tempo real.

------

## 10. Referência de Expressões Regulares

### Regex de Sanitização (`sanitizeText`)

```javascript
// Caminhos Windows
/[A-Za-z]:\\(?:[^\s";<>|,\r\n]+)/g  →  [PATH_REDACTED]

// Caminhos Unix (prefixos internos)
/(?:\/(?:home|var|etc|usr|opt|srv|tmp|root|data|app|logs?|
   proc|sys|mnt|media|api|backend|frontend|deploy)[^\s";<>|,\r\n]*)/g  →  [PATH_REDACTED]

// Caminhos Unix genéricos (3+ segmentos)
/(?:\/[a-zA-Z0-9_.~-]+){3,}/g  →  [PATH_REDACTED]

// IPv6
/\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g  →  IP_GERAL

// IPv4
/\b(?:\d{1,3}\.){3}\d{1,3}\b/g  →  IP_GERAL

// E-mail
/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g  →  EMAIL_GERAL

// CPF (com ou sem formatação)
/\b\d{3}[.\-]?\d{3}[.\-]?\d{3}[.\-]?\d{2}\b/g  →  CPF_GERAL

// CNPJ (com ou sem formatação)
/\b\d{2}[.\-]?\d{3}[.\-]?\d{3}[\/]?\d{4}[.\-]?\d{2}\b/g  →  CNPJ_GERAL

// URLs completas
/https?:\/\/(?:www\.)?([A-Za-z0-9\-\.]+\.[A-Za-z]{2,})[^\s";<,]*/g  →  DOMINIO_GERAL

// Domínios www
/\bwww\.[A-Za-z0-9\-]+\.[A-Za-z]{2,}\b/g  →  DOMINIO_GERAL

// Servidores internos
/\b(?:srv|server|db|database|app|api|proxy|lb|cache|node|host|
    worker|master|slave|replica|prod|staging|dev|web)\d*[-.][\w.\-]+\b/gi  →  [SERVER_REDACTED]

// Usernames entre aspas simples ou duplas (ex: User 'jdoe', user "admin")
/\b(user|usuario|username|login)\s*['"]([A-Za-z0-9._\-@]+)['"]/gi
    →  <keyword> '[USER_REDACTED]'

// Usernames após dois-pontos (ex: username: jdoe, login: admin@corp)
/\b(username|login)\s*:\s*([A-Za-z0-9._\-@]+)/gi
    →  <keyword>: [USER_REDACTED]
```

### Regex de Auto-detecção de Colunas (`DETECT`)

```javascript
generic_ip:      /\bip\b|ipaddr|endereco.?ip/i
generic_email:   /email|e.?mail|mail\b|correio/i
generic_cpf:     /\bcpf\b/i
generic_cnpj:    /\bcnpj\b/i
generic_domain:  /dominio|domain|host(?!name)|url\b|site\b/i
pseudonym:       /^(id[A-Z]|[a-z]+Id$)|^(nome|name|login|usuario|user)
                   (?!(s?Ativos|s?Total|s?Count|...))|author|empresa|.../i
date:            /data\b|date\b|timestamp|created|updated|dt_|hora\b|^time(?!out|ativo)/i
keep_level:      /^nivel$|^level$|^severity$|^prioridade$|^log.?level$/i
sanitize:        /detalhe|detail|descri|mensagem|message|log\b|erro|error|
                   stack|path|caminho|feedback|comentario|comment|observ|evento|event/i
delete:          /senha|password|pass\b|token|secret\b|private|chave|key(?!word)/i
```

------

## 11. Exemplos de Transformação

### Exemplo 1 — Cabeçalhos

**Entrada:**

```
nome do usuário,e-mail,Endereço IP,Data Criação,Serviços Afetados,CNPJ
```

**Saída:**

```
NomeDoUsuario;Email;EnderecoIp;DataCriacao;ServicosAfetados;Cnpj
```

### Exemplo 2 — Log TXT (arquivo de entrada)

**Entrada (`app.log`):**

```
2024-06-01 09:00:15 INFO  UserLogin - User 'jdoe' successfully logged in from IP 192.168.1.10.
2024-06-01 09:02:30 INFO  PageView - User 'jdoe' visited page '/dashboard'.
2024-06-01 09:03:45 ERROR DBConnect - Connection to db-prod.internal failed.
```

**Colunas detectadas:** `Data · Hora · Nivel · Evento · Mensagem`

**Saída (coluna Mensagem, tipo `sanitize`):**

```
User '[USER_REDACTED]' successfully logged in from IP_GERAL.
User '[USER_REDACTED]' visited page '/dashboard'.
Connection to [SERVER_REDACTED] failed.
```

### Exemplo 3 — Linha de Log com Dados Sensíveis

**Entrada (coluna "Detalhes", tipo `sanitize`):**

```
Erro ao conectar em db-prod.empresa.com.br (192.168.1.45): 
FATAL /var/log/app/error.log linha 342, usuário: joao.silva@empresa.com.br
```

**Saída:**

```
Erro ao conectar em [SERVER_REDACTED] (IP_GERAL): 
FATAL [PATH_REDACTED] linha 342, usuário: EMAIL_GERAL
```

### Exemplo 4 — Linha Completa CSV

**Entrada:**

```
João Silva,joao@empresa.com,192.168.0.1,123.456.789-00,Empresa XYZ Ltda,/home/ubuntu/app/logs,2024-03-15,API REST;Database
```

**Saída (com auto-detecção):**

```
Usuario_1;EMAIL_GERAL;IP_GERAL;CPF_GERAL;Empresa_1;[PATH_REDACTED];2024-03-XX;API REST;Database
```

### Exemplo 5 — Pseudônimos por Tipo de Coluna

| Nome da coluna       | Valor de entrada | Pseudônimo gerado                                            |
| -------------------- | ---------------- | ------------------------------------------------------------ |
| `Usuario`            | `jdoe`           | `Usuario_1`                                                  |
| `Servidor`           | `web-server-01`  | `Servidor_1`                                                 |
| `Empresa`            | `Acme Corp`      | `Empresa_1`                                                  |
| `ClienteNome`        | `Acme Corp`      | `Empresa_1` (mesmo valor = mesmo pseudônimo)                 |
| `ResponsavelTecnico` | `jdoe`           | `Usuario_1` (coluna não detectada como empresa/servidor = usuario) |

### Exemplo 6 — Feedback Preservado

**Entrada (coluna "Feedback"):**

```
O sistema ficou indisponível por 2 horas. Contato: suporte@empresa.com ou IP 10.0.0.1
```

**Saída (sanitização inline preserva contexto):**

```
O sistema ficou indisponível por 2 horas. Contato: EMAIL_GERAL ou IP IP_GERAL
```

------

## 12. Decisões de Design

### Single-File HTML

A escolha de um único arquivo HTML elimina qualquer necessidade de instalação, servidor web ou dependências de build. O custo é um arquivo ligeiramente maior, mas o benefício em usabilidade e portabilidade é significativo para o contexto de uso.

### Client-Side Only

Processar os dados inteiramente no navegador garante privacidade absoluta dos dados — especialmente importante dado o contexto de tratamento de informações sensíveis. Não há risco de vazamento por transmissão de rede.

### Sanitização Inline Universal

Optar por aplicar `sanitizeText` a todos os valores (mesmo no modo `keep`) evita que dados sensíveis "passem despercebidos" em colunas não identificadas. É uma abordagem conservadora de segurança: sanitização é o comportamento padrão, não a exceção. A exceção deliberada é `keep_level`, que preserva valores como `INFO` e `ERROR` sem modificação.

### Pseudônimos por Nome de Coluna (não por Valor)

A classificação entre `Usuario_N`, `Empresa_N` e `Servidor_N` é feita com base no **nome da coluna**, não no conteúdo do valor. Isso é mais estável: um nome de empresa sem sufixo jurídico (ex: `"Acme"`) seria erroneamente classificado como usuário se a detecção dependesse do valor. O nome da coluna (`Empresa`, `ClienteNome`, etc.) fornece contexto semântico confiável.

### Suporte a TXT/LOG com Auto-detecção de Formato

A auto-detecção por votação de maioria (o padrão que corresponde ao maior número de linhas é eleito) permite processar logs heterogêneos sem configuração manual, enquanto linhas que não correspondem ao padrão majoritário são incluídas integralmente na última coluna.

### Processamento em Chunks

Para arquivos com dezenas de milhares de linhas, o processamento síncrono congelaria a interface. O processamento em chunks de 300 linhas com `setTimeout` libera o event loop, mantendo a UI responsiva e permitindo atualizar a barra de progresso.

------

## 13. Limitações Conhecidas

| Limitação                       | Descrição                                                    |
| ------------------------------- | ------------------------------------------------------------ |
| **CPF vs. outros números**      | A regex de CPF pode capturar sequências de 11 dígitos que não são CPFs (ex.: números de série, códigos) |
| **Paths complexos**             | Caminhos com caracteres incomuns ou muito curtos (menos de 3 segmentos) podem não ser detectados |
| **Validação amostral**          | A validação cobre no máximo 15 linhas aleatórias — não é uma verificação exaustiva |
| **IPv4 em textos**              | Sequências como versões (`192.168.1.0/24`) ou datas no formato americano podem ser incorretamente identificadas como IPs |
| **Arquivos muito grandes**      | Arquivos acima de ~50MB podem causar lentidão dependendo do hardware e navegador |
| **Sem persistência**            | Configurações de coluna são perdidas ao recarregar a página  |
| **Usernames sem delimitadores** | A detecção de usernames inline exige aspas (`'x'`, `"x"`) ou dois-pontos (`login: x`); usernames em outros formatos não são detectados automaticamente |
| **Logs de formato misto**       | Arquivos com mais de um formato de log (ex.: metade syslog, metade plain) podem ser parseados com o formato minoritário na coluna errada |

------

## 14. Conformidade LGPD

### Princípios Atendidos

| Princípio LGPD (Art. 6º) | Implementação                                                |
| ------------------------ | ------------------------------------------------------------ |
| **Necessidade**          | Apenas dados estritamente necessários são mantidos; demais são anonimizados ou removidos |
| **Adequação**            | O tratamento é compatível com as finalidades declaradas de análise técnica |
| **Livre acesso**         | O dataset resultante não permite reidentificação dos titulares |
| **Segurança**            | Processamento local, sem transmissão de dados, sem armazenamento persistente |
| **Prevenção**            | Validação amostral para confirmar ausência de dados sensíveis residuais |
| **Não discriminação**    | Os marcadores genéricos impedem correlação com grupos protegidos |

### Categorias de Dados Tratadas

| Categoria                                       | Tratamento                                                |
| ----------------------------------------------- | --------------------------------------------------------- |
| **Dados pessoais** (nome, login, e-mail)        | Substituição por pseudônimo ou marcador genérico          |
| **Dados sensíveis** (CPF, CNPJ)                 | Substituição por `CPF_GERAL` / `CNPJ_GERAL`               |
| **Dados de localização** (IP, domínio)          | Substituição por `IP_GERAL` / `DOMINIO_GERAL`             |
| **Dados de infraestrutura** (paths, servidores) | Substituição por `[PATH_REDACTED]` / `[SERVER_REDACTED]`  |
| **Usernames em texto livre**                    | Substituição por `[USER_REDACTED]` via sanitização inline |

### Aviso Legal

> Esta ferramenta é um **auxílio técnico** para preparação de datasets conforme a LGPD. Não constitui assessoria jurídica. A conformidade legal final deve ser validada pelo DPO (Data Protection Officer) ou equipe jurídica responsável pela organização.