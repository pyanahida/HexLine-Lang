class BigHex {
  constructor(val) {
    this.int = []; this.frac = []; this.sign = 1;
    if (val !== undefined) {
      if (val instanceof BigHex) {
        this.int = [...val.int]; this.frac = [...val.frac]; this.sign = val.sign;
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

  isZero() { return this.int.length === 1 && this.int[0] === 0 && this.frac.length === 0; }

  toString() {
    let ip = this.int.map(d => d.toString(16).toUpperCase()).join('');
    let fp = this.frac.map(d => d.toString(16).toUpperCase()).join('');
    let res = ip + (fp ? '.' + fp : '');
    return (this.sign === -1 && !this.isZero() ? '-' : '') + res;
  }

  clone() { return new BigHex(this); }
  neg() { let r = this.clone(); if (!r.isZero()) r.sign *= -1; return r; }
  abs() { let r = this.clone(); r.sign = 1; return r; }

  align(a, b) {
    const fLen = Math.max(a.frac.length, b.frac.length);
    const ai = [...a.int], af = [...a.frac], bi = [...b.int], bf = [...b.frac];
    while (af.length < fLen) af.push(0);
    while (bf.length < fLen) bf.push(0);
    return { ai, af, bi, bf };
  }

  static addAbs(a, b) {
    let { ai, af, bi, bf } = a.align(b);
    let carry = 0, rf = [];
    for (let i = af.length - 1; i >= 0; i--) {
      let sum = af[i] + bf[i] + carry;
      rf.unshift(sum % 16); carry = Math.floor(sum / 16);
    }
    let ri = [];
    let maxI = Math.max(ai.length, bi.length);
    for (let i = 0; i < maxI; i++) {
      let ad = ai[ai.length - 1 - i] || 0, bd = bi[bi.length - 1 - i] || 0;
      let sum = ad + bd + carry;
      ri.unshift(sum % 16); carry = Math.floor(sum / 16);
    }
    if (carry > 0) ri.unshift(carry);
    let r = new BigHex(); r.int = ri; r.frac = rf; r.normalize();
    return r;
  }

  static cmpAbs(a, b) {
    if (a.int.length !== b.int.length) return a.int.length > b.int.length ? 1 : -1;
    for (let i = 0; i < a.int.length; i++) {
      if (a.int[i] !== b.int[i]) return a.int[i] > b.int[i] ? 1 : -1;
    }
    const fLen = Math.max(a.frac.length, b.frac.length);
    for (let i = 0; i < fLen; i++) {
      let ad = a.frac[i] || 0, bd = b.frac[i] || 0;
      if (ad !== bd) return ad > bd ? 1 : -1;
    }
    return 0;
  }

  static subAbs(a, b) {
    let { ai, af, bi, bf } = a.align(b);
    let rf = [], borrow = 0;
    for (let i = af.length - 1; i >= 0; i--) {
      let diff = af[i] - bf[i] - borrow;
      if (diff < 0) { diff += 16; borrow = 1; } else { borrow = 0; }
      rf.unshift(diff);
    }
    let ri = [];
    let maxI = Math.max(ai.length, bi.length);
    for (let i = 0; i < maxI; i++) {
      let ad = ai[ai.length - 1 - i] || 0, bd = bi[bi.length - 1 - i] || 0;
      let diff = ad - bd - borrow;
      if (diff < 0) { diff += 16; borrow = 1; } else { borrow = 0; }
      ri.unshift(diff);
    }
    let r = new BigHex(); r.int = ri; r.frac = rf; r.normalize();
    return r;
  }

  add(o) {
    if (this.sign === o.sign) {
      let r = BigHex.addAbs(this, o); r.sign = this.sign; return r;
    } else {
      let c = BigHex.cmpAbs(this, o);
      if (c === 0) return new BigHex(0);
      if (c > 0) {
        let r = BigHex.subAbs(this, o); r.sign = this.sign; return r;
      } else {
        let r = BigHex.subAbs(o, this); r.sign = o.sign; return r;
      }
    }
  }

  sub(o) { return this.add(o.neg()); }

  mul(o) {
    if (this.isZero() || o.isZero()) return new BigHex(0);
    let A = [...this.int, ...this.frac], B = [...o.int, ...o.frac];
    let fShift = this.frac.length + o.frac.length;
    let R = new Array(A.length + B.length).fill(0);
    for (let i = A.length - 1; i >= 0; i--) {
      for (let j = B.length - 1; j >= 0; j--) {
        let prod = A[i] * B[j] + R[i + j + 1];
        R[i + j + 1] = prod % 16; R[i + j] += Math.floor(prod / 16);
      }
    }
    let r = new BigHex();
    for (let i = 0; i < fShift; i++) r.frac.unshift(R.pop());
    r.int = R; r.sign = this.sign * o.sign; r.normalize();
    return r;
  }

  div(o) {
    if (o.isZero()) throw new Error('division by zero');
    if (this.isZero()) return new BigHex(0);
    let q = new BigHex(), r = new BigHex();
    let A = this.int, B = o.int;
    r.int = [0];
    let isFirst = true;
    for (let i = 0; i < A.length; i++) {
      r = r.mul(new BigHex(16));
      r = r.add(new BigHex(A[i]));
      let d = 0;
      let B_abs = new BigHex(); B_abs.int = B; 
      while (BigHex.cmpAbs(r, B_abs) >= 0) {
        r = BigHex.subAbs(r, B_abs); d++;
      }
      if (!isFirst || d > 0) { q.int.push(d); isFirst = false; }
    }
    if (q.int.length === 0) q.int = [0];
    for (let iter = 0; iter < 32; iter++) {
      r = r.mul(new BigHex(16));
      let d = 0;
      let B_abs = new BigHex(); B_abs.int = B; 
      while (BigHex.cmpAbs(r, B_abs) >= 0) {
        r = BigHex.subAbs(r, B_abs); d++;
      }
      q.frac.push(d);
      if (r.isZero()) break;
    }
    q.sign = this.sign * o.sign; q.normalize();
    return q;
  }

  isInteger() { return this.frac.length === 0; }
  
  toNumber() {
    let s = this.toString(), parts = s.split('.');
    let ip = parseInt(parts[0], 16) || 0;
    let fp = parts[1] ? parseInt(parts[1], 16) / Math.pow(16, parts[1].length) : 0;
    return (ip + fp) * this.sign;
  }

  floor() {
    if (this.sign > 0) return new BigHex(this.int.map(d => d.toString(16)).join(''));
    if (this.isInteger()) return this.clone();
    let r = new BigHex(this.int.map(d => d.toString(16)).join(''));
    r = r.add(new BigHex(1)); r.sign = -1;
    return r;
  }

  ceil() {
    if (this.sign > 0) {
      if (this.isInteger()) return this.clone();
      return new BigHex(this.int.map(d => d.toString(16)).join('')).add(new BigHex(1));
    }
    return new BigHex(this.int.map(d => d.toString(16)).join(''));
  }

  round() {
    if (this.isInteger()) return this.clone();
    let fl = this.floor(), ce = this.ceil();
    let diffFl = this.abs().sub(fl.abs()), diffCe = ce.abs().sub(this.abs());
    return diffFl.sub(diffCe).sign >= 0 ? ce : fl;
  }
  
  mod(o) {
    if (o.isZero()) throw new Error('division by zero');
    return this.sub(this.div(o).floor().mul(o));
  }
  
  fmod(o) {
    if (o.isZero()) throw new Error('division by zero');
    let q = this.div(o); q.frac = []; 
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
      let exp = o.toNumber(), res = new BigHex(1), base = this.clone();
      let isNeg = exp < 0; exp = Math.abs(exp);
      for (let i = 0; i < exp; i++) res = res.mul(base);
      return isNeg ? new BigHex(1).div(res) : res;
    }
    let rNum = Math.pow(this.toNumber(), oNum);
    if (isNaN(rNum)) throw new Error('Math error');
    return new BigHex(rNum.toString(16));
  }
  
  ipow(o) {
    let oNum = o.toNumber();
    if (this.sign < 0 && !o.isInteger()) {
      let mag = Math.exp(oNum * Math.log(Math.abs(this.toNumber())));
      return new BigHex((mag * Math.sin(oNum * Math.PI)).toString(16));
    }
    return new BigHex(0);
  }
}
