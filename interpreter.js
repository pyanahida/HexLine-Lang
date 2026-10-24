let pc = 0, vars = {}, labels = {}, running = false;
let pendingInput = null;
let currentEncoding = 'utf-8';
let currentProg = [];
let currentMatch = {};
let useDegrees = false; 
let areaStack = []; 

// mpmath 算出的 64 位十六进制常量
const PI_HEX = "3.243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C8";
const E_HEX = "2.B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFE";

function parse(src) {
  const lines = src.split(/\r?\n/);
  if (!lines.length || !lines[0].startsWith('using '))
    return { err: 'first line must be "using <encoding>"' };
  const encoding = lines[0].slice(6).trim().toLowerCase();
  const validEncodings = ['utf-8', 'iso-8859-1', 'utf-16le', 'utf-16be', 'utf-32le', 'utf-32be', 'gbk', 'windows-1252'];
  if (!validEncodings.includes(encoding)) return { err: `unsupported encoding: ${encoding}` };
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

function isLiteral(t) { 
  if (t === 'TRUE') return true;
  if (t === 'FALSE') return true;
  if (t === 'PI') return true;
  if (t === 'E') return true;
  return t.startsWith('$'); 
}

function parseLiteral(t) { 
  if (t === 'TRUE') return new BigHex(1);
  if (t === 'FALSE') return new BigHex(0);
  if (t === 'PI') return new BigHex(PI_HEX);
  if (t === 'E') return new BigHex(E_HEX);
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
        if (/^[0-9a-fA-F]{2}$/.test(hex)) { bytes.push(parseInt(hex, 16)); i += 3; } 
        else { bytes.push(92); }
      } else { bytes.push(92); }
    } else {
      const encoded = new TextEncoder().encode(inner[i]);
      for (let b of encoded) bytes.push(b);
    }
  }
  return new Uint8Array(bytes);
}

function splitArgs(str) {
  const args = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"' && (i === 0 || str[i-1] !== '\\')) {
      inQuotes = !inQuotes;
      current += c;
    } else if (/\s/.test(c) && !inQuotes) {
      if (current) { args.push(current); current = ''; }
    } else {
      current += c;
    }
  }
  if (current) args.push(current);
  return args;
}

function getVal(tok) {
  if (isLiteral(tok)) return parseLiteral(tok);
  
  if (tok.includes('&index{')) {
    const match = tok.match(/^([a-zA-Z0-9_]+)&index\{(.+)\}$/);
    if (match) {
      const varName = match[1];
      let indexTok = match[2];
      let idxVal = null;
      
      if (indexTok.startsWith('$')) {
        idxVal = new BigHex(indexTok.slice(1));
      } else if (indexTok in vars) {
        if (vars[indexTok] instanceof BigHex) idxVal = vars[indexTok];
      }
      
      if (idxVal && vars[varName] instanceof Uint8Array) {
        let idxNum = idxVal.toNumber();
        let index = idxNum < 0 ? Math.ceil(idxNum) : Math.floor(idxNum);
        
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

function buildMatches(prog) {
  const map = {}, stack = [];
  for (let i = 0; i < prog.length; i++) {
    const t = splitArgs(prog[i].text)[0];
    if (/^if-(eq|ne|gt|ge|lt|le)$/.test(t)) stack.push({ type: 'if', i });
    else if (/^while-(eq|ne|gt|ge|lt|le)$/.test(t)) stack.push({ type: 'while', i });
    else if (t === 'loop') stack.push({ type: 'loop', i });
    else if (t === 'area') stack.push({ type: 'area', i });
    else if (t === 'endif' || t === 'endwhile' || t === 'endloop' || t === 'endarea') {
      const top = stack.pop();
      if (!top) return { err: { line: prog[i].lineNo, msg: 'unmatched ' + t } };
      const want = t === 'endif' ? 'if' : (t === 'endwhile' ? 'while' : (t === 'endloop' ? 'loop' : 'area'));
      if (top.type !== want) return { err: { line: prog[i].lineNo, msg: 'mismatched ' + t } };
      map[top.i] = i;
      map[i] = top.i; 
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
    case 'eq': return c === 0; case 'ne': return c !== 0;
    case 'gt': return c > 0; case 'ge': return c >= 0;
    case 'lt': return c < 0; case 'le': return c <= 0;
  }
}

function bitwise2(op, a, b) {
  a = a.abs().floor(); b = b.abs().floor();
  const an = a.toNumber(), bn = b.toNumber();
  const w = Math.max(1, Math.floor(Math.log2(an || 1)) + 1, Math.floor(Math.log2(bn || 1)) + 1);
  const A = Number(BigInt(an) & BigInt((1n << BigInt(w)) - 1n));
  const B = Number(BigInt(bn) & BigInt((1n << BigInt(w)) - 1n));
  let r;
  switch (op) {
    case 'and': r = A & B; break; case 'or': r = A | B; break;
    case 'xor': r = A ^ B; break; case 'nand': r = A & (~B); break;
    case 'nor': r = A | (~B); break; case 'nxor': r = A ^ (~B); break;
  }
  return new BigHex(r);
}

function cleanupArea() {
  if (areaStack.length > 0) {
    const localVars = areaStack.pop();
    for (let v of localVars) {
      delete vars[v];
    }
  }
}

function exec(ins) {
  const parts = splitArgs(ins.text);
  const op = parts[0], lineNo = ins.lineNo;

  if (/^if-(eq|ne|gt|ge|lt|le)$/.test(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (!cmp(op.slice(3), a, b)) { pc = currentMatch[pc] + 1; return 'jumped'; }
    pc++; return 'ok';
  }
  if (op === 'endif') { pc++; return 'ok'; }

  if (/^while-(eq|ne|gt|ge|lt|le)$/.test(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (!cmp(op.slice(6), a, b)) { pc = currentMatch[pc] + 1; return 'jumped'; }
    pc++; return 'ok';
  }
  if (op === 'endwhile') {
    let start = -1;
    for (const k in currentMatch) if (currentMatch[k] === pc && k < pc) { start = parseInt(k); break; }
    pc = start; return 'jumped';
  }
  if (op === 'break') {
    let depth = 0, i = pc;
    for (; i < currentProg.length; i++) {
      const t = splitArgs(currentProg[i].text)[0];
      if (/^while-/.test(t) || t === 'loop') depth++;
      else if (t === 'endwhile' || t === 'endloop') { if (depth === 0) break; depth--; }
    }
    pc = i + 1; return 'jumped';
  }
  if (op === 'continue') {
    let depth = 0, i = pc;
    for (; i >= 0; i--) {
      const t = splitArgs(currentProg[i].text)[0];
      if (t === 'endwhile' || t === 'endloop') depth++;
      else if (/^while-/.test(t) || t === 'loop') { if (depth === 0) break; depth--; }
    }
    pc = i; return 'jumped';
  }

  if (op === 'label') { pc++; return 'ok'; }
  if (op === 'goto') {
    const target = labels[parts[1]];
    if (target === undefined) { err(lineNo, 'undefined label ' + parts[1]); return 'stop'; }
    pc = target; return 'jumped';
  }

  if (op === 'area') {
    areaStack.push([]); 
    pc++; return 'ok';
  }
  
  if (op === 'endarea') {
    cleanupArea();
    pc++; return 'ok';
  }

  if (op === 'loop') {
    if (!globalThis.loopCounters) globalThis.loopCounters = {};
    const loopId = pc;
    if (globalThis.loopCounters[loopId] === undefined) {
      const countVal = getVal(parts[1]);
      if (!countVal || countVal instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
      let n = countVal.toNumber();
      n = n < 0 ? Math.ceil(n) : Math.floor(n);
      globalThis.loopCounters[loopId] = n > 0 ? n : 0;
    }
    if (globalThis.loopCounters[loopId] <= 0) { pc = currentMatch[pc] + 1; return 'jumped'; }
    globalThis.loopCounters[loopId]--;
    pc++; return 'ok';
  }
  
  if (op === 'endloop') {
    let start = -1;
    for (const k in currentMatch) if (currentMatch[k] === pc && k < pc) { start = parseInt(k); break; }
    pc = start; return 'jumped';
  }

  if (op === 'usingrad') { useDegrees = false; pc++; return 'ok'; }
  if (op === 'usingdeg') { useDegrees = true; pc++; return 'ok'; }

  if (op === 'print') {
    let bytes = [];
    for (let i = 1; i < parts.length; i++) {
      const tok = parts[i];
      if (tok.startsWith('"') && tok.endsWith('"')) {
        const strVal = parseStrLiteral(tok);
        if (strVal) bytes.push(...strVal);
      } else if (tok in vars && vars[tok] instanceof Uint8Array) {
        bytes.push(...vars[tok]);
      } else {
        const v = getVal(tok);
        if (!v || v instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
        if (v.isInteger() && v.sign > 0) {
          let num = v.toNumber();
          if (num >= 0 && num <= 255) bytes.push(num); else bytes.push(0);
        } else bytes.push(0);
      }
    }
    try { out(new TextDecoder(currentEncoding, { fatal: false }).decode(new Uint8Array(bytes))); } 
    catch (e) { out(String.fromCharCode(...bytes)); }
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
      vars[pendingInput.varName] = new BigHex(encodeText(val, currentEncoding)[0]);
      if (areaStack.length > 0) areaStack[areaStack.length - 1].push(pendingInput.varName);
      pendingInput = null;
      inputEl.remove();
      $con.focus();
      runLoop();
    });
    return 'pause';
  }
  
  if (op === 'inputstr') {
    const val = prompt("Enter string:");
    vars[parts[1]] = val !== null ? encodeText(val, currentEncoding) : new Uint8Array(0);
    if (areaStack.length > 0) areaStack[areaStack.length - 1].push(parts[1]);
    pc++; return 'ok';
  }

  if (op === 'inputnum') {
    const val = prompt("Enter hex number (e.g. FFF.7A):");
    if (val !== null) {
      try {
        vars[parts[1]] = new BigHex(val.trim());
        if (areaStack.length > 0) areaStack[areaStack.length - 1].push(parts[1]);
      } catch (e) {
        err(lineNo, 'invalid hex number'); return 'stop';
      }
    }
    pc++; return 'ok';
  }

  if (op === 'inputdecnum') {
    const val = prompt("Enter decimal number (e.g. 123.45):");
    if (val !== null) {
      let s = val.trim();
      if (!/^-?\d+(\.\d+)?$/.test(s)) { err(lineNo, 'invalid decimal number'); return 'stop'; }
      
      let isNeg = s.startsWith('-');
      if (isNeg) s = s.slice(1);
      let partsDec = s.split('.');
      let intPart = BigInt(partsDec[0] || '0');
      let fracPart = partsDec[1] || '';
      
      let hexInt = intPart.toString(16);
      let hexFrac = '';
      let rem = BigInt(fracPart === '' ? '0' : fracPart);
      let den = 10n ** BigInt(fracPart.length);
      
      for (let i = 0; i < 64; i++) {
        rem *= 16n;
        let digit = rem / den;
        hexFrac += digit.toString(16);
        rem %= den;
        if (rem === 0n) break;
      }
      
      let hexStr = hexInt + (hexFrac ? '.' + hexFrac : '');
      if (isNeg) hexStr = '-' + hexStr;
      
      vars[parts[1]] = new BigHex(hexStr);
      if (areaStack.length > 0) areaStack[areaStack.length - 1].push(parts[1]);
    }
    pc++; return 'ok';
  }

  if (op === 'def') {
    if (['TRUE', 'FALSE', 'PI', 'E'].includes(parts[1])) { err(lineNo, 'reserved literal cannot be a variable'); return 'stop'; }
    const v = getVal(parts[2]);
    if (!v || v instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    vars[parts[1]] = v; 
    if (areaStack.length > 0) areaStack[areaStack.length - 1].push(parts[1]);
    pc++; return 'ok';
  }

  if (op === 'defstr') {
    if (['TRUE', 'FALSE', 'PI', 'E'].includes(parts[1])) { err(lineNo, 'reserved literal cannot be a variable'); return 'stop'; }
    let rawStr = ins.text.slice(ins.text.indexOf(parts[1]) + parts[1].length).trim();
    if (rawStr.startsWith('"') && rawStr.endsWith('"')) {
      const strVal = parseStrLiteral(rawStr);
      if (strVal === null) { err(lineNo, 'invalid string literal'); return 'stop'; }
      vars[parts[1]] = strVal;
      if (areaStack.length > 0) areaStack[areaStack.length - 1].push(parts[1]);
    } else { err(lineNo, 'invalid string literal'); return 'stop'; }
    pc++; return 'ok';
  }

  if (op === 'del') {
    delete vars[parts[1]];
    pc++; return 'ok';
  }

  if (op === 'dot') {
    const v = getVal(parts[1]);
    if (!v || v instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    vars[parts[1]] = v.dot();
    pc++; return 'ok';
  }

  if (['add', 'sub', 'mul', 'div', 'fdiv'].includes(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    let r;
    try {
      switch (op) {
        case 'add': r = a.add(b); break; case 'sub': r = a.sub(b); break;
        case 'mul': r = a.mul(b); break; case 'div': r = a.div(b).floor(); break;
        case 'fdiv': r = a.div(b); break;
      }
    } catch (e) { err(lineNo, e.message); return 'stop'; }
    vars[parts[1]] = r; pc++; return 'ok';
  }

  if (['mod', 'fmod'].includes(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (op === 'mod' && !b.isInteger()) { err(lineNo, 'mod requires integer divisor'); return 'stop'; }
    let r;
    try { r = (op === 'mod') ? a.mod(b) : a.fmod(b); } 
    catch (e) { err(lineNo, e.message); return 'stop'; }
    vars[parts[1]] = r; pc++; return 'ok';
  }

  if (op === 'pow' || op === 'ipow') {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    let r;
    try { r = (op === 'pow') ? a.pow(b) : a.ipow(b); } 
    catch (e) { err(lineNo, e.message); return 'stop'; }
    vars[parts[1]] = r; pc++; return 'ok';
  }

  if (op === 'log') {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    try {
      let an = a.toNumber(), bn = b.toNumber();
      if (an <= 0 || bn <= 0 || bn === 1) throw new Error('Math domain error');
      vars[parts[1]] = new BigHex((Math.log(an) / Math.log(bn)).toString(16));
    } catch (e) { err(lineNo, e.message); return 'stop'; }
    pc++; return 'ok';
  }

  if (['lg', 'ln', 'log2', 'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'arsinh', 'arcosh', 'artanh', 'exp', 'ten'].includes(op)) {
    const a = getVal(parts[1]);
    if (!a || a instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    try {
      let an = a.toNumber(), rn = 0;
      
      let trigIn = an;
      if (useDegrees) {
        if (op === 'sin' || op === 'cos' || op === 'tan') trigIn = an * Math.PI / 180;
      }

      if (op === 'lg') { if (an <= 0) throw new Error(); rn = Math.log10(an); }
      else if (op === 'ln') { if (an <= 0) throw new Error(); rn = Math.log(an); }
      else if (op === 'log2') { if (an <= 0) throw new Error(); rn = Math.log2(an); }
      else if (op === 'sin') rn = Math.sin(trigIn);
      else if (op === 'cos') rn = Math.cos(trigIn);
      else if (op === 'tan') rn = Math.tan(trigIn);
      else if (op === 'arcsin') { if (an < -1 || an > 1) throw new Error(); rn = Math.asin(an); }
      else if (op === 'arccos') { if (an < -1 || an > 1) throw new Error(); rn = Math.acos(an); }
      else if (op === 'arctan') rn = Math.atan(an);
      else if (op === 'sinh') rn = Math.sinh(an);
      else if (op === 'cosh') rn = Math.cosh(an);
      else if (op === 'tanh') rn = Math.tanh(an);
      else if (op === 'arsinh') rn = Math.asinh(an);
      else if (op === 'arcosh') { if (an < 1) throw new Error(); rn = Math.acosh(an); }
      else if (op === 'artanh') { if (an <= -1 || an >= 1) throw new Error(); rn = Math.atanh(an); }
      else if (op === 'exp') rn = Math.exp(an);
      else if (op === 'ten') rn = Math.pow(10, an);

      if (useDegrees) {
        if (op === 'arcsin' || op === 'arccos' || op === 'arctan') rn = rn * 180 / Math.PI;
      }
      
      if (isNaN(rn)) throw new Error('Math domain error');
      vars[parts[1]] = new BigHex(rn.toString(16));
    } catch (e) { err(lineNo, 'Math domain error'); return 'stop'; }
    pc++; return 'ok';
  }

  if (op === 'concatnum') {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    
    let resSign = (a.sign === b.sign) ? 1 : -1;
    let strA = a.abs().toString();
    let strB = b.abs().toString();
    
    let partsA = strA.split('.');
    let partsB = strB.split('.');
    
    let intA = partsA[0] === '0' ? '' : partsA[0];
    let fracA = partsA[1] || '';
    let intB = partsB[0] === '0' ? '' : partsB[0];
    let fracB = partsB[1] || '';
    
    let newInt = intA + intB;
    if (newInt === '') newInt = '0';
    
    let newFrac = fracA + fracB;
    
    let finalStr = newInt + (newFrac ? '.' + newFrac : '');
    
    let result = new BigHex(finalStr);
    result.sign = resSign;
    if (result.isZero()) result.sign = 1;
    
    vars[parts[1]] = result;
    pc++; return 'ok';
  }

  if (op === 'abs' || op === 'floor' || op === 'ceil' || op === 'round') {
    const a = getVal(parts[1]);
    if (!a || a instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    let r;
    switch (op) {
      case 'abs': r = a.abs(); break; case 'floor': r = a.floor(); break;
      case 'ceil': r = a.ceil(); break; case 'round': r = a.round(); break;
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
    vars[parts[1]] = new BigHex((~t) & ((1 << w) - 1)); pc++; return 'ok';
  }

  err(lineNo, 'unknown operation ' + op);
  return 'stop';
}

function runLoop() {
  while (running && pc < currentProg.length) {
    const r = exec(currentProg[pc]);
    if (r === 'stop') { running = false; return; }
    if (r === 'pause') { return; }
  }
  running = false;
}
