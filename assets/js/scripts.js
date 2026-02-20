// ═══════════════ STATE ═══════════════
let rawText='', originalHeaders=[], headers=[], rows=[];
let colTypes={};
let userMap={}, companyMap={}, serverMap={};
const userCtr={n:1}, companyCtr={n:1}, serverCtr={n:1};
let dupesRemoved=0, missingCount=0;

const TYPES=[
  {val:'keep',         label:'Manter (sanitizar inline)'},
  {val:'keep_level',   label:'Manter — Nível de Log'},
  {val:'pseudonym',    label:'Pseudônimo (Usuario/Empresa_N)'},
  {val:'sanitize',     label:'Sanitizar texto'},
  {val:'generic_ip',   label:'→ IP_GERAL'},
  {val:'generic_email',label:'→ EMAIL_GERAL'},
  {val:'generic_cpf',  label:'→ CPF_GERAL'},
  {val:'generic_cnpj', label:'→ CNPJ_GERAL'},
  {val:'generic_domain',label:'→ DOMINIO_GERAL'},
  {val:'date',         label:'Anonimizar Data'},
  {val:'delete',       label:'Apagar coluna'},
];

// ═══════════════ UI ═══════════════
function show(id){document.getElementById(id).style.display='block';}
function hide(id){document.getElementById(id).style.display='none';}
function setStatus(id,html,type){const el=document.getElementById(id);el.innerHTML=html;el.className='status '+type;}

// ═══════════════ FILE HANDLING ═══════════════
const dropZone=document.getElementById('dropZone');
const fileInput=document.getElementById('fileInput');
dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('drag-over');});
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.classList.remove('drag-over');handleFile(e.dataTransfer.files[0]);});
fileInput.addEventListener('change',()=>handleFile(fileInput.files[0]));

function clearFile(){
  rawText='';originalHeaders=[];headers=[];rows=[];colTypes={};
  resetMaps(); dupesRemoved=0; missingCount=0;
  fileInput.value='';
  document.getElementById('fileInfo').classList.remove('visible');
  document.getElementById('uploadStatus').className='status';
  ['step2','step3','step4','step5'].forEach(hide);
}

function detectEncoding(bytes){
  // BOM checks
  if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF) return 'UTF-8';
  if(bytes[0]===0xFF&&bytes[1]===0xFE) return 'UTF-16LE';
  if(bytes[0]===0xFE&&bytes[1]===0xFF) return 'UTF-16BE';

  // Try decoding as UTF-8: if it fails or produces replacement chars on
  // sequences that look like Latin-1 high bytes, assume Windows-1252
  try{
    const decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    // Even if valid UTF-8, check if it looks like it has real accented chars
    // (i.e., multi-byte sequences). If no multi-byte but has bytes 0x80-0xFF
    // scattered alone, it's more likely Latin-1.
    return 'UTF-8';
  }catch(e){
    // Not valid UTF-8 — must be a single-byte encoding
    return 'windows-1252';
  }
}

function handleFile(file){
  if(!file)return;
  document.getElementById('fileName').textContent=file.name;
  document.getElementById('fileSize').textContent=fmtSize(file.size);
  document.getElementById('fileInfo').classList.add('visible');

  const encSel=document.getElementById('enc').value;
  const encLabel=document.getElementById('encDetected');

  // Always read as ArrayBuffer first so we can detect encoding from raw bytes
  const binReader=new FileReader();
  binReader.onerror=()=>setStatus('uploadStatus','Erro ao ler o arquivo.','err');
  binReader.onload=e=>{
    const bytes=new Uint8Array(e.target.result);
    let enc=encSel;
    if(enc==='auto'){
      enc=detectEncoding(bytes);
      encLabel.textContent='(detectado: '+enc+')';
    }else{
      encLabel.textContent='';
    }
    try{
      rawText=new TextDecoder(enc,{fatal:false}).decode(bytes);
      if(rawText.charCodeAt(0)===0xFEFF) rawText=rawText.slice(1);
      // Route by file type
      const ext=file.name.split('.').pop().toLowerCase();
      if(ext==='txt'||ext==='log') parseTXT();
      else parseCSV();
    }catch(err){
      setStatus('uploadStatus','Erro ao decodificar (encoding: '+enc+'): '+err.message,'err');
    }
  };
  binReader.readAsArrayBuffer(file);
}

function fmtSize(b){
  if(b<1024)return b+' B';
  if(b<1048576)return (b/1024).toFixed(1)+' KB';
  return (b/1048576).toFixed(2)+' MB';
}

// ═══════════════ PARSE ═══════════════
function getSep(){const v=document.getElementById('sep').value;return v==='\\t'?'\t':v;}

function parseCSV(){
  try{
    const sep=getSep();
    const lines=rawText.split(/\r?\n/).filter(l=>l.trim());
    if(lines.length<2){setStatus('uploadStatus','Arquivo muito curto ou vazio.','err');return;}

    originalHeaders=parseLine(lines[0],sep);
    headers=originalHeaders.map(toPascalCase);

    const colCount=headers.length;
    let allRows=lines.slice(1).map(l=>{
      const r=parseLine(l,sep);
      while(r.length<colCount)r.push('');
      return r.slice(0,colCount);
    });

    // Deduplication
    const seen=new Set(), unique=[];
    for(const r of allRows){
      const k=r.join('\x00');
      if(!seen.has(k)){seen.add(k);unique.push(r);}
    }
    dupesRemoved=allRows.length-unique.length;
    rows=unique;

    // Count missing
    missingCount=0;
    rows.forEach(r=>r.forEach(v=>{if(!v||!v.trim())missingCount++;}));

    headers.forEach(h=>{colTypes[h]='keep';});  // reset all before auto-detect

    // Run auto-detection automatically on every load
    autoDetectSilent();

    setStatus('uploadStatus',
      `✓ ${headers.length} colunas · ${rows.length} linhas · ${dupesRemoved} duplicatas removidas · ${missingCount} células vazias a preencher`,
      'ok');
    buildColumnsUI();
    updatePreview();
    updateStats();
    ['step2','step3','step4','step5'].forEach(show);
  }catch(e){
    setStatus('uploadStatus','Erro ao parsear: '+e.message,'err');
  }
}

// ═══════════════ TXT / LOG PARSER ═══════════════
// Supported formats (auto-detected, in priority order):
//
// 1. Standard syslog-style:
//    2024-04-25 09:00:10 INFO  EventName - Message text
//
// 2. Bracket level:
//    2024-04-25 09:00:10 [INFO] EventName - Message text
//
// 3. Level only (no event):
//    2024-04-25 09:00:10 ERROR Message text here
//
// 4. Plain timestamped:
//    2024-04-25 09:00:10 Message text here
//
// 5. No timestamp (pure message lines):
//    Qualquer texto — uma coluna "Mensagem"

function parseTXT(){
  try{
    const lines=rawText.split(/\r?\n/).filter(l=>l.trim());
    if(!lines.length){setStatus('uploadStatus','Arquivo vazio.','err');return;}

    // Patterns in priority order
    const PATTERNS=[
      // 1 & 2: date time [level] event - message  OR  date time level event - message
      {
        re:/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[?(INFO|WARNING|WARN|ERROR|DEBUG|CRITICAL|FATAL|TRACE)\]?\s+([\w\.\-]+)\s+-\s+(.+)$/i,
        cols:['Data','Hora','Nivel','Evento','Mensagem'],
        extract:m=>[m[1],m[2],m[3].toUpperCase(),m[4],m[5]],
      },
      // 3: date time level message (no event name)
      {
        re:/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[?(INFO|WARNING|WARN|ERROR|DEBUG|CRITICAL|FATAL|TRACE)\]?\s+(.+)$/i,
        cols:['Data','Hora','Nivel','Mensagem'],
        extract:m=>[m[1],m[2],m[3].toUpperCase(),m[4]],
      },
      // 4: date time message
      {
        re:/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(.+)$/,
        cols:['Data','Hora','Mensagem'],
        extract:m=>[m[1],m[2],m[3]],
      },
      // 5: fallback — plain message
      {
        re:/^(.+)$/,
        cols:['Mensagem'],
        extract:m=>[m[1]],
      },
    ];

    // Detect which pattern matches the majority of lines
    let bestPattern=PATTERNS[PATTERNS.length-1];
    let bestCount=0;
    for(const p of PATTERNS.slice(0,-1)){
      const count=lines.filter(l=>p.re.test(l.trim())).length;
      if(count>bestCount){bestCount=count;bestPattern=p;}
    }

    // Parse all lines with best pattern, fallback to plain message
    const fallback=PATTERNS[PATTERNS.length-1];
    const colCount=bestPattern.cols.length;
    const parsedRows=lines.map(l=>{
      const t=l.trim();
      const m=t.match(bestPattern.re);
      if(m) return bestPattern.extract(m);
      // line didn't match — put entire line in last column
      const row=Array(colCount).fill('');
      row[colCount-1]=t;
      return row;
    });

    // Set headers (PascalCase)
    originalHeaders=[...bestPattern.cols];
    headers=originalHeaders.map(toPascalCase);

    // Deduplication
    const seen=new Set(),unique=[];
    for(const r of parsedRows){
      const k=r.join('\x00');
      if(!seen.has(k)){seen.add(k);unique.push(r);}
    }
    dupesRemoved=parsedRows.length-unique.length;
    rows=unique;

    missingCount=0;
    rows.forEach(r=>r.forEach(v=>{if(!v||!v.trim())missingCount++;}));

    headers.forEach(h=>{colTypes[h]='keep';});
    autoDetectSilent();

    const fmt=bestPattern.cols.join(' · ');
    setStatus('uploadStatus',
      `✓ Log TXT — formato detectado: [${fmt}] · ${rows.length} linhas · ${dupesRemoved} duplicatas removidas`,
      'ok');
    buildColumnsUI();
    updatePreview();
    updateStats();
    ['step2','step3','step4','step5'].forEach(show);
  }catch(e){
    setStatus('uploadStatus','Erro ao parsear TXT: '+e.message,'err');
  }
}

function parseLine(line,sep){
  const result=[];let cur='';let inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){inQ=!inQ;}
    else if(c===sep&&!inQ){result.push(cur.trim());cur='';}
    else{cur+=c;}
  }
  result.push(cur.trim());
  return result;
}

// ═══════════════ PASCAL CASE ═══════════════
function toPascalCase(str){
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9\s_]/g,' ')
    .replace(/\s+/g,' ').trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase())
    .join('') || 'Coluna';
}

// ═══════════════ COLUMN UI ═══════════════
function buildColumnsUI(){
  const grid=document.getElementById('columnsGrid');
  grid.innerHTML=headers.map((h,i)=>{
    const orig=originalHeaders[i]||h;
    const changed=orig!==h;
    return `<div class="col-item">
      <div class="col-header">
        <span class="col-name" title="${escHtml(h)}">${escHtml(h)}</span>
        ${changed?`<span class="col-pascal" title="Original: ${escHtml(orig)}">↳ pascal</span>`:''}
      </div>
      <div class="col-type">
        <select id="ct${i}" onchange="onTypeChange(${i},this)">
          ${TYPES.map(t=>`<option value="${t.val}"${colTypes[h]===t.val?' selected':''}>${t.label}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }).join('');
  headers.forEach((_,i)=>applySelectStyle(i,colTypes[headers[i]]));
}

function onTypeChange(i,sel){
  colTypes[headers[i]]=sel.value;
  applySelectStyle(i,sel.value);
  updatePreview();
}

function applySelectStyle(i,val){
  const s=document.getElementById('ct'+i);
  if(s)s.className=val!=='keep'?'active':'';
}

function selectAll(type){
  headers.forEach((_,i)=>{
    colTypes[headers[i]]=type;
    const s=document.getElementById('ct'+i);
    if(s){s.value=type;applySelectStyle(i,type);}
  });
  updatePreview();
}

// ═══════════════ AUTO-DETECT ═══════════════
const DETECT={
  generic_ip:     [/\bip\b|ipaddr|endereco.?ip/i],
  generic_email:  [/email|e.?mail|mail\b|correio/i],
  generic_cpf:    [/\bcpf\b/i],
  generic_cnpj:   [/\bcnpj\b/i],
  generic_domain: [/dominio|domain|host(?!name)|url\b|site\b/i],
  // Pseudônimo: apenas colunas de identidade — id, nome, login, autor, empresa, servidor
  // Exclui: UsuariosAtivos, TotalUsuarios, ContagemUsuarios (são métricas numéricas)
  pseudonym:      [/^(id[A-Z]|[a-z]+Id$)|^(nome|name|login|usuario|user)(?!(s?Ativos|s?Total|s?Count|s?Contagem|s?Online|s?Inativos|s?Conectados))|author|empresa|company|cliente|client|organiz|^servidor/i],
  date:           [/data\b|date\b|timestamp|created|updated|dt_|hora\b|^time(?!out|ativo|ativi)/i],
  // Nível de log (INFO/ERROR/WARNING) — manter original, não sanitizar
  keep_level:     [/^nivel$|^level$|^severity$|^prioridade$|^log.?level$/i],
  // Sanitizar: campos de texto livre com contexto técnico ou narrativo
  sanitize:       [/detalhe|detail|descri|mensagem|message|log\b|erro|error|stack|path|caminho|feedback|comentario|comment|observ|evento|event|tipo.?de|type.?of|failover|roteamento|routing/i],
  delete:         [/senha|password|pass\b|token|secret\b|private|chave|key(?!word)/i],
};

function autoDetectSilent(){
  headers.forEach((h,i)=>{
    let found='keep';
    for(const[type,pats]of Object.entries(DETECT)){
      if(pats.some(p=>p.test(h))){found=type;break;}
    }
    colTypes[h]=found;
    // Update select if UI already exists
    const s=document.getElementById('ct'+i);
    if(s){s.value=found;applySelectStyle(i,found);}
  });
}

function autoDetect(){
  autoDetectSilent();
  // Refresh UI selects (always exists here since user clicked button)
  headers.forEach((_,i)=>{
    const s=document.getElementById('ct'+i);
    if(s){s.value=colTypes[headers[i]];applySelectStyle(i,colTypes[headers[i]]);}
  });
  updatePreview();
  setStatus('uploadStatus','🔍 Auto-detecção concluída. Revise e ajuste conforme necessário.','ok');
}

// ═══════════════ SANITIZE ENGINE ═══════════════
// Applied to ANY text value (inline), regardless of column type
function sanitizeText(v){
  if(!v)return v;
  let s=String(v);

  // Windows paths: C:\...\...
  s=s.replace(/[A-Za-z]:\\(?:[^\s";<>|,\r\n]+)/g,'[PATH_REDACTED]');
  // Unix absolute paths (3+ segments)
  s=s.replace(/(?:\/(?:home|var|etc|usr|opt|srv|tmp|root|data|app|logs?|proc|sys|mnt|media|api|backend|frontend|deploy|dev)[^\s";<>|,\r\n]*)/g,'[PATH_REDACTED]');
  s=s.replace(/(?:\/[a-zA-Z0-9_.~-]+){3,}/g,'[PATH_REDACTED]');

  // IPv6
  s=s.replace(/\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,'IP_GERAL');
  // IPv4
  s=s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'IP_GERAL');
  // Emails
  s=s.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,'EMAIL_GERAL');
  // CPF (with or without formatting)
  s=s.replace(/\b\d{3}[.\-]?\d{3}[.\-]?\d{3}[.\-]?\d{2}\b/g,'CPF_GERAL');
  // CNPJ
  s=s.replace(/\b\d{2}[.\-]?\d{3}[.\-]?\d{3}[\/]?\d{4}[.\-]?\d{2}\b/g,'CNPJ_GERAL');
  // URLs → domain
  s=s.replace(/https?:\/\/(?:www\.)?([A-Za-z0-9\-\.]+\.[A-Za-z]{2,})[^\s";<,]*/g,'DOMINIO_GERAL');
  s=s.replace(/\bwww\.[A-Za-z0-9\-]+\.[A-Za-z]{2,}\b/g,'DOMINIO_GERAL');
  // Internal server names (e.g. srv01, db-prod-01, api.internal)
  s=s.replace(/\b(?:srv|server|db|database|app|api|proxy|lb|cache|node|host|worker|master|slave|replica|prod|staging|dev|web)\d*[-.][\w.\-]+\b/gi,'[SERVER_REDACTED]');

  // Inline usernames in log messages: User 'xxx', user "xxx", username: xxx, login: xxx
  s=s.replace(/\b(user|usuario|username|login)\s*['"]([A-Za-z0-9._\-@]+)['"]/gi,(_,kw)=>kw+" '[USER_REDACTED]'");
  s=s.replace(/\b(username|login)\s*:\s*([A-Za-z0-9._\-@]+)/gi,(_,kw)=>kw+': [USER_REDACTED]');

  return s;
}

// ═══════════════ PSEUDONYM MAPS ═══════════════
function resetMaps(){
  userMap={};companyMap={};serverMap={};
  userCtr.n=1;companyCtr.n=1;serverCtr.n=1;
}

function getPseudonym(val,map,prefix,ctr){
  const key=val.trim().toLowerCase();
  if(!map[key]){map[key]=`${prefix}_${ctr.n}`;ctr.n++;}
  return map[key];
}

// Decide prefix by COLUMN NAME (stable) — not by value content (unreliable when empty/generic)
function pseudoPrefix(colName){
  if(/empresa|company|organiz|client|fornec|parceiro|cnpj/i.test(colName))
    return ['Empresa', companyMap, companyCtr];
  if(/servidor|server/i.test(colName))
    return ['Servidor', serverMap, serverCtr];
  return ['Usuario', userMap, userCtr];
}

// ═══════════════ ANONYMIZE VALUE ═══════════════
function anonValue(raw,type,colName){
  const empty=!raw||String(raw).trim()==='';

  if(type==='delete') return {val:'',cls:''};
  if(empty) return {val:'Não informado',cls:'filled-val'};

  let v=String(raw).trim();

  // Normalize decimal separator: 1.234 → 1,234 for pure numbers
  if(/^\d+\.\d+$/.test(v)) v=v.replace('.',',');

  // Columns that must preserve content (sanitize inline regardless of type)
  const colL=colName.toLowerCase();
  const preserveInline=
    /servico|service|afetado|affected/i.test(colName) ||
    /feedback|comentario|comment|observ|avaliacao/i.test(colName);

  if(preserveInline){
    return {val:sanitizeText(v),cls:'anon-val'};
  }

  switch(type){
    case 'keep':
    case 'keep_level':
      return {val:sanitizeText(v),cls:''};
    case 'pseudonym':{
      const [prefix,map,ctr]=pseudoPrefix(colName);
      return {val:getPseudonym(v,map,prefix,ctr),cls:'anon-val'};
    }
    case 'sanitize':
      return {val:sanitizeText(v),cls:'anon-val'};
    case 'generic_ip':
      return {val:'IP_GERAL',cls:'anon-val'};
    case 'generic_email':
      return {val:'EMAIL_GERAL',cls:'anon-val'};
    case 'generic_cpf':
      return {val:'CPF_GERAL',cls:'anon-val'};
    case 'generic_cnpj':
      return {val:'CNPJ_GERAL',cls:'anon-val'};
    case 'generic_domain':
      return {val:'DOMINIO_GERAL',cls:'anon-val'};
    case 'date':
      return {val:anonDate(v),cls:'anon-val'};
    default:
      return {val:sanitizeText(v),cls:''};
  }
}

function anonDate(v){
  const m=v.match(/(\d{4}[-\/]\d{2})[-\/]\d{2}/);
  if(m)return m[1]+'-XX';
  const m2=v.match(/(\d{2}[-\/]\d{2})[-\/]\d{4}/);
  if(m2)return 'XX-'+v.match(/\d{4}$/)[0];
  return 'XXXX-XX-XX';
}

// ═══════════════ PREVIEW ═══════════════
function updatePreview(){
  const table=document.getElementById('previewTable');
  const pRows=rows.slice(0,10);
  let html='<thead><tr>'+headers.map(h=>`<th>${escHtml(h)}</th>`).join('')+'</tr></thead><tbody>';
  for(const row of pRows){
    html+='<tr>';
    for(let i=0;i<headers.length;i++){
      const {val,cls}=anonValue(row[i]??'',colTypes[headers[i]],headers[i]);
      html+=`<td${cls?` class="${cls}"`:''} title="${escHtml(val)}">${escHtml(val)}</td>`;
    }
    html+='</tr>';
  }
  table.innerHTML=html+'</tbody>';
}

function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateStats(){
  const treated=headers.filter(h=>colTypes[h]!=='keep').length;
  document.getElementById('statsBar').innerHTML=`
    <div class="stat"><div class="val">${rows.length.toLocaleString()}</div><div class="lbl">Linhas</div></div>
    <div class="stat"><div class="val">${headers.length}</div><div class="lbl">Colunas</div></div>
    <div class="stat"><div class="val">${treated}</div><div class="lbl">Tratadas</div></div>
    <div class="stat"><div class="val">${dupesRemoved}</div><div class="lbl">Dupl. Rem.</div></div>
    <div class="stat"><div class="val">${missingCount}</div><div class="lbl">Vazios→Não inf.</div></div>
  `;
}

// ═══════════════ VALIDATION ═══════════════
const SENSITIVE=[
  {label:'IPs (IPv4)',    re:/\b(?:\d{1,3}\.){3}\d{1,3}\b/},
  {label:'E-mails',       re:/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/},
  {label:'CPFs',          re:/\b\d{3}[.\-]?\d{3}[.\-]?\d{3}[.\-]?\d{2}\b/},
  {label:'CNPJs',         re:/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[.\-]?\d{2}\b/},
  {label:'Paths (Unix/Win)',re:/(?:[A-Za-z]:\\|\/(?:home|var|etc|usr|opt|srv|tmp|root|data|app)[\/])/},
  {label:'Servidores internos',re:/\b(?:srv|db|server|node|replica|master|slave)\d*[-.][\w.\-]+\b/i},
];

function runValidation(){
  resetMaps();
  const n=Math.min(15,rows.length);
  const indices=new Set();
  while(indices.size<n)indices.add(Math.floor(Math.random()*rows.length));
  const flat=[...indices].map(i=>
    rows[i].map((v,ci)=>anonValue(v,colTypes[headers[ci]],headers[ci]).val).join(' ')
  ).join('\n');

  const results=SENSITIVE.map(p=>({label:p.label,found:p.re.test(flat)}));
  const allClear=results.every(r=>!r.found);

  document.getElementById('validationList').innerHTML=
    `<strong style="color:var(--text)">Validação em ${n} amostras aleatórias:</strong><br>`+
    results.map(r=>
      `<span class="${r.found?'fail-mark':'ok-mark'}">${r.found?'✗':'✓'}</span> ${r.label}: `+
      (r.found?`<span style="color:var(--accent2)">possível dado sensível detectado!</span>`:'limpo')+'<br>'
    ).join('')+
    (allClear?'<br><span class="ok-mark">✓ Amostra limpa — nenhum dado sensível encontrado.</span>':
              '<br><span class="fail-mark">⚠ Ajuste o tipo das colunas sinalizadas.</span>');

  setStatus('exportStatus',
    allClear?'🔬 Validação amostral: dataset limpo.':'⚠ Dados sensíveis detectados na amostra. Veja a lista acima.',
    allClear?'ok':'warn');
}

// ═══════════════ PROCESS & DOWNLOAD ═══════════════
async function processAndDownload(){
  const btn=document.getElementById('btnProcess');
  btn.disabled=true;btn.textContent='⏳ Processando...';
  const pb=document.getElementById('progressBar'),pf=document.getElementById('progressFill');
  pb.classList.add('visible');pf.style.width='0%';

  try{
    resetMaps();
    const OUT=';';
    const lines=[headers.map(h=>csvCell(h,OUT)).join(OUT)];
    const total=rows.length;let done=0;

    const chunk=async(start)=>new Promise(res=>setTimeout(()=>{
      const end=Math.min(start+300,total);
      for(let ri=start;ri<end;ri++){
        const out=rows[ri].map((v,ci)=>{
          const {val}=anonValue(v,colTypes[headers[ci]],headers[ci]);
          return csvCell(val,OUT);
        });
        lines.push(out.join(OUT));
        done++;
      }
      pf.style.width=Math.round(done/total*100)+'%';
      res();
    },0));

    for(let s=0;s<total;s+=300)await chunk(s);

    // BOM as separate byte sequence to avoid corrupting UTF-8 string encoding
    const bom=new Uint8Array([0xEF,0xBB,0xBF]);
    const csvContent=new TextEncoder().encode(lines.join('\r\n'));
    const blob=new Blob([bom,csvContent],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`lgpd_anonimizado_${Date.now()}.csv`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);

    pf.style.width='100%';
    setTimeout(()=>pb.classList.remove('visible'),1500);

    setStatus('exportStatus',
      `✓ Arquivo gerado · ${rows.length} linhas · ${headers.length} colunas · separador ; · PascalCase · pronto para análise de IA`,
      'ok');
    runValidation();
  }catch(e){
    setStatus('exportStatus','Erro: '+e.message,'err');
  }finally{
    btn.disabled=false;btn.textContent='⬇ Processar & Baixar CSV';
  }
}

function csvCell(val,sep){
  const s=String(val??'');
  return(s.includes(sep)||s.includes('"')||s.includes('\n')||s.includes('\r'))?
    '"'+s.replace(/"/g,'""')+'"':s;
}

function copyPreview(){
  const table=document.getElementById('previewTable');
  const text=Array.from(table.querySelectorAll('tr'))
    .map(tr=>Array.from(tr.querySelectorAll('th,td')).map(c=>c.textContent).join(';'))
    .join('\n');
  navigator.clipboard.writeText(text).then(()=>{
    setStatus('exportStatus','✓ Pré-visualização copiada com separador ;','ok');
  });
}