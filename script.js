// ---------- state ----------
let pc = 0, tokens = [], vars = {}, labels = {}, outputs = [], running = false;
let pendingInput = null;
let currentEncoding = 'utf-8';

const $file = document.getElementById('fileInput');
const $run = document.getElementById('runBtn');
const $code = document.getElementById('codeBox');
const $con = document.getElementById('console');
const $exampleSelect = document.getElementById('exampleSelect');

$file.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { $code.value = r.result; };
  r.readAsText(f, 'utf-8');
});

$run.addEventListener('click', () => { if (!running) start(); });

function out(s) { $con.textContent += s; }
function err(line, msg) {
  $con.textContent += (($con.textContent && !$con.textContent.endsWith('\n')) ? '\n' : '') + `Error line ${line}: ${msg}\n`;
  $con.scrollTop = $con.scrollHeight;
  running = false;
}

// ---------- parse ----------
function parse(src) {
  const lines = src.split(/\r?\n/);
  if (!lines.length || !lines[0].startsWith('using '))
    return { err: 'first line must be "using <encoding>"' };
    
  const encoding = lines[0].slice(6).trim().toLowerCase();
  const validEncodings = [
    'utf-8', 'iso-8859-1', 'utf-16le', 'utf-16be', 
    'utf-32le', 'utf-32be', 'gbk', 'windows-1252'
  ];
  if (!validEncodings.includes(encoding)) {
    return { err: `unsupported encoding: ${encoding}` };
  }

  const prog = [];
  for (let i = 1; i < lines.length; i++) {
    let line = lines[i];
    const c = line.indexOf('//');
    if (c >= 0) line = line.slice(0, c);
    line = line.trim();
    if (!line) continue;
    prog.push({ lineNo: i + 1, text: line });
  }
  return { prog, encoding };
}

// ---------- value ----------
function isLiteral(t) { return t.startsWith('$'); }
function parseLiteral(t) {
  const s = t.slice(1);
  if (s === '') return NaN;
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const parts = body.split('.');
  let val = 0;
  for (let i = 0; i < parts[0].length; i++) {
    const d = parseInt(parts[0][i], 16);
    if (isNaN(d)) return NaN;
    val = val * 16 + d;
  }
  if (parts[1]) {
    let f = 0, scale = 1;
    for (let i = 0; i < parts[1].length; i++) {
      const d = parseInt(parts[1][i], 16);
      if (isNaN(d)) return NaN;
      scale /= 16;
      f += d * scale;
    }
    val += f;
  }
  return neg ? -val : val;
}
function getVal(tok) {
  if (isLiteral(tok)) return parseLiteral(tok);
  if (tok in vars) return vars[tok];
  return NaN;
}

// ---------- hex formatting ----------
function toHex(n) {
  if (!isFinite(n)) return '0';
  const neg = n < 0;
  n = Math.abs(n);
  const intPart = Math.floor(n);
  let frac = n - intPart;
  let ip = intPart.toString(16).toUpperCase();
  let fp = '';
  if (frac > 0) {
    let count = 0;
    while (frac > 0 && count < 20) {
      frac *= 16;
      const d = Math.floor(frac);
      fp += d.toString(16).toUpperCase();
      frac -= d;
      count++;
    }
  }
  return (neg ? '-' : '') + ip + (fp ? '.' + fp : '');
}
function toDec(n) {
  if (!isFinite(n)) return '0';
  return String(n);
}

// ---------- interpreter ----------
function start() {
  $con.textContent = '';
  vars = {}; labels = {}; pc = 0; running = true; pendingInput = null;

  const src = $code.value;
  const res = parse(src);
  if (res.err) { err(0, res.err); return; }
  const prog = res.prog;
  currentEncoding = res.encoding;

  for (const ins of prog) {
    const m = ins.text.match(/^label\s+(#[a-zA-Z0-9_]+)$/);
    if (m) labels[m[1]] = prog.indexOf(ins);
  }

  const match = buildMatches(prog);
  if (match.err) { err(match.err.line, match.err.msg); return; }

  runLoop(prog, match);

  function buildMatches(prog) {
    const map = {};
    const stack = [];
    for (let i = 0; i < prog.length; i++) {
      const t = prog[i].text.split(/\s+/)[0];
      if (/^if-(eq|ne|gt|ge|lt|le)$/.test(t)) stack.push({ type: 'if', i });
      else if (/^while-(eq|ne|gt|ge|lt|le)$/.test(t)) stack.push({ type: 'while', i });
      else if (t === 'endif' || t === 'endwhile') {
        const top = stack.pop();
        if (!top) return { err: { line: prog[i].lineNo, msg: 'unmatched ' + t } };
        const want = t === 'endif' ? 'if' : 'while';
        if (top.type !== want) return { err: { line: prog[i].lineNo, msg: 'mismatched ' + t } };
        map[top.i] = i;
      }
    }
    if (stack.length) return { err: { line: prog[stack[stack.length - 1].i].lineNo, msg: 'unclosed block' } };
    return map;
  }

  function cmp(op, a, b) {
    switch (op) {
      case 'eq': return a === b;
      case 'ne': return a !== b;
      case 'gt': return a > b;
      case 'ge': return a >= b;
      case 'lt': return a < b;
      case 'le': return a <= b;
    }
  }

  function truncateForBitwise(n) {
    const t = Math.trunc(n);
    return t < 0 ? -t : t;
  }
  function bitWidth(...ns) {
    let w = 1;
    for (const n of ns) {
      const v = Math.abs(Math.trunc(n));
      if (v === 0) continue;
      w = Math.max(w, Math.floor(Math.log2(v)) + 1);
    }
    return w;
  }
  function maskFor(w) { return w >= 53 ? Number.MAX_SAFE_INTEGER : (2 ** w - 1); }

  function bitwise2(op, a, b) {
    a = truncateForBitwise(a); b = truncateForBitwise(b);
    const w = bitWidth(a, b);
    const m = maskFor(w);
    const A = a & m, B = b & m;
    let r;
    switch (op) {
      case 'and': r = A & B; break;
      case 'or': r = A | B; break;
      case 'xor': r = A ^ B; break;
      case 'nand': r = A & (~B); break;
      case 'nor': r = A | (~B); break;
      case 'nxor': r = A ^ (~B); break;
    }
    return r & m;
  }

  function exec(ins) {
    const parts = ins.text.split(/\s+/);
    const op = parts[0];
    const lineNo = ins.lineNo;

    if (/^if-(eq|ne|gt|ge|lt|le)$/.test(op)) {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (isNaN(a) || isNaN(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
      if (!cmp(op.slice(3), a, b)) { pc = match[pc] + 1; return 'jumped'; }
      pc++; return 'ok';
    }
    if (op === 'endif') { pc++; return 'ok'; }

    if (/^while-(eq|ne|gt|ge|lt|le)$/.test(op)) {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (isNaN(a) || isNaN(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
      if (!cmp(op.slice(6), a, b)) { pc = match[pc] + 1; return 'jumped'; }
      pc++; return 'ok';
    }
    if (op === 'endwhile') {
      let start = -1;
      for (const k in match) if (match[k] === pc) { start = parseInt(k); break; }
      pc = start; return 'jumped';
    }
    if (op === 'break') {
      let depth = 0, i = pc;
      for (; i < prog.length; i++) {
        const t = prog[i].text.split(/\s+/)[0];
        if (/^while-/.test(t)) depth++;
        else if (t === 'endwhile') { if (depth === 0) break; depth--; }
      }
      pc = i + 1; return 'jumped';
    }
    if (op === 'continue') {
      let depth = 0, i = pc;
      for (; i >= 0; i--) {
        const t = prog[i].text.split(/\s+/)[0];
        if (t === 'endwhile') depth++;
        else if (/^while-/.test(t)) { if (depth === 0) break; depth--; }
      }
      pc = i; return 'jumped';
    }

    if (op === 'label') { pc++; return 'ok'; }
    if (op === 'goto') {
      const target = labels[parts[1]];
      if (target === undefined) { err(lineNo, 'undefined label ' + parts[1]); return 'stop'; }
      pc = target; return 'jumped';
    }

    if (op === 'print') {
      let bytes = [];
      for (let i = 1; i < parts.length; i++) {
        const v = getVal(parts[i]);
        if (isNaN(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
        if (v >= 0 && v <= 255 && Number.isInteger(v)) {
          bytes.push(v);
        } else {
          bytes.push(0);
        }
      }
      try {
        const decoder = new TextDecoder(currentEncoding, { fatal: false });
        out(decoder.decode(new Uint8Array(bytes)));
      } catch (e) {
        out(String.fromCharCode(...bytes));
      }
      pc++; return 'ok';
    }
    if (op === 'printnum') {
      let s = '';
      for (let i = 1; i < parts.length; i++) {
        const v = getVal(parts[i]);
        if (isNaN(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
        s += toHex(v);
      }
      out(s); pc++; return 'ok';
    }
    if (op === 'printdecnum') {
      let s = '';
      for (let i = 1; i < parts.length; i++) {
        const v = getVal(parts[i]);
        if (isNaN(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
        s += toDec(v);
      }
      out(s); pc++; return 'ok';
    }
    if (op === 'input') {
      pc++;
      pendingInput = { varName: parts[1], lineNo };
      
      const inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.style.width = '40px';
      inputEl.style.marginLeft = '4px';
      inputEl.style.background = '#000';
      inputEl.style.color = '#ddd';
      inputEl.style.border = 'none';
      inputEl.style.outline = 'none';
      inputEl.style.fontFamily = 'monospace';
      inputEl.style.fontSize = '14px';
      inputEl.style.caretColor = '#ddd';
      
      $con.appendChild(inputEl);
      inputEl.focus();
      
      inputEl.addEventListener('input', (e) => {
        const val = e.target.value;
        if (!val) return;
        
        const bytes = new TextEncoder().encode(val);
        vars[pendingInput.varName] = bytes[0];
        
        pendingInput = null;
        inputEl.remove();
        $con.focus();
        
        runLoop(prog, match);
      });
      
      return 'pause';
    }

    if (op === 'def') {
      const v = getVal(parts[2]);
      if (isNaN(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
      vars[parts[1]] = v; pc++; return 'ok';
    }

    if (['add', 'sub', 'mul', 'div', 'fdiv'].includes(op)) {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (isNaN(a) || isNaN(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
      let r;
      switch (op) {
        case 'add': r = a + b; break;
        case 'sub': r = a - b; break;
        case 'mul': r = a * b; break;
        case 'div':
          if (b === 0) { err(lineNo, 'division by zero'); return 'stop'; }
          r = Math.floor(a / b); break;
        case 'fdiv':
          if (b === 0) { err(lineNo, 'division by zero'); return 'stop'; }
          r = a / b; break;
      }
      vars[parts[1]] = r; pc++; return 'ok';
    }

    if (op === 'abs' || op === 'floor' || op === 'ceil' || op === 'round') {
      const a = getVal(parts[1]);
      if (isNaN(a)) { err(lineNo, 'invalid operand'); return 'stop'; }
      let r;
      switch (op) {
        case 'abs': r = Math.abs(a); break;
        case 'floor': r = Math.floor(a); break;
        case 'ceil': r = Math.ceil(a); break;
        case 'round': r = (a >= 0 ? Math.floor(a + 0.5) : Math.ceil(a - 0.5)); break;
      }
      vars[parts[1]] = r; pc++; return 'ok';
    }

    if (['and', 'or', 'nand', 'nor', 'xor', 'nxor'].includes(op)) {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (isNaN(a) || isNaN(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
      vars[parts[1]] = bitwise2(op, a, b); pc++; return 'ok';
    }
    if (op === 'not') {
      const a = getVal(parts[1]);
      if (isNaN(a)) { err(lineNo, 'invalid operand'); return 'stop'; }
      const t = truncateForBitwise(a);
      const w = bitWidth(t);
      const m = maskFor(w);
      vars[parts[1]] = (~t) & m; pc++; return 'ok';
    }

    err(lineNo, 'unknown operation ' + op);
    return 'stop';
  }

  function runLoop(prog, match) {
    while (running && pc < prog.length) {
      const r = exec(prog[pc]);
      if (r === 'stop') { running = false; return; }
      if (r === 'pause') { return; }
    }
    running = false;
  }
}

// 动态获取 example 目录下的 .hxl 文件并生成下拉选项
async function loadExamples() {
  try {
    let apiUrl = '';
    
    if (location.hostname.includes('github.io')) {
      const user = location.hostname.split('.')[0];
      const repo = location.pathname.split('/')[1];
      apiUrl = `https://api.github.com/repos/${user}/${repo}/contents/example`;
    }

    if (!apiUrl) return;

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('Directory not found');
    
    const files = await res.json();
    
    if (Array.isArray(files)) {
      const hxlFiles = files.filter(f => f.name.endsWith('.hxl') && f.type === 'file');
      
      hxlFiles.forEach(file => {
        const opt = document.createElement('option');
        opt.value = file.download_url; 
        opt.textContent = file.name;
        $exampleSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.log('No examples found.');
  }
}

loadExamples();

// 监听下拉框变化，加载对应的代码到文本框
$exampleSelect.addEventListener('change', async (e) => {
  const url = e.target.value;
  if (!url) return;
  
  try {
    const res = await fetch(url);
    if (res.ok) {
      $code.value = await res.text();
    } else {
      alert('Failed to load example file.');
    }
  } catch (err) {
    alert('Error loading example.');
  }
});
