let currentEncoding = 'utf-8';
let currentProg = [];
let currentMatch = {};

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
  if (t === 'TRUE' || t === 'FALSE' || t === 'PI' || t === 'E' || t === 'RANDOM' || t === 'TIME') return true;
  return t.startsWith('$'); 
}

function parseLiteral(t) { 
  if (t === 'TRUE') return new BigHex(1);
  if (t === 'FALSE') return new BigHex(0);
  if (t === 'PI') return new BigHex(PI_HEX);
  if (t === 'E') return new BigHex(E_HEX);
  if (t === 'TIME') return new BigHex(Math.floor(Date.now() / 1000));
  if (t === 'RANDOM') {
    let str = "0.";
    for (let i = 0; i < 64; i++) str += Math.floor(Math.random() * 16).toString(16).toUpperCase();
    return new BigHex(str);
  }
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
  
  if (tok.startsWith('RANDINT{')) {
    const match = tok.match(/^RANDINT\{(.+)\}\{(.+)\}$/);
    if (match) {
      let vA = null, vB = null;
      let tokA = match[1], tokB = match[2];
      
      if (tokA.startsWith('$')) vA = new BigHex(tokA.slice(1));
      else if (tokA in vars && vars[tokA] instanceof BigHex) vA = vars[tokA];
      
      if (tokB.startsWith('$')) vB = new BigHex(tokB.slice(1));
      else if (tokB in vars && vars[tokB] instanceof BigHex) vB = vars[tokB];
      
      if (vA && vB) {
        let nA = vA.toNumber(), nB = vB.toNumber();
        let iA = nA < 0 ? Math.ceil(nA) : Math.floor(nA);
        let iB = nB < 0 ? Math.ceil(nB) : Math.floor(nB);
        let min = Math.min(iA, iB);
        let max = Math.max(iA, iB);
        let randInt = Math.floor(Math.random() * (max - min + 1)) + min;
        return new BigHex(randInt);
      }
      return null;
    }
  }

  if (tok.includes('&index{')) {
    const match = tok.match(/^([a-zA-Z0-9_]+)&index\{(.+)\}$/);
    if (match) {
      const varName = match[1];
      let indexTok = match[2];
      let idxVal = null;
      if (indexTok.startsWith('$')) idxVal = new BigHex(indexTok.slice(1));
      else if (indexTok in vars) { if (vars[indexTok] instanceof BigHex) idxVal = vars[indexTok]; }
      
      if (idxVal && vars[varName] instanceof Uint8Array) {
        let idxNum = idxVal.toNumber();
        let index = idxNum < 0 ? Math.ceil(idxNum) : Math.floor(idxNum);
        const arr = vars[varName];
        let targetIdx = index >= 0 ? index : arr.length + index;
        return (targetIdx >= 0 && targetIdx < arr.length) ? new BigHex(arr[targetIdx]) : new BigHex(-1);
      }
      else if (idxVal && Array.isArray(vars[varName])) {
        let idxNum = idxVal.toNumber();
        let index = idxNum < 0 ? Math.ceil(idxNum) : Math.floor(idxNum);
        const arr = vars[varName];
        let targetIdx = index >= 0 ? index : arr.length + index;
        if (targetIdx < 0 || targetIdx >= arr.length) throw new Error('index out of bounds');
        return arr[targetIdx];
      }
    }
    return null;
  }
  
  if (tok.endsWith('&len')) {
    const varName = tok.slice(0, -4);
    if (varName in vars && Array.isArray(vars[varName])) {
      return new BigHex(vars[varName].length);
    }
    if (varName in vars && vars[varName] instanceof Uint8Array) {
      return new BigHex(vars[varName].length);
    }
    return null;
  }

  if (tok.includes('&include{')) {
    const match = tok.match(/^([a-zA-Z0-9_]+)&include\{(.+)\}$/);
    if (match) {
      const varName = match[1];
      let valTok = match[2];
      let targetVal = null;
      if (valTok.startsWith('$')) targetVal = new BigHex(valTok.slice(1));
      else if (valTok in vars && vars[valTok] instanceof BigHex) targetVal = vars[valTok];
      
      if (targetVal && Array.isArray(vars[varName])) {
        const arr = vars[varName];
        const found = arr.some(item => item.toString() === targetVal.toString());
        return new BigHex(found ? 1 : 0);
      }
    }
    return null;
  }

  if (tok.includes('&findfirst{')) {
    const match = tok.match(/^([a-zA-Z0-9_]+)&findfirst\{(.+)\}$/);
    if (match) {
      const varName = match[1];
      let valTok = match[2];
      let targetVal = null;
      if (valTok.startsWith('$')) targetVal = new BigHex(valTok.slice(1));
      else if (valTok in vars && vars[valTok] instanceof BigHex) targetVal = vars[valTok];
      
      if (targetVal && Array.isArray(vars[varName])) {
        const arr = vars[varName];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].toString() === targetVal.toString()) return new BigHex(i);
        }
        return new BigHex(-1);
      }
    }
    return null;
  }
  
  if (tok.includes('&find{')) {
    const match = tok.match(/^([a-zA-Z0-9_]+)&find\{(.+)\}$/);
    if (match) {
      const varName = match[1];
      let findTok = match[2];
      if (!(vars[varName] instanceof Uint8Array)) return null;
      const arr = vars[varName];
      
      let targetBytes = null;
      if (findTok.startsWith('"')) {
        targetBytes = parseStrLiteral(findTok);
      } else {
        let v = null;
        if (findTok.startsWith('$')) v = new BigHex(findTok.slice(1));
        else if (findTok in vars && vars[findTok] instanceof BigHex) v = vars[findTok];
        
        if (v) {
          let num = v.toNumber();
          num = num < 0 ? Math.ceil(num) : Math.floor(num);
          targetBytes = new Uint8Array([num & 255]);
        }
      }
      
      if (targetBytes) {
        if (targetBytes.length === 0) return new BigHex(-1);
        for (let i = 0; i <= arr.length - targetBytes.length; i++) {
          let matchFound = true;
          for (let j = 0; j < targetBytes.length; j++) {
            if (arr[i + j] !== targetBytes[j]) { matchFound = false; break; }
          }
          if (matchFound) return new BigHex(i);
        }
        return new BigHex(-1);
      }
    }
    return null;
  }

  if (tok.includes('&join{')) {
    const match = tok.match(/^([a-zA-Z0-9_]+)&join\{(.+)\}$/);
    if (match) {
      const arrName = match[1];
      let sepTok = match[2];
      let sepBytes = null;
      if (sepTok.startsWith('"') && sepTok.endsWith('"')) {
        sepBytes = parseStrLiteral(sepTok);
      } else if (sepTok in vars && vars[sepTok] instanceof Uint8Array) {
        sepBytes = vars[sepTok];
      }
      
      if (sepBytes && Array.isArray(vars[arrName])) {
        let strs = vars[arrName].map(item => item.toString());
        let joined = strs.join(new TextDecoder(currentEncoding).decode(sepBytes));
        return encodeText(joined, currentEncoding);
      }
      return null;
    }
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
    else if (t === 'endif' || t === 'endif-else') {
      const top = stack.pop();
      if (!top || top.type !== 'if') return { err: { line: prog[i].lineNo, msg: 'mismatched ' + t } };
      map[top.i] = i;
      map[i] = top.i;
      if (t === 'endif-else') stack.push({ type: 'else', i });
    }
    else if (t === 'endelse') {
      const top = stack.pop();
      if (!top || top.type !== 'else') return { err: { line: prog[i].lineNo, msg: 'mismatched ' + t } };
      map[top.i] = i;
      map[i] = top.i;
    }
    else if (t === 'endwhile' || t === 'endloop' || t === 'endarea') {
      const top = stack.pop();
      if (!top) return { err: { line: prog[i].lineNo, msg: 'unmatched ' + t } };
      const want = t === 'endwhile' ? 'while' : (t === 'endloop' ? 'loop' : 'area');
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
    for (let v of localVars) delete vars[v];
  }
}
