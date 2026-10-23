// ---------- state ----------
let pc = 0, tokens = [], vars = {}, labels = {}, outputs = [], running = false;
let pendingInput = null; // {resolve, varName}

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
  if (!lines.length || lines[0].trim() !== 'using utf-8')
    return { err: 'first line must be "using utf-8"' };
  const prog = [];
  for (let i = 1; i < lines.length; i++) {
    let line = lines[i];
    const c = line.indexOf('//');
    if (c >= 0) line = line.slice(0, c);
    line = line.trim();
    if (!line) continue;
    prog.push({ lineNo: i + 1, text: line });
  }
  return { prog };
}

// ---------- value ----------
function isLiteral(t) { return t.startsWith('$'); }
function parseLiteral(t) {
  // $ -> 0x, support hex fraction
  const s = t.slice(1);
  if (s === '') return NaN;
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const parts = body.split('.');
  let val = 0;
  // integer part
  for (let i = 0; i < parts[0].length; i++) {
    const d = parseInt(parts[0][i], 16);
    if (isNaN(d)) return NaN;
    val = val * 16 + d;
  }
  // fraction
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

  // collect labels
  for (const ins of prog) {
    const m = ins.text.match(/^label\s+(#[a-zA-Z0-9_]+)$/);
    if (m) labels[m[1]] = prog.indexOf(ins);
  }

  // build structure: find matching endif/endwhile
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
    // remove fraction, take abs for negatives
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

    // control flow
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
      // find matching while start
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

    // label/goto
    if (op === 'label') { pc++; return 'ok'; }
    if (op === 'goto') {
      const target = labels[parts[1]];
      if (target === undefined) { err(lineNo, 'undefined label ' + parts[1]); return 'stop'; }
      pc = target; return 'jumped';
    }

    // io
    if (op === 'print') {
      let s = '';
      for (let i = 1; i < parts.length; i++) {
        const v = getVal(parts[i]);
        if (isNaN(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
        if (v >= 0 && v <= 255 && Number.isInteger(v)) s += String.fromCharCode(v);
        else s += '\0';
      }
      out(s); pc++; return 'ok';
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
  
  // 动态创建输入框适配移动端软键盘
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
  
  // 使用 input 事件代替 keydown，兼容手机端输入法
  inputEl.addEventListener('input', (e) => {
    const val = e.target.value;
    if (!val) return; // 等待有效字符
    
    // 取 UTF-8 首字节
    const bytes = new TextEncoder().encode(val);
    vars[pendingInput.varName] = bytes[0];
    
    // 清理输入状态和 DOM
    pendingInput = null;
    inputEl.remove();
    $con.focus(); // 收回焦点，防止手机键盘阻挡后续输出
    
    // 恢复执行
    runLoop(prog, match);
  });
  
  return 'pause';
}

    // vars
    if (op === 'def') {
      const v = getVal(parts[2]);
      if (isNaN(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
      vars[parts[1]] = v; pc++; return 'ok';
    }

    // arithmetic
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

    // bitwise
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
      if (r === 'pause') { return; } // wait for input
    }
    running = false;
  }
}

// 动态获取 example 目录下的 .hxl 文件并生成下拉选项
async function loadExamples() {
  try {
    let apiUrl = '';
    
    // 仅在 GitHub Pages 环境下通过 API 自动推导路径并遍历
    if (location.hostname.includes('github.io')) {
      const user = location.hostname.split('.')[0];
      const repo = location.pathname.split('/')[1];
      apiUrl = `https://api.github.com/repos/${user}/${repo}/contents/example`;
    }

    // 如果不在 GitHub Pages，或者推导失败，直接静默返回，保留空 select
    if (!apiUrl) return;

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('Directory not found');
    
    const files = await res.json();
    
    // 过滤出文件类型且后缀为 .hxl 的文件
    if (Array.isArray(files)) {
      const hxlFiles = files.filter(f => f.name.endsWith('.hxl') && f.type === 'file');
      
      // 动态生成 option 并插入
      hxlFiles.forEach(file => {
        const opt = document.createElement('option');
        opt.value = file.download_url; 
        opt.textContent = file.name;
        $exampleSelect.appendChild(opt);
      });
    }
  } catch (e) {
    // 目录不存在或请求失败时，容错处理，保持默认状态
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
