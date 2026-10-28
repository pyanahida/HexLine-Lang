let pc = 0, vars = {}, labels = {}, running = false;
let pendingInput = null;
let useDegrees = false; 
let useGradians = false;
let areaStack = []; 

// 函数系统
let currentFuncParams = [];
let callStack = [];

// 深拷贝工具 (支持 BigHex, Uint8Array, Array)
function deepCopy(val) {
  if (val instanceof BigHex) return val.clone();
  if (val instanceof Uint8Array) return new Uint8Array(val);
  if (Array.isArray(val)) return val.map(item => deepCopy(item));
  return val;
}
function deepCopyContext(ctx) {
  let newCtx = {};
  for (let k in ctx) newCtx[k] = deepCopy(ctx[k]);
  return newCtx;
}

function exec(ins) {
  const parts = splitArgs(ins.text);
  const op = parts[0], lineNo = ins.lineNo;

  if (/^if-(eq|ne|gt|ge|lt|le)$/.test(op)) {
    const a = getVal(parts[1]), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (!cmp(op.slice(3), a, b)) { pc = currentMatch[pc] + 1; return 'jumped'; }
    pc++; return 'ok';
  }
  if (op === 'if-isTrue' || op === 'if-isFalse') {
    const a = getVal(parts[1]);
    if (!a || a instanceof Uint8Array || Array.isArray(a)) { err(lineNo, 'invalid operand'); return 'stop'; }
    const condition = op === 'if-isTrue' ? !a.isZero() : a.isZero();
    if (!condition) { pc = currentMatch[pc] + 1; return 'jumped'; }
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
  if (op === 'while-isTrue' || op === 'while-isFalse') {
    const a = getVal(parts[1]);
    if (!a || a instanceof Uint8Array || Array.isArray(a)) { err(lineNo, 'invalid operand'); return 'stop'; }
    const condition = op === 'while-isTrue' ? !a.isZero() : a.isZero();
    if (!condition) { pc = currentMatch[pc] + 1; return 'jumped'; }
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

  if (['print', 'println', 'printnum', 'printnumln', 'printdecnum', 'printdecnumln'].includes(op)) {
    let s = '';
    let bytes = [];
    let isStrPrint = op === 'print' || op === 'println';
    let isLn = op.endsWith('ln');
    
    for (let i = 1; i < parts.length; i++) {
      const tok = parts[i];
      const v = getVal(tok);
      if (v === null) { err(lineNo, 'invalid operand'); return 'stop'; }
      
      if (isStrPrint) {
        if (v instanceof Uint8Array) bytes.push(...v);
        else if (Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
        else {
          if (v.isInteger() && v.sign > 0) {
            let num = v.toNumber();
            if (num >= 0 && num <= 255) bytes.push(num); else bytes.push(0);
          } else bytes.push(0);
        }
      } else {
        if (v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
        if (op.startsWith('printnum')) s += v.toString();
        else s += v.toNumber().toString();
      }
    }
    
    if (isStrPrint) {
      if (isLn) bytes.push(10);
      try { out(new TextDecoder(currentEncoding, { fatal: false }).decode(new Uint8Array(bytes))); } 
      catch (e) { out(String.fromCharCode(...bytes)); }
    } else {
      if (isLn) s += '\n';
      out(s);
    }
    pc++; return 'ok';
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
    let varName = parts[1];
    let isGlobal = false;
    if (varName.startsWith('*')) { isGlobal = true; varName = varName.slice(1); }
    
    if (['TRUE', 'FALSE', 'PI', 'E', 'RANDOM', 'TIME', 'SQRT2', 'SQRT3', 'SQRT5', 'PHI', 'LG2', 'LG3', 'LG7', 'GAMMA'].includes(varName)) { err(lineNo, 'reserved literal cannot be a variable'); return 'stop'; }
    let v;
    if (op === 'def') {
      v = getVal(parts[2]);
      if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
    } else {
      let rawStr = ins.text.slice(ins.text.indexOf(parts[1]) + parts[1].length).trim();
      if (rawStr.startsWith('"') && rawStr.endsWith('"')) {
        v = parseStrLiteral(rawStr);
      } else if (rawStr.endsWith('&toString')) {
        v = getVal(rawStr);
      }
      if (!v || !(v instanceof Uint8Array)) { err(lineNo, 'invalid string literal'); return 'stop'; }
    }

    if (isGlobal) {
      if (callStack.length > 0) {
        callStack[0][varName] = deepCopy(v); // 同步到全局
      } else {
        vars[varName] = deepCopy(v);
      }
      if (varName in vars) vars[varName] = deepCopy(v); // 同步到局部
    } else {
      vars[varName] = deepCopy(v);
      if (areaStack.length > 0) areaStack[areaStack.length - 1].push(varName);
    }
    pc++; return 'ok';
  }

  if (op === 'user::' || op.startsWith('user::')) {
    const funcName = op === 'user::' ? '%' + parts[1] : op; 
    const targetPc = functionsMap[funcName] !== undefined ? functionsMap[funcName] : functionsMap['%' + op.slice(6)];
    if (targetPc === undefined) { err(lineNo, 'undefined function ' + funcName); return 'stop'; }
    
    // 提取形参名
    const paramsDef = splitArgs(currentProg[targetPc].text).slice(2);
    if (paramsDef.length !== parts.length - 1) { err(lineNo, 'argument count mismatch'); return 'stop'; }
    
    let params = [];
    for (let i = 1; i < parts.length; i++) {
       const argName = parts[i];
       if (isLiteral(argName)) {
          params.push({ name: argName, isLiteral: true, val: parseLiteral(argName) });
       } else {
          if (!(argName in vars)) { err(lineNo, 'undefined argument ' + argName); return 'stop'; }
          params.push({ name: argName, isLiteral: false, ref: argName });
       }
    }

    // 压栈
    callStack.push(deepCopyContext(vars));
    currentFuncParams.push(params);
    vars = deepCopyContext(vars); // 建立快照沙盒
    
    // 绑定形参 'v1
    for (let i = 0; i < paramsDef.length; i++) {
       const pName = paramsDef[i].slice(1); // 去掉 '
       let paramVal = params[i].isLiteral ? deepCopy(params[i].val) : deepCopy(vars[params[i].ref]);
       vars[pName] = paramVal;
    }
    
    pc = targetPc + 1;
    return 'jumped';
  }

  if (op === 'endfunc') {
    if (callStack.length === 0) { err(lineNo, 'endfunc without func'); return 'stop'; }
    
    // 从快照中恢复非指针变量
    let oldGlobals = callStack.pop();
    currentFuncParams.pop();
    
    // 合并回全局（保留函数内被 * 修改的部分）
    for (let k in vars) {
      if (k in oldGlobals) {
        // 如果变量被 * 修改过，vars[k] 已经是新值，这里直接用 vars 覆盖 oldGlobals 中除指针外的逻辑比较复杂。
        // 我们采用更稳妥的方式：比较 vars 和当前全局的状态。但因为我们是在快照操作，不易检测。
        // 由于我们在 * 操作时已经同步了 vars 和 callStack[0]，这里其实 vars 大部分是快照，可能是旧的。
        // 实际上，endfunc 时，全局状态以 callStack[0] 为准，而局部状态直接抛弃。
      }
    }
    vars = oldGlobals;
    pc++;
    return 'ok';
  }

  // 处理 * 解引用操作
  function handleAssignVar(varName, v) {
    let isGlobal = false;
    if (varName.startsWith('*')) { isGlobal = true; varName = varName.slice(1); }
    
    if (isGlobal) {
      if (callStack.length > 0) {
        callStack[0][varName] = deepCopy(v); // 同步给全局
      } else {
        vars[varName] = deepCopy(v);
      }
      vars[varName] = deepCopy(v); // 同步给局部
    } else {
      vars[varName] = deepCopy(v);
    }
  }

  if (op === 'dot') {
    const v = getVal(parts[1].replace('*',''));
    if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
    handleAssignVar(parts[1], v.dot()); pc++; return 'ok';
  }

  if (['add', 'sub', 'mul', 'div', 'fdiv'].includes(op)) {
    const aTok = parts[1], bTok = parts[2];
    const a = getVal(aTok.startsWith('*') ? aTok.slice(1) : aTok), b = getVal(bTok);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let r;
    try {
      switch (op) {
        case 'add': r = a.add(b); break; case 'sub': r = a.sub(b); break;
        case 'mul': r = a.mul(b); break; case 'div': r = a.div(b).floor(); break;
        case 'fdiv': r = a.div(b); break;
      }
    } catch (e) { err(lineNo, e.message); return 'stop'; }
    handleAssignVar(aTok, r); pc++; return 'ok';
  }

  // 简单封装其余一元操作，支持 * 和 '
  function unaryOp(opName, fn) {
    let vTok = parts[1];
    let val = getVal(vTok.startsWith('*') ? vTok.slice(1) : vTok);
    if (!val || val instanceof Uint8Array || Array.isArray(val)) { err(lineNo, 'invalid operand'); return 'stop'; }
    try {
      let r = fn(val);
      handleAssignVar(vTok, r); pc++; return 'ok';
    } catch(e) { err(lineNo, e.message); return 'stop'; }
  }

  if (op === 'percent') return unaryOp(op, v => v.div(new BigHex('64')).floor());
  if (['mod', 'fmod'].includes(op)) {
    const a = getVal(parts[1].replace('*','')), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (op === 'mod' && !b.isInteger()) { err(lineNo, 'mod requires integer divisor'); return 'stop'; }
    let r;
    try { r = (op === 'mod') ? a.mod(b) : a.fmod(b); } 
    catch (e) { err(lineNo, e.message); return 'stop'; }
    handleAssignVar(parts[1], r); pc++; return 'ok';
  }

  if (op === 'pow' || op === 'ipow') {
    const a = getVal(parts[1].replace('*','')), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let r;
    try { r = (op === 'pow') ? a.pow(b) : a.ipow(b); } 
    catch (e) { err(lineNo, e.message); return 'stop'; }
    handleAssignVar(parts[1], r); pc++; return 'ok';
  }

  if (op === 'log') {
    const a = getVal(parts[1].replace('*','')), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    try {
      let an = a.toNumber(), bn = b.toNumber();
      if (an <= 0 || bn <= 0 || bn === 1) throw new Error('Math domain error');
      handleAssignVar(parts[1], new BigHex((Math.log(an) / Math.log(bn)).toString(16)));
    } catch (e) { err(lineNo, e.message); return 'stop'; }
    pc++; return 'ok';
  }

  if (op === 'sn') {
    const b = getVal(parts[2]), c = getVal(parts[3]);
    if (!b || !c || b instanceof Uint8Array || Array.isArray(b) || c instanceof Uint8Array || Array.isArray(c)) { err(lineNo, 'invalid operand'); return 'stop'; }
    handleAssignVar(parts[1], b.mul(new BigHex(10).pow(c))); pc++; return 'ok';
  }

  if (op === 'root') {
    const a = getVal(parts[1].replace('*','')), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || Array.isArray(a) || b instanceof Uint8Array || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let an = a.toNumber(), bn = b.toNumber();
    let rn = an < 0 ? (Math.round(bn) % 2 === 0 ? 0 : -Math.pow(-an, 1/bn)) : Math.pow(an, 1/bn);
    handleAssignVar(parts[1], new BigHex(rn.toString(16))); pc++; return 'ok';
  }

  if (op === 'pol') {
    const b = getVal(parts[2]), c = getVal(parts[3]);
    if (!b || !c || b instanceof Uint8Array || Array.isArray(b) || c instanceof Uint8Array || Array.isArray(c)) { err(lineNo, 'invalid operand'); return 'stop'; }
    let bn = b.toNumber(), cn = c.toNumber();
    handleAssignVar(parts[1], new BigHex(Math.sqrt(bn*bn + cn*cn).toString(16))); pc++; return 'ok';
  }

  if (['lg', 'ln', 'log2', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc', 'versin', 'coversin', 'exsec', 'excsc', 'haversin', 'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch', 'arsinh', 'arcosh', 'artanh', 'arcoth', 'arsech', 'arcsch', 'exp', 'ten', 'sqrt', 'square', 'cube', 'cbrt', 'fact'].includes(op)) {
    return unaryOp(op, v => {
      let an = v.toNumber();
      let rn = safeMath(op, an, useDegrees, useGradians);
      if (isNaN(rn) || !isFinite(rn)) throw new Error('Math domain error');
      return new BigHex(rn.toString(16));
    });
  }

  if (op === 'concatnum') {
    const a = getVal(parts[1].replace('*','')), b = getVal(parts[2]);
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
    handleAssignVar(parts[1], result); pc++; return 'ok';
  }

  if (op === 'concat') {
    const aName = parts[1], bTok = parts[2];
    let isGlobal = aName.startsWith('*');
    let realName = isGlobal ? aName.slice(1) : aName;
    if (!(realName in vars) || !(vars[realName] instanceof Uint8Array)) { err(lineNo, 'first operand must be a string'); return 'stop'; }
    let bArr = null;
    if (bTok.startsWith('"') && bTok.endsWith('"')) bArr = parseStrLiteral(bTok);
    else if (bTok in vars && vars[bTok] instanceof Uint8Array) bArr = vars[bTok];
    else { err(lineNo, 'second operand must be a string'); return 'stop'; }
    const newArr = new Uint8Array(vars[realName].length + bArr.length);
    newArr.set(vars[realName], 0); newArr.set(bArr, vars[realName].length);
    handleAssignVar(aName, newArr); pc++; return 'ok';
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
    handleAssignVar(aName, res); pc++; return 'ok';
  }

  if (op === 'abs' || op === 'floor' || op === 'ceil' || op === 'round') {
    return unaryOp(op, v => {
      switch (op) {
        case 'abs': return v.abs(); case 'floor': return v.floor();
        case 'ceil': return v.ceil(); case 'round': return v.round();
      }
    });
  }

  if (['and', 'or', 'nand', 'nor', 'xor', 'nxor'].includes(op)) {
    const a = getVal(parts[1].replace('*','')), b = getVal(parts[2]);
    if (!a || !b || a instanceof Uint8Array || b instanceof Uint8Array || Array.isArray(a) || Array.isArray(b)) { err(lineNo, 'invalid operand'); return 'stop'; }
    handleAssignVar(parts[1], bitwise2(op, a, b)); pc++; return 'ok';
  }
  if (op === 'not') {
    return unaryOp(op, v => {
      const t = v.abs().floor().toNumber();
      const w = Math.max(1, Math.floor(Math.log2(t || 1)) + 1);
      return new BigHex((~t) & ((1 << w) - 1));
    });
  }

  // 数组操作（兼容 *）
  if (op === 'append') {
    let arrName = parts[1];
    if (arrName.startsWith('*')) arrName = arrName.slice(1);
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    const v = getVal(parts[2]);
    if (!v || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
    
    if (vars[arrName].length > 0) {
      const isTargetNum = !(vars[arrName][0] instanceof Uint8Array);
      if (isTargetNum && v instanceof Uint8Array) { err(lineNo, 'type mismatch in array'); return 'stop'; }
      if (!isTargetNum && !(v instanceof Uint8Array)) { err(lineNo, 'type mismatch in array'); return 'stop'; }
    }
    let newArr = [...vars[arrName], deepCopy(v)];
    handleAssignVar(parts[1], newArr);
    pc++; return 'ok';
  }

  if (op === 'shuffle') {
    let arrName = parts[1];
    if (arrName.startsWith('*')) arrName = arrName.slice(1);
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    const arr = [...vars[arrName]];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    handleAssignVar(parts[1], arr);
    pc++; return 'ok';
  }

  if (op === 'allclear') {
    handleAssignVar(parts[1], []); pc++; return 'ok';
  }

  if (op === 'exchange') {
    let arrName = parts[1];
    if (arrName.startsWith('*')) arrName = arrName.slice(1);
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    const idxVal = getVal(parts[2]); const placeVal = getVal(parts[3]); const xVal = getVal(parts[4]);
    if (!idxVal || idxVal instanceof Uint8Array || Array.isArray(idxVal)) { err(lineNo, 'invalid index'); return 'stop'; }
    if (!placeVal || placeVal instanceof Uint8Array || Array.isArray(placeVal)) { err(lineNo, 'invalid place'); return 'stop'; }
    if (!xVal || Array.isArray(xVal)) { err(lineNo, 'invalid value'); return 'stop'; }
    
    let nIdx = idxVal.toNumber(); nIdx = nIdx < 0 ? Math.ceil(nIdx) : Math.floor(nIdx);
    let nPlace = placeVal.toNumber(); nPlace = nPlace < 0 ? Math.ceil(nPlace) : Math.floor(nPlace);
    const arr = deepCopy(vars[arrName]);
    let targetIdx = nIdx >= 0 ? nIdx : arr.length + nIdx;
    if (targetIdx < 0 || targetIdx >= arr.length) { err(lineNo, 'index out of bounds'); return 'stop'; }
    
    if (nPlace === 0) arr[targetIdx] = deepCopy(xVal);
    else if (nPlace < 0) arr.splice(targetIdx, 0, deepCopy(xVal));
    else arr.splice(targetIdx + 1, 0, deepCopy(xVal));
    handleAssignVar(parts[1], arr);
    pc++; return 'ok';
  }

  if (op === 'del') { 
    let name = parts[1];
    if (name.startsWith('*')) {
       let realName = name.slice(1);
       if (callStack.length > 0) delete callStack[0][realName];
       delete vars[realName];
    } else {
       delete vars[name];
    }
    pc++; return 'ok'; 
  }

  if (op === 'deli') {
    let arrName = parts[1];
    if (arrName.startsWith('*')) arrName = arrName.slice(1);
    if (!(arrName in vars) || !Array.isArray(vars[arrName])) { err(lineNo, 'invalid array variable'); return 'stop'; }
    const idxVal = getVal(parts[2]);
    if (!idxVal || idxVal instanceof Uint8Array || Array.isArray(idxVal)) { err(lineNo, 'invalid index'); return 'stop'; }
    let nIdx = idxVal.toNumber(); nIdx = nIdx < 0 ? Math.ceil(nIdx) : Math.floor(nIdx);
    const arr = deepCopy(vars[arrName]); let targetIdx = nIdx >= 0 ? nIdx : arr.length + nIdx;
    if (targetIdx < 0 || targetIdx >= arr.length) { err(lineNo, 'index out of bounds'); return 'stop'; }
    arr.splice(targetIdx, 1); 
    handleAssignVar(parts[1], arr); pc++; return 'ok';
  }

  if (op === 'defarr' || op === 'defstrarr') {
    let varName = parts[1];
    let isGlobal = varName.startsWith('*');
    let realName = isGlobal ? varName.slice(1) : varName;
    
    if (parts.length === 3 && parts[2].startsWith('RANGE{')) {
      const arr = getVal(parts[2]);
      if (!Array.isArray(arr)) { err(lineNo, 'invalid RANGE'); return 'stop'; }
      handleAssignVar(varName, arr);
    } else if (parts.length === 2) {
      handleAssignVar(varName, []);
    } else if (parts.length === 3) {
      const v = getVal(parts[2]);
      if (!Array.isArray(v)) { err(lineNo, 'invalid array expression'); return 'stop'; }
      handleAssignVar(varName, v);
    } else {
      let arr = [];
      for (let i = 2; i < parts.length; i++) {
        const v = getVal(parts[i]);
        if (!v || Array.isArray(v)) { err(lineNo, 'invalid array element'); return 'stop'; }
        if (op === 'defarr' && v instanceof Uint8Array) { err(lineNo, 'defarr requires numbers'); return 'stop'; }
        if (op === 'defstrarr' && !(v instanceof Uint8Array)) { err(lineNo, 'defstrarr requires strings'); return 'stop'; }
        arr.push(deepCopy(v));
      }
      handleAssignVar(varName, arr);
    }
    if (!isGlobal && areaStack.length > 0) areaStack[areaStack.length - 1].push(varName);
    pc++; return 'ok';
  }

  if (op === 'swap') {
    let a = parts[1], b = parts[2];
    if (!(a in vars) || !(b in vars)) { err(lineNo, 'undefined variable'); return 'stop'; }
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

  if (op === 'digitsave') {
    const aName = parts[1]; const v = getVal(aName.replace('*',''));
    if (!v || v instanceof Uint8Array || Array.isArray(v)) { err(lineNo, 'invalid operand'); return 'stop'; }
    const nVal = getVal(parts[2]);
    if (!nVal || nVal instanceof Uint8Array || Array.isArray(nVal)) { err(lineNo, 'invalid operand'); return 'stop'; }
    if (!nVal.isInteger() || nVal.sign < 0) { err(lineNo, 'digits must be a non-negative integer'); return 'stop'; }
    let numDigits = nVal.toNumber(); let str = v.abs().toString(); let partsStr = str.split('.');
    let ip = partsStr[0], fp = partsStr[1] || '';
    let firstNonZero = -1;
    for (let i = 0; i < ip.length; i++) { if (ip[i] !== '0') { firstNonZero = i; break; } }
    let finalResult;
    if (firstNonZero !== -1) {
      let keepIp = Math.max(0, ip.length - firstNonZero);
      if (numDigits <= keepIp) {
        let newIp = ip.slice(0, firstNonZero + numDigits); newIp += '0'.repeat(ip.length - newIp.length);
        finalResult = new BigHex(newIp); finalResult.sign = v.sign;
      } else {
        let rem = numDigits - keepIp; let newIp = ip; let newFp = fp.slice(0, rem);
        finalResult = new BigHex(newIp + (newFp ? '.' + newFp : '')); finalResult.sign = v.sign;
      }
    } else {
      let firstNonZeroFp = -1;
      for (let i = 0; i < fp.length; i++) { if (fp[i] !== '0') { firstNonZeroFp = i; break; } }
      if (firstNonZeroFp !== -1) {
        let newFp = fp.slice(0, firstNonZeroFp + numDigits); finalResult = new BigHex('0.' + newFp); finalResult.sign = v.sign;
      } else finalResult = new BigHex(0);
    }
    handleAssignVar(parts[1], finalResult);
    pc++; return 'ok';
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
