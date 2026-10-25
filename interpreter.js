let pc = 0, vars = {}, labels = {}, running = false;
let pendingInput = null;
let useDegrees = false; 
let useGradians = false;
let areaStack = []; 

function exec(ins) {
  const parts = splitArgs(ins.text);
  const op = parts[0], lineNo = ins.lineNo;

  if (/^if-(eq|ne|gt|ge|lt|le)$/.test(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (!cmp(op.slice(3), a, b)) { pc = currentMatch[pc] + 1; return 'jumped'; }
    pc++; return 'ok';
  }
  if (op === 'endif') { pc++; return 'ok'; }
  if (op === 'endif-else') { pc = currentMatch[pc] + 1; return 'jumped'; }
  if (op === 'endelse') { pc++; return 'ok'; }

  if (/^while-(eq|ne|gt|ge|lt|le)$/.test(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (!cmp(op.slice(6), a, b)) { pc = currentMatch[pc] + 1; return 'jumped'; }
    pc++; return 'ok';
  }
  if (op === 'endwhile') {
    let start = -1;
    for (const k in currentMatch) if (currentMatch[k] === pc && parseInt(k) < pc) { start = parseInt(k); break; }
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

  if (op === 'area') { areaStack.push([]); pc++; return 'ok'; }
  if (op === 'endarea') { cleanupArea(); pc++; return 'ok'; }

  if (op === 'loop') {
    if (!globalThis.loopCounters) globalThis.loopCounters = {};
    const loopId = pc;
    if (globalThis.loopCounters[loopId] === undefined) {
      const countVal = getVal(parts[1]);
      if (!countVal || countVal instanceof Uint8Array || Array.isArray(countVal)) { err(lineNo, 'invalid operand'); return 'stop'; }
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
    for (const k in currentMatch) if (currentMatch[k] === pc && parseInt(k) < pc) { start = parseInt(k); break; }
    pc = start; return 'jumped';
  }

  if (op === 'usingrad') { useDegrees = false; useGradians = false; pc++; return 'ok'; }
  if (op === 'usingdeg') { useDegrees = true; useGradians = false; pc++; return 'ok'; }
  if (op === 'usinggrad') { useDegrees = false; useGradians = true; pc++; return 'ok'; }

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
        if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
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
      if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
      s += v.toString();
    }
    out(s); pc++; return 'ok';
  }
  if (op === 'printdecnum') {
    let s = '';
    for (let i = 1; i < parts.length; i++) {
      const v = getVal(parts[i]);
      if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
      s += v.toNumber().toString();
    }
    out(s); pc++; return 'ok';
  }

  if (['input', 'inputstr', 'inputnum', 'inputdecnum', 'hinputstr', 'hinputnum', 'hinputdecnum'].includes(op)) {
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
    
    let promptMsg = "", isDec = false, isStr = false;
    if (op === 'inputstr') { promptMsg = "Enter string:"; isStr = true; }
    else if (op === 'inputnum') { promptMsg = "Enter hex number (e.g. FFF.7A):"; }
    else if (op === 'inputdecnum') { promptMsg = "Enter decimal number (e.g. 123.45):"; isDec = true; }
    else if (op.startsWith('hinput')) {
      if (op === 'hinputstr') isStr = true;
      else if (op === 'hinputdecnum') isDec = true;
      
      let hintTok = parts[2];
      if (hintTok.startsWith('"') && hintTok.endsWith('"')) {
        promptMsg = new TextDecoder(currentEncoding).decode(parseStrLiteral(hintTok));
      } else if (hintTok in vars && vars[hintTok] instanceof Uint8Array) {
        promptMsg = new TextDecoder(currentEncoding).decode(vars[hintTok]);
      } else { err(lineNo, 'invalid hint string'); return 'stop'; }
    }
    
    return new Promise((resolve) => {
      setTimeout(() => {
        showDialog(promptMsg, isStr).then(val => {
          if (val !== null) {
            if (isStr) {
              vars[parts[1]] = encodeText(val, currentEncoding);
            } else if (isDec) {
              let s = val.trim();
              if (!/^-?\d+(\.\d+)?$/.test(s)) { err(lineNo, 'invalid decimal number'); resolve('stop'); return; }
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
                rem *= 16n; let digit = rem / den; hexFrac += digit.toString(16); rem %= den;
                if (rem === 0n) break;
              }
              let hexStr = hexInt + (hexFrac ? '.' + hexFrac : '');
              if (isNeg) hexStr = '-' + hexStr;
              vars[parts[1]] = new BigHex(hexStr);
            } else {
              try { vars[parts[1]] = new BigHex(val.trim()); } 
              catch (e) { err(lineNo, 'invalid hex number'); resolve('stop'); return; }
            }
            if (areaStack.length > 0) areaStack[areaStack.length - 1].push(parts[1]);
          }
          pc++; resolve('ok');
        });
      }, 10); 
    });
  }

  if (op === 'def' || op === 'defstr') {
    if (['TRUE', 'FALSE', 'PI', 'E', 'RANDOM', 'TIME', 'SQRT2', 'SQRT3', 'SQRT5', 'PHI', 'LG2'].includes(parts[1])) { err(lineNo, 'reserved literal cannot be a variable'); return 'stop'; }
    if (op === 'def') {
      const v = getVal(parts[2]);
      if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
      vars[parts[1]] = v; 
    } else {
      let rawStr = ins.text.slice(ins.text.indexOf(parts[1]) + parts[1].length).trim();
      if (rawStr.startsWith('"') && rawStr.endsWith('"')) {
        const strVal = parseStrLiteral(rawStr);
        if (strVal === null) { err(lineNo, 'invalid string literal'); return 'stop'; }
        vars[parts[1]] = strVal;
      } else { err(lineNo, 'invalid string literal'); return 'stop'; }
    }
    if (areaStack.length > 0) areaStack[areaStack.length - 1].push(parts[1]);
    pc++; return 'ok';
  }
  
  if (op === 'defarr' || op === 'defstrarr') {
    const varName = parts[1];
    if (parts.length === 3 && parts[2].startsWith('RANGE{')) {
      if (op === 'defstrarr') { err(lineNo, 'cannot use RANGE with string array'); return 'stop'; }
      const arr = getVal(parts[2]);
      if (!Array.isArray(arr)) { err(lineNo, 'invalid RANGE'); return 'stop'; }
      vars[varName] = arr;
    } else if (parts.length === 2) {
      vars[varName] = [];
    } else if (parts.length === 3 && (parts[2].startsWith('"') || parts[2] in vars)) {
      // 可能是 defstrarr s str&divide{...} 或者直接赋值变量
      const v = getVal(parts[2]);
      if (!Array.isArray(v)) { err(lineNo, 'invalid array expression'); return 'stop'; }
      vars[varName] = v;
    } else {
      let arr = [];
      for (let i = 2; i < parts.length; i++) {
        const v = getVal(parts[i]);
        if (!v || Array.isArray(v)) { err(lineNo, 'invalid array element'); return 'stop'; }
        if (op === 'defarr' && v instanceof Uint8Array) { err(lineNo, 'defarr requires numbers'); return 'stop'; }
        if (op === 'defstrarr' && !(v instanceof Uint8Array)) { err(lineNo, 'defstrarr requires strings'); return 'stop'; }
        arr.push(v);
      }
      vars[varName] = arr;
    }
    if (areaStack.length > 0) areaStack[areaStack.length - 1].push(varName);
    pc++; return 'ok';
  }

  if (op === 'append') {
    const arrName = parts[1];
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    const v = getVal(parts[2]);
    if (!v || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
    
    // 简单的类型一致性检查
    if (vars[arrName].length > 0) {
      const isTargetNum = !(vars[arrName][0] instanceof Uint8Array);
      if (isTargetNum && v instanceof Uint8Array) { err(lineNo, 'type mismatch in array'); return 'stop'; }
      if (!isTargetNum && !(v instanceof Uint8Array)) { err(lineNo, 'type mismatch in array'); return 'stop'; }
    }
    vars[arrName].push(v);
    pc++; return 'ok';
  }

  if (op === 'shuffle') {
    const arrName = parts[1];
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    const arr = vars[arrName];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    pc++; return 'ok';
  }

  if (op === 'allclear') {
    const arrName = parts[1];
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    vars[arrName] = [];
    pc++; return 'ok';
  }

  if (op === 'exchange') {
    const arrName = parts[1];
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    const idxVal = getVal(parts[2]); const placeVal = getVal(parts[3]); const xVal = getVal(parts[4]);
    if (!idxVal || idxVal instanceof Uint8Array || Array.isArray(idxVal)) { err(lineNo, 'invalid index'); return 'stop'; }
    if (!placeVal || placeVal instanceof Uint8Array || Array.isArray(placeVal)) { err(lineNo, 'invalid place'); return 'stop'; }
    if (!xVal || Array.isArray(xVal)) { err(lineNo, 'invalid value'); return 'stop'; }
    
    if (vars[arrName].length > 0) {
      const isTargetNum = !(vars[arrName][0] instanceof Uint8Array);
      if (isTargetNum && xVal instanceof Uint8Array) { err(lineNo, 'type mismatch in array'); return 'stop'; }
      if (!isTargetNum && !(xVal instanceof Uint8Array)) { err(lineNo, 'type mismatch in array'); return 'stop'; }
    }
    
    let nIdx = idxVal.toNumber(); nIdx = nIdx < 0 ? Math.ceil(nIdx) : Math.floor(nIdx);
    let nPlace = placeVal.toNumber(); nPlace = nPlace < 0 ? Math.ceil(nPlace) : Math.floor(nPlace);
    const arr = vars[arrName];
    let targetIdx = nIdx >= 0 ? nIdx : arr.length + nIdx;
    if (targetIdx < 0 || targetIdx >= arr.length) { err(lineNo, 'index out of bounds'); return 'stop'; }
    if (nPlace === 0) arr[targetIdx] = xVal;
    else if (nPlace < 0) arr.splice(targetIdx, 0, xVal);
    else arr.splice(targetIdx + 1, 0, xVal);
    pc++; return 'ok';
  }

  if (op === 'del') { delete vars[parts[1]]; pc++; return 'ok'; }
  if (op === 'deli') {
    const arrName = parts[1];
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    const idxVal = getVal(parts[2]);
    if (!idxVal || idxVal instanceof Uint8Array || Array.isArray(idxVal)) { err(lineNo, 'invalid index'); return 'stop'; }
    let nIdx = idxVal.toNumber(); nIdx = nIdx < 0 ? Math.ceil(nIdx) : Math.floor(nIdx);
    const arr = vars[arrName]; let targetIdx = nIdx >= 0 ? nIdx : arr.length + nIdx;
    if (targetIdx < 0 || targetIdx >= arr.length) { err(lineNo, 'index out of bounds'); return 'stop'; }
    arr.splice(targetIdx, 1); pc++; return 'ok';
  }

  if (op === 'dot') {
    const v = getVal(parts[1]);
    if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
    vars[parts[1]] = v.dot(); pc++; return 'ok';
  }
  
  if (op === 'digitsave') {
    const aName = parts[1]; const v = getVal(aName);
    if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
    const nVal = getVal(parts[2]);
    if (!nVal || nVal instanceof Uint8Array || Array.isArray(nVal)) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (!nVal.isInteger() || nVal.sign < 0) { err(lineNo, 'digits must be a non-negative integer'); return 'stop'; }
    let numDigits = nVal.toNumber(); let str = v.abs().toString(); let partsStr = str.split('.');
    let ip = partsStr[0], fp = partsStr[1] || '';
    let firstNonZero = -1;
    for (let i = 0; i < ip.length; i++) { if (ip[i] !== '0') { firstNonZero = i; break; } }
    if (firstNonZero !== -1) {
      let keepIp = Math.max(0, ip.length - firstNonZero);
      if (numDigits <= keepIp) {
        let newIp = ip.slice(0, firstNonZero + numDigits); newIp += '0'.repeat(ip.length - newIp.length);
        vars[aName] = new BigHex(newIp); vars[aName].sign = v.sign;
      } else {
        let rem = numDigits - keepIp; let newIp = ip; let newFp = fp.slice(0, rem);
        vars[aName] = new BigHex(newIp + (newFp ? '.' + newFp : '')); vars[aName].sign = v.sign;
      }
    } else {
      let firstNonZeroFp = -1;
      for (let i = 0; i < fp.length; i++) { if (fp[i] !== '0') { firstNonZeroFp = i; break; } }
      if (firstNonZeroFp !== -1) {
        let newFp = fp.slice(0, firstNonZeroFp + numDigits); vars[aName] = new BigHex('0.' + newFp); vars[aName].sign = v.sign;
      } else vars[aName] = new BigHex(0);
    }
    pc++; return 'ok';
  }

  if (op === 'swap') {
    const a = parts[1], b = parts[2];
    if (!(a in vars) || !(b in vars)) { err(lineNo, 'undefined variable'); return 'stop'; }
    const isAArr = Array.isArray(vars[a]); const isBArr = Array.isArray(vars[b]);
    if (isAArr !== isBArr) { err(lineNo, 'cannot swap different types'); return 'stop'; }
    const typeA = vars[a] instanceof Uint8Array ? 'str' : 'num'; const typeB = vars[b] instanceof Uint8Array ? 'str' : 'num';
    if (!isAArr && typeA !== typeB) { err(lineNo, 'cannot swap different types'); return 'stop'; }
    const tmp = vars[a]; vars[a] = vars[b]; vars[b] = tmp; pc++; return 'ok';
  }

  if (op.startsWith('sleep-')) {
    const v = getVal(parts[1]);
    if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let num = Math.abs(v.toNumber()); let ms = 0;
    if (op === 'sleep-s') ms = num * 1000;
    else if (op === 'sleep-ms') ms = num;
    else if (op === 'sleep-us') ms = num / 1000;
    else if (op === 'sleep-min') ms = num * 60 * 1000;
    else if (op === 'sleep-hour') ms = num * 60 * 60 * 1000;
    else if (op === 'sleep-day') ms = num * 24 * 60 * 60 * 1000;
    else if (op === 'sleep-week') ms = num * 7 * 24 * 60 * 60 * 1000;
    else { err(lineNo, 'unknown sleep operation'); return 'stop'; }
    const start = Date.now(); while (Date.now() - start < ms) {}
    pc++; return 'ok';
  }

  if (['add', 'sub', 'mul', 'div', 'fdiv'].includes(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
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
  
  if (op === 'percent') {
    const v = getVal(parts[1]);
    if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
    vars[parts[1]] = v.div(new BigHex('64')).floor(); pc++; return 'ok';
  }

  if (['mod', 'fmod'].includes(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (op === 'mod' && !b.isInteger()) { err(lineNo, 'mod requires integer divisor'); return 'stop'; }
    let r;
    try { r = (op === 'mod') ? a.mod(b) : a.fmod(b); } 
    catch (e) { err(lineNo, e.message); return 'stop'; }
    vars[parts[1]] = r; pc++; return 'ok';
  }

  if (op === 'pow' || op === 'ipow') {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let r;
    try { r = (op === 'pow') ? a.pow(b) : a.ipow(b); } 
    catch (e) { err(lineNo, e.message); return 'stop'; }
    vars[parts[1]] = r; pc++; return 'ok';
  }

  if (op === 'log') {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    try {
      let an = a.toNumber(), bn = b.toNumber();
      if (an <= 0 || bn <= 0 || bn === 1) throw new Error('Math domain error');
      vars[parts[1]] = new BigHex((Math.log(an) / Math.log(bn)).toString(16));
    } catch (e) { err(lineNo, e.message); return 'stop'; }
    pc++; return 'ok';
  }

  if (op === 'sn') {
    const b = getVal(parts[2]), c = getVal(parts[3]);
    if (!b || !c || b instanceof Uint8Array || Array.isArray(b) || c instanceof Uint8Array || Array.isArray(c)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let r = b.mul(new BigHex(10).pow(c));
    vars[parts[1]] = r; pc++; return 'ok';
  }

  if (op === 'root') {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || Array.isArray(a) || b instanceof Uint8Array || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let an = a.toNumber(), bn = b.toNumber();
    let rn = an < 0 ? (Math.round(bn) % 2 === 0 ? 0 : -Math.pow(-an, 1/bn)) : Math.pow(an, 1/bn);
    vars[parts[1]] = new BigHex(rn.toString(16)); pc++; return 'ok';
  }

  if (op === 'pol') {
    const b = getVal(parts[2]), c = getVal(parts[3]);
    if (!b || !c || b instanceof Uint8Array || Array.isArray(b) || c instanceof Uint8Array || Array.isArray(c)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let bn = b.toNumber(), cn = c.toNumber();
    let rn = Math.sqrt(bn*bn + cn*cn);
    vars[parts[1]] = new BigHex(rn.toString(16)); pc++; return 'ok';
  }

  if (['lg', 'ln', 'log2', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc', 'versin', 'coversin', 'exsec', 'excsc', 'haversin', 'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch', 'arsinh', 'arcosh', 'artanh', 'arcoth', 'arsech', 'arcsch', 'exp', 'ten', 'sqrt', 'square', 'cube', 'cbrt', 'fact'].includes(op)) {
    const a = getVal(parts[1]);
    if (!a || a instanceof Uint8Array || Array.isArray(a)) { err(lineNo, 'invalid operand'); return 'stop'; }
    try {
      let an = a.toNumber();
      let rn = safeMath(op, an, useDegrees, useGradians);
      if (isNaN(rn) || !isFinite(rn)) throw new Error();
      vars[parts[1]] = new BigHex(rn.toString(16));
    } catch (e) { err(lineNo, e.message || 'Math domain error'); return 'stop'; }
    pc++; return 'ok';
  }

  if (op === 'concatnum') {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let resSign = (a.sign === b.sign) ? 1 : -1;
    let strA = a.abs().toString(), strB = b.abs().toString();
    let partsA = strA.split('.'), partsB = strB.split('.');
    let intA = partsA[0] === '0' ? '' : partsA[0]; let fracA = partsA[1] || '';
    let intB = partsB[0] === '0' ? '' : partsB[0]; let fracB = partsB[1] || '';
    let newInt = intA + intB; if (newInt === '') newInt = '0';
    let newFrac = fracA + fracB;
    let result = new BigHex(newInt + (newFrac ? '.' + newFrac : ''));
    result.sign = resSign; if (result.isZero()) result.sign = 1;
    vars[parts[1]] = result; pc++; return 'ok';
  }

  if (op === 'concat') {
    const aName = parts[1], bTok = parts[2];
    if (!(aName in vars) || !(vars[aName] instanceof Uint8Array)) { err(lineNo, 'first operand must be a string'); return 'stop'; }
    let bArr = null;
    if (bTok.startsWith('"') && bTok.endsWith('"')) bArr = parseStrLiteral(bTok);
    else if (bTok in vars && vars[bTok] instanceof Uint8Array) bArr = vars[bTok];
    else { err(lineNo, 'second operand must be a string'); return 'stop'; }
    const newArr = new Uint8Array(vars[aName].length + bArr.length);
    newArr.set(vars[aName], 0); newArr.set(bArr, vars[aName].length);
    vars[aName] = newArr; pc++; return 'ok';
  }

  if (op === 'sum' || op === 'prod') {
    const aName = parts[1], arrName = parts[2];
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    const arr = vars[arrName];
    if (arr.length > 0 && arr[0] instanceof Uint8Array) { err(lineNo, op + ' requires numeric array'); return 'stop'; }
    
    let res = new BigHex(op === 'sum' ? 0 : 1);
    for (let i = 0; i < arr.length; i++) {
      if (op === 'sum') res = res.add(arr[i]);
      else res = res.mul(arr[i]);
    }
    vars[aName] = res; pc++; return 'ok';
  }

  if (op === 'abs' || op === 'floor' || op === 'ceil' || op === 'round') {
    const a = getVal(parts[1]);
    if (!a || a instanceof Uint8Array || Array.isArray(a)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let r;
    switch (op) {
      case 'abs': r = a.abs(); break; case 'floor': r = a.floor(); break;
      case 'ceil': r = a.ceil(); break; case 'round': r = a.round(); break;
    }
    vars[parts[1]] = r; pc++; return 'ok';
  }

  if (['and', 'or', 'nand', 'nor', 'xor', 'nxor'].includes(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    vars[parts[1]] = bitwise2(op, a, b); pc++; return 'ok';
  }
  if (op === 'not') {
    const a = getVal(parts[1]);
    if (!a || a instanceof Uint8Array || Array.isArray(a)) { err(lineNo, 'invalid operand'); return 'stop'; }
    const t = a.abs().floor().toNumber();
    const w = Math.max(1, Math.floor(Math.log2(t || 1)) + 1);
    vars[parts[1]] = new BigHex((~t) & ((1 << w) - 1)); pc++; return 'ok';
  }

  err(lineNo, 'unknown operation ' + op);
  return 'stop';
}

async function runLoop() {
  while (running && pc < currentProg.length) {
    const r = exec(currentProg[pc]);
    if (r instanceof Promise) {
      const res = await r;
      if (res === 'stop') { running = false; return; }
      continue; 
    }
    
    if (r === 'stop') { running = false; return; }
    if (r === 'pause') { return; }
  }
  running = false;
}
