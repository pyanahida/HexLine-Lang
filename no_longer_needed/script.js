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

// ==========================================
// Encoding Helpers (Bidirectional)
// ==========================================
const byteCache = {};
function encodeText(str, encoding) {
  if (encoding === 'utf-8') return new TextEncoder().encode(str);
  
  if (!byteCache[encoding]) {
    byteCache[encoding] = {};
    try {
      const decoder = new TextDecoder(encoding);
      for (let i = 0; i < 256; i++) {
        const c = decoder.decode(new Uint8Array([i]));
        if (c && c !== '\uFFFD') byteCache[encoding][c] = i;
      }
    } catch(e) {}
  }
  
  const dict = byteCache[encoding];
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let char = str[i];
    if (dict[char] !== undefined) {
      bytes.push(dict[char]);
    } else {
      const encoded = new TextEncoder().encode(char);
      for (let b of encoded) bytes.push(b);
    }
  }
  return new Uint8Array(bytes);
}

// ==========================================
// BigHex: Arbitrary Precision Hex Float Engine
// ==========================================
class BigHex {
  constructor(val) {
    this.int = []; 
    this.frac = []; 
    this.sign = 1; 
    
    if (val !== undefined) {
      if (val instanceof BigHex) {
        this.int = [...val.int];
        this.frac = [...val.frac];
        this.sign = val.sign;
      } else if (typeof val === 'number') {
        this.fromNumber(val);
      } else if (typeof val === 'string') {
        this.fromString(val);
      }
    }
    if (this.int.length === 0) this.int.push(0);
    this.normalize();
  }

  fromNumber(n) {
    if (isNaN(n)) { this.int = [0]; return; }
    if (n < 0) { this.sign = -1; n = -n; }
    if (n === 0) { this.int = [0]; return; }
    
    let s = n.toString(16);
    let parts = s.split('.');
    this.fromString(parts[0] + (parts[1] ? '.' + parts[1] : ''));
  }

  fromString(s) {
    this.int = []; this.frac = []; this.sign = 1;
    if (s.startsWith('-')) { this.sign = -1; s = s.slice(1); }
    const parts = s.split('.');
    const intStr = parts[0] || '0';
    const fracStr = parts[1] || '';

    for (let i = 0; i < intStr.length; i++) {
      let d = parseInt(intStr[i], 16);
      if (isNaN(d)) throw new Error('Invalid hex');
      this.int.push(d);
    }
    for (let i = 0; i < fracStr.length; i++) {
      let d = parseInt(fracStr[i], 16);
      if (isNaN(d)) throw new Error('Invalid hex');
      this.frac.push(d);
    }
    this.normalize();
  }

  normalize() {
    while (this.int.length > 1 && this.int[0] === 0) this.int.shift();
    while (this.frac.length > 0 && this.frac[this.frac.length - 1] === 0) this.frac.pop();
    if (this.isZero()) this.sign = 1;
  }

  isZero() {
    return this.int.length === 1 && this.int[0] === 0 && this.frac.length === 0;
  }

  toString() {
    let ip = this.int.map(d => d.toString(16).toUpperCase()).join('');
    let fp = this.frac.map(d => d.toString(16).toUpperCase()).join('');
    let res = ip + (fp ? '.' + fp : '');
    return (this.sign === -1 && !this.isZero() ? '-' : '') + res;
  }

  clone() { return new BigHex(this); }

  neg() {
    let r = this.clone();
    if (!r.isZero()) r.sign *= -1;
    return r;
  }

  abs() {
    let r = this.clone();
    r.sign = 1;
    return r;
  }

  align(a, b) {
    const fLen = Math.max(a.frac.length, b.frac.length);
    const ai = [...a.int], af = [...a.frac];
    const bi = [...b.int], bf = [...b.frac];
    while (af.length < fLen) af.push(0);
    while (bf.length < fLen) bf.push(0);
    return { ai, af, bi, bf };
  }

  static addAbs(a, b) {
    let { ai, af, bi, bf } = a.align(b);
    let carry = 0;
    let rf = [];
    for (let i = af.length - 1; i >= 0; i--) {
      let sum = af[i] + bf[i] + carry;
      rf.unshift(sum % 16);
      carry = Math.floor(sum / 16);
    }
    let ri = [];
    let maxI = Math.max(ai.length, bi.length);
    for (let i = 0; i < maxI; i++) {
      let ad = ai[ai.length - 1 - i] || 0;
      let bd = bi[bi.length - 1 - i] || 0;
      let sum = ad + bd + carry;
      ri.unshift(sum % 16);
      carry = Math.floor(sum / 16);
    }
    if (carry > 0) ri.unshift(carry);
    
    let r = new BigHex();
    r.int = ri; r.frac = rf;
    r.normalize();
    return r;
  }

  static cmpAbs(a, b) {
    if (a.int.length !== b.int.length) return a.int.length > b.int.length ? 1 : -1;
    for (let i = 0; i < a.int.length; i++) {
      if (a.int[i] !== b.int[i]) return a.int[i] > b.int[i] ? 1 : -1;
    }
    const fLen = Math.max(a.frac.length, b.frac.length);
    for (let i = 0; i < fLen; i++) {
      let ad = a.frac[i] || 0;
      let bd = b.frac[i] || 0;
      if (ad !== bd) return ad > bd ? 1 : -1;
    }
    return 0;
  }

  static subAbs(a, b) {
    let { ai, af, bi, bf } = a.align(b);
    let rf = [];
    let borrow = 0;
    for (let i = af.length - 1; i >= 0; i--) {
      let diff = af[i] - bf[i] - borrow;
      if (diff < 0) { diff += 16; borrow = 1; } else { borrow = 0; }
      rf.unshift(diff);
    }
    let ri = [];
    let maxI = Math.max(ai.length, bi.length);
    for (let i = 0; i < maxI; i++) {
      let ad = ai[ai.length - 1 - i] || 0;
      let bd = bi[bi.length - 1 - i] || 0;
      let diff = ad - bd - borrow;
      if (diff < 0) { diff += 16; borrow = 1; } else { borrow = 0; }
      ri.unshift(diff);
    }
    
    let r = new BigHex();
    r.int = ri; r.frac = rf;
    r.normalize();
    return r;
  }

  add(o) {
    if (this.sign === o.sign) {
      let r = BigHex.addAbs(this, o);
      r.sign = this.sign;
      return r;
    } else {
      let c = BigHex.cmpAbs(this, o);
      if (c === 0) return new BigHex(0);
      if (c > 0) {
        let r = BigHex.subAbs(this, o);
        r.sign = this.sign;
        return r;
      } else {
        let r = BigHex.subAbs(o, this);
        r.sign = o.sign;
        return r;
      }
    }
  }

  sub(o) {
    return this.add(o.neg());
  }

  mul(o) {
    if (this.isZero() || o.isZero()) return new BigHex(0);
    let A = [...this.int, ...this.frac];
    let B = [...o.int, ...o.frac];
    let fShift = this.frac.length + o.frac.length;
    let R = new Array(A.length + B.length).fill(0);

    for (let i = A.length - 1; i >= 0; i--) {
      for (let j = B.length - 1; j >= 0; j--) {
        let prod = A[i] * B[j] + R[i + j + 1];
        R[i + j + 1] = prod % 16;
        R[i + j] += Math.floor(prod / 16);
      }
    }

    let r = new BigHex();
    for (let i = 0; i < fShift; i++) r.frac.unshift(R.pop());
    r.int = R;
    r.sign = this.sign * o.sign;
    r.normalize();
    return r;
  }

  div(o) {
    if (o.isZero()) throw new Error('division by zero');
    if (this.isZero()) return new BigHex(0);

    let q = new BigHex();
    let r = new BigHex();
    
    let A = this.int;
    let B = o.int;
    r.int = [0];
    
    let isFirst = true;
    for (let i = 0; i < A.length; i++) {
      r = r.mul(new BigHex(16));
      let nextDigit = new BigHex(A[i]);
      r = r.add(nextDigit);
      
      let d = 0;
      let B_abs = new BigHex(); B_abs.int = B; 
      
      while (BigHex.cmpAbs(r, B_abs) >= 0) {
        r = BigHex.subAbs(r, B_abs);
        d++;
      }
      if (!isFirst || d > 0) {
        q.int.push(d);
        isFirst = false;
      }
    }
    if (q.int.length === 0) q.int = [0];

    // 严格截取到 32 个十六进制小数位
    for (let iter = 0; iter < 32; iter++) {
      r = r.mul(new BigHex(16));
      let d = 0;
      let B_abs = new BigHex(); B_abs.int = B; 
      while (BigHex.cmpAbs(r, B_abs) >= 0) {
        r = BigHex.subAbs(r, B_abs);
        d++;
      }
      q.frac.push(d);
      if (r.isZero()) break;
    }
    
    q.sign = this.sign * o.sign;
    q.normalize();
    return q;
  }

  isInteger() { return this.frac.length === 0; }
  
  toNumber() {
    let s = this.toString();
    let parts = s.split('.');
    let ip = parseInt(parts[0], 16) || 0;
    let fp = parts[1] ? parseInt(parts[1], 16) / Math.pow(16, parts[1].length) : 0;
    return (ip + fp) * this.sign;
  }

  floor() {
    if (this.sign > 0) return new BigHex(this.int.map(d => d.toString(16)).join(''));
    if (this.isInteger()) return this.clone();
    let r = new BigHex(this.int.map(d => d.toString(16)).join(''));
    r = r.add(new BigHex(1));
    r.sign = -1;
    return r;
  }

  ceil() {
    if (this.sign > 0) {
      if (this.isInteger()) return this.clone();
      let r = new BigHex(this.int.map(d => d.toString(16)).join(''));
      return r.add(new BigHex(1));
    }
    return new BigHex(this.int.map(d => d.toString(16)).join(''));
  }

  round() {
    if (this.isInteger()) return this.clone();
    let fl = this.floor();
    let ce = this.ceil();
    let diffFl = this.abs().sub(fl.abs());
    let diffCe = ce.abs().sub(this.abs());
    if (diffFl.sub(diffCe).sign >= 0) return ce;
    return fl;
  }
  
  mod(o) {
    if (o.isZero()) throw new Error('division by zero');
    if (this.isZero()) return new BigHex(0);
    let q = this.div(o).floor();
    return this.sub(q.mul(o));
  }
  
  fmod(o) {
    if (o.isZero()) throw new Error('division by zero');
    if (this.isZero()) return new BigHex(0);
    let q = this.div(o);
    q.frac = []; 
    return this.sub(q.mul(o));
  }

  pow(o) {
    let oNum = o.toNumber();
    if (oNum === 0) {
      if (this.isZero()) throw new Error('0^0 undefined');
      return new BigHex(1);
    }
    if (this.isZero()) {
      if (oNum < 0) throw new Error('0^negative undefined');
      return new BigHex(0);
    }
    if (this.sign < 0 && !o.isInteger()) throw new Error('Complex result');
    
    if (o.isInteger()) {
      let exp = o.toNumber();
      let base = this.clone();
      let res = new BigHex(1);
      let isNeg = exp < 0;
      exp = Math.abs(exp);
      for (let i = 0; i < exp; i++) res = res.mul(base);
      if (isNeg) return new BigHex(1).div(res);
      return res;
    }
    
    let bNum = this.toNumber();
    let rNum = Math.pow(bNum, oNum);
    if (isNaN(rNum)) throw new Error('Math error');
    return new BigHex(rNum.toString(16));
  }
  
  ipow(o) {
    let oNum = o.toNumber();
    if (this.sign < 0 && !o.isInteger()) {
      let a = this.toNumber();
      let r = Math.abs(a);
      let theta = Math.PI;
      let lnR = Math.log(r);
      let x = oNum * lnR;
      let y = oNum * theta;
      let mag = Math.exp(x);
      let im = mag * Math.sin(y);
      return new BigHex(im.toString(16));
    }
    return new BigHex(0);
  }
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

// ---------- value parsing ----------
function isLiteral(t) { return t.startsWith('$'); }
function parseLiteral(t) {
  return new BigHex(t.slice(1));
}

function parseStrLiteral(tok) {
  if (!tok.startsWith('"') || !tok.endsWith('"')) return null;
  const inner = tok.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '\\') {
      if (inner[i+1] === '\\') { bytes.push(92); i++; } 
      else if (inner[i+1] === '"') { bytes.push(34); i++; } 
      else if (inner[i+1] === 'x' && inner.length >= i + 4) {
        const hex = inner.slice(i+2, i+4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 3;
        } else {
          bytes.push(92); 
        }
      } else {
        bytes.push(92);
      }
    } else {
      const encoded = new TextEncoder().encode(inner[i]);
      for (let b of encoded) bytes.push(b);
    }
  }
  return new Uint8Array(bytes);
}

function getVal(tok) {
  if (isLiteral(tok)) return parseLiteral(tok);
  
  // 处理字符串提取，例如 s&index{4}
  if (tok.includes('&')) {
    const match = tok.match(/^([a-zA-Z0-9_]+)&index\{(-?\d+)\}$/);
    if (match) {
      const varName = match[1];
      const index = parseInt(match[2], 10);
      if (vars[varName] instanceof Uint8Array) {
        const arr = vars[varName];
        let targetIdx = index >= 0 ? index : arr.length + index;
        if (targetIdx >= 0 && targetIdx < arr.length) {
          return new BigHex(arr[targetIdx]);
        } else {
          return new BigHex(-1);
        }
      }
    }
    return null;
  }

  if (tok in vars) return vars[tok];
  return null;
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
    let c = BigHex.cmpAbs(a, b);
    if (a.sign !== b.sign) c = a.sign > b.sign ? 1 : -1;
    else if (a.sign < 0) c = -c; 
    
    switch (op) {
      case 'eq': return c === 0;
      case 'ne': return c !== 0;
      case 'gt': return c > 0;
      case 'ge': return c >= 0;
      case 'lt': return c < 0;
      case 'le': return c <= 0;
    }
  }

  function bitwise2(op, a, b) {
    a = a.abs().floor(); b = b.abs().floor();
    const an = a.toNumber(); const bn = b.toNumber();
    const w = Math.max(1, Math.floor(Math.log2(an || 1)) + 1, Math.floor(Math.log2(bn || 1)) + 1);
    
    const A = Number(BigInt(an) & BigInt((1n << BigInt(w)) - 1n));
    const B = Number(BigInt(bn) & BigInt((1n << BigInt(w)) - 1n));
    let r;
    switch (op) {
      case 'and': r = A & B; break;
      case 'or': r = A | B; break;
      case 'xor': r = A ^ B; break;
      case 'nand': r = A & (~B); break;
      case 'nor': r = A | (~B); break;
      case 'nxor': r = A ^ (~B); break;
    }
    return new BigHex(r);
  }

  function exec(ins) {
    const parts = ins.text.split(/\s+/);
    const op = parts[0];
    const lineNo = ins.lineNo;

    if (/^if-(eq|ne|gt|ge|lt|le)$/.test(op)) {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
      if (!cmp(op.slice(3), a, b)) { pc = match[pc] + 1; return 'jumped'; }
      pc++; return 'ok';
    }
    if (op === 'endif') { pc++; return 'ok'; }

    if (/^while-(eq|ne|gt|ge|lt|le)$/.test(op)) {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
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
        const tok = parts[i];
        if (tok in vars && vars[tok] instanceof Uint8Array) {
          bytes.push(...vars[tok]);
        } else {
          const v = getVal(tok);
          if (!v || v instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
          
          if (v.isInteger() && v.sign > 0) {
            let num = v.toNumber();
            if (num >= 0 && num <= 255) bytes.push(num);
            else bytes.push(0);
          } else {
            bytes.push(0);
          }
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
        if (!v || v instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
        s += v.toString();
      }
      out(s); pc++; return 'ok';
    }
    if (op === 'printdecnum') {
      let s = '';
      for (let i = 1; i < parts.length; i++) {
        const v = getVal(parts[i]);
        if (!v || v instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
        s += v.toNumber().toString();
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
        
        const bytes = encodeText(val, currentEncoding);
        vars[pendingInput.varName] = new BigHex(bytes[0]);
        
        pendingInput = null;
        inputEl.remove();
        $con.focus();
        
        runLoop(prog, match);
      });
      
      return 'pause';
    }
    
    if (op === 'inputstr') {
      const val = prompt("Enter string:");
      if (val !== null) {
        vars[parts[1]] = encodeText(val, currentEncoding);
      } else {
        vars[parts[1]] = new Uint8Array(0);
      }
      pc++; return 'ok';
    }

    if (op === 'def') {
      const v = getVal(parts[2]);
      if (!v || v instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
      vars[parts[1]] = v; pc++; return 'ok';
    }

    if (op === 'defstr') {
      let rawStr = ins.text.slice(ins.text.indexOf(parts[1]) + parts[1].length).trim();
      if (rawStr.startsWith('"') && rawStr.endsWith('"')) {
        const strVal = parseStrLiteral(rawStr);
        if (strVal === null) { err(lineNo, 'invalid string literal'); return 'stop'; }
        vars[parts[1]] = strVal;
      } else {
         err(lineNo, 'invalid string literal'); return 'stop';
      }
      pc++; return 'ok';
    }

    if (['add', 'sub', 'mul', 'div', 'fdiv'].includes(op)) {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
      let r;
      try {
        switch (op) {
          case 'add': r = a.add(b); break;
          case 'sub': r = a.sub(b); break;
          case 'mul': r = a.mul(b); break;
          case 'div': r = a.div(b).floor(); break;
          case 'fdiv': r = a.div(b); break;
        }
      } catch (e) {
        err(lineNo, e.message); return 'stop';
      }
      vars[parts[1]] = r; pc++; return 'ok';
    }

    if (['mod', 'fmod'].includes(op)) {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
      if (op === 'mod' && !b.isInteger()) { err(lineNo, 'mod requires integer divisor'); return 'stop'; }
      
      let r;
      try {
        r = (op === 'mod') ? a.mod(b) : a.fmod(b);
      } catch (e) {
        err(lineNo, e.message); return 'stop';
      }
      vars[parts[1]] = r; pc++; return 'ok';
    }

    if (op === 'pow' || op === 'ipow') {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
      let r;
      try {
        r = (op === 'pow') ? a.pow(b) : a.ipow(b);
      } catch (e) {
        err(lineNo, e.message); return 'stop';
      }
      vars[parts[1]] = r; pc++; return 'ok';
    }

    if (op === 'abs' || op === 'floor' || op === 'ceil' || op === 'round') {
      const a = getVal(parts[1]);
      if (!a || a instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
      let r;
      switch (op) {
        case 'abs': r = a.abs(); break;
        case 'floor': r = a.floor(); break;
        case 'ceil': r = a.ceil(); break;
        case 'round': r = a.round(); break;
      }
      vars[parts[1]] = r; pc++; return 'ok';
    }

    if (['and', 'or', 'nand', 'nor', 'xor', 'nxor'].includes(op)) {
      const a = getVal(parts[1]), b = getVal(parts[2]);
      if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
      vars[parts[1]] = bitwise2(op, a, b); pc++; return 'ok';
    }
    if (op === 'not') {
      const a = getVal(parts[1]);
      if (!a || a instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
      const t = a.abs().floor().toNumber();
      const w = Math.max(1, Math.floor(Math.log2(t || 1)) + 1);
      const m = (1 << w) - 1;
      vars[parts[1]] = new BigHex((~t) & m); pc++; return 'ok';
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
