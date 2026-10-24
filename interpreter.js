let pc = 0, vars = {}, labels = {}, running = false;
let pendingInput = null;
let useDegrees = false; 
let areaStack = []; 

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
  
  if (op === 'endif-else') {
    pc = currentMatch[pc] + 1; 
    return 'jumped';
  }
  if (op === 'endelse') { pc++; return 'ok'; }

  if (/^while-(eq|ne|gt|ge|lt|le)$/.test(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
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
    for (const k in currentMatch) if (currentMatch[k] === pc && parseInt(k) < pc) { start = parseInt(k); break; }
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

  if (op === 'input' || op === 'inputstr' || op === 'inputnum' || op === 'inputdecnum') {
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
    }
    if (op === 'inputnum') {
      const val = prompt("Enter hex number (e.g. FFF.7A):");
      if (val !== null) {
        try {
          vars[parts[1]] = new BigHex(val.trim());
          if (areaStack.length > 0) areaStack[areaStack.length - 1].push(parts[1]);
        } catch (e) { err(lineNo, 'invalid hex number'); return 'stop'; }
      }
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
    }
    pc++; return 'ok';
  }

  if (op === 'def' || op === 'defstr') {
    if (['TRUE', 'FALSE', 'PI', 'E', 'RANDOM'].includes(parts[1])) { err(lineNo, 'reserved literal cannot be a variable'); return 'stop'; }
    if (op === 'def') {
      const v = getVal(parts[2]);
      if (!v || v instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
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

  if (op === 'del') { delete vars[parts[1]]; pc++; return 'ok'; }
  if (op === 'dot') {
    const v = getVal(parts[1]);
    if (!v || v instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    vars[parts[1]] = v.dot(); pc++; return 'ok';
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
      if (useDegrees && (op === 'sin' || op === 'cos' || op === 'tan')) trigIn = an * Math.PI / 180;

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

      if (useDegrees && (op === 'arcsin' || op === 'arccos' || op === 'arctan')) rn = rn * 180 / Math.PI;
      
      if (isNaN(rn)) throw new Error('Math domain error');
      vars[parts[1]] = new BigHex(rn.toString(16));
    } catch (e) { err(lineNo, 'Math domain error'); return 'stop'; }
    pc++; return 'ok';
  }

  if (op === 'concatnum') {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array) { err(lineNo, 'invalid operand'); return 'stop'; }
    let resSign = (a.sign === b.sign) ? 1 : -1;
    let strA = a.abs().toString(), strB = b.abs().toString();
    let partsA = strA.split('.'), partsB = strB.split('.');
    let intA = partsA[0] === '0' ? '' : partsA[0];
    let fracA = partsA[1] || '';
    let intB = partsB[0] === '0' ? '' : partsB[0];
    let fracB = partsB[1] || '';
    let newInt = intA + intB;
    if (newInt === '') newInt = '0';
    let newFrac = fracA + fracB;
    let result = new BigHex(newInt + (newFrac ? '.' + newFrac : ''));
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
