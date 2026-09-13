// Minimal RTDB rules evaluator for the constrained expression vocabulary that
// scripts/gen-rtdb-rules.mjs emits. Lets tests/rules-validate.test.mjs
// shadow-test the REAL database.rules.json against real app-shaped payloads
// and adversarial cases without Java/CLI/Console.
//
// SCOPE (only what our generator emits — deliberately not a general parser):
//   newData.val() === null   .isString()/.isNumber()/.isBoolean()
//   .val().matches(/re/)     .val().length (<= >= == < >)
//   .val() (op number|string|null)
//   newData.hasChildren()    .hasChildren(['a','b'])
//   newData.child('k')       $bound vars (chainable: $date.matches(...))
//   && || ( ) !
// Semantics honored: missing child === null child; unanchored matches() like
// RTDB (our generator already anchors); numeric-string coercion on compare.

export function validate(rulesRoot, path, newData, vars = {}) {
  const parts = path.split('/').filter(Boolean);
  let node = rulesRoot;
  const bound = Object.assign({}, vars);
  for (const seg of parts) {
    if (!node || typeof node !== 'object') return { ok: false, reason: 'no rule node at ' + seg };
    let matched = null;
    for (const key of Object.keys(node)) {
      if (key.startsWith('.')) continue;
      if (key === seg) { matched = { key, isWildcard: false }; break; }
      if (key.startsWith('$')) { matched = { key, isWildcard: true }; break; }
    }
    if (!matched) return { ok: false, reason: 'no rule for segment ' + seg };
    if (matched.isWildcard) bound[matched.key.slice(1)] = seg;
    node = node[matched.key];
  }
  return checkNode(node, toRtdb(newData), bound, path);
}

// Mirror Firebase's JSON serialization: arrays become numeric-key maps and
// EMPTY arrays become null (they have no children). The test payloads are
// plain JS, so this conversion keeps the evaluator honest to the real realm.
function toRtdb(v) {
  if (Array.isArray(v)) return v.length ? Object.fromEntries(v.map((x, i) => [String(i), toRtdb(x)])) : null;
  if (v !== null && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = toRtdb(v[k]);
    return o;
  }
  return v;
}

// Recursive check, mirroring RTDB: .validate at the node, then every PRESENT
// child of an object payload must match a child rule (literal, wildcard, or
// $other) and pass it. Children absent from the payload are not checked.
function checkNode(ruleNode, data, bound, pathStr) {
  const expr = ruleNode && ruleNode['.validate'];
  // No .validate here is legal (e.g. a node holding only wildcard children):
  // RTDB descends into per-child rules. Proceed without a node-level gate.
  if (expr !== undefined) {
    const ctx = { newData: data, vars: bound };
    let ok;
    try { ok = !!evalExpr(expr, ctx); } catch (e) { return { ok: false, reason: 'expr error at ' + pathStr + ': ' + e.message }; }
    if (!ok) return { ok: false, reason: 'validate failed at ' + pathStr };
  }
  if (data !== null && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      let childRule = null;
      let childBound = bound;
      if (Object.prototype.hasOwnProperty.call(ruleNode, k) && !k.startsWith('$')) childRule = ruleNode[k];
      else {
        let otherRule = null;
        for (const rk of Object.keys(ruleNode)) {
          if (rk.startsWith('.')) continue;
          if (rk === k) { childRule = ruleNode[rk]; break; }
          if (rk === '$other') { otherRule = ruleNode[rk]; continue; }
          if (rk.startsWith('$')) { childRule = ruleNode[rk]; childBound = Object.assign({}, bound); childBound[rk.slice(1)] = k; break; }
        }
        if (!childRule) childRule = otherRule; // $other catch-all, tried last
      }
      // RTDB semantics: a child with NO matching rule is unconstrained
      // (not denied) — deny-by-default is opt-in via an explicit $other:false.
      if (!childRule) continue;
      const r = checkNode(childRule, data[k], childBound, pathStr + '/' + k);
      if (!r.ok) return r;
    }
  }
  return { ok: true };
}

// .write cascade (RTDB: granted if ANY node root->target evaluates true).
// rulesRoot is the rules OBJECT (rules.rules), not the whole file.
export function writeAllowed(rulesRoot, path, auth) {
  const parts = path.split('/').filter(Boolean);
  let node = rulesRoot;
  const bound = {};
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!node || typeof node !== 'object') break;
    let matched = null;
    for (const key of Object.keys(node)) {
      if (key.startsWith('.')) continue;
      if (key === seg) { matched = { key, isWildcard: false }; break; }
      if (key.startsWith('$')) { matched = { key, isWildcard: true }; break; }
    }
    if (!matched) break;
    if (matched.isWildcard) bound[matched.key.slice(1)] = seg;
    node = node[matched.key];
    const w = node && node['.write'];
    if (w && safeEval(w, { auth, vars: bound })) return true;
  }
  return false;
}

function safeEval(expr, ctx) {
  try { return !!evalExpr(expr, ctx); } catch { return false; }
}

// --- expression evaluator -----------------------------------------------------
function evalExpr(src, ctx) {
  const p = new Parser(src);
  const v = p.parseExpr(ctx);
  p.expectEnd();
  return v;
}

class Parser {
  constructor(src) { this.s = src; this.i = 0; }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  peek(tok) { this.ws(); return this.s.startsWith(tok, this.i); }
  eat(tok) { if (this.peek(tok)) { this.i += tok.length; return true; } return false; }
  expectEnd() { this.ws(); if (this.i < this.s.length) throw new Error('unexpected trailing: ' + this.s.slice(this.i, this.i + 40)); }
  parseExpr(ctx) { return this.parseOr(ctx); }
  parseOr(ctx) { let l = this.parseAnd(ctx); while (this.eat('||')) { const r = this.parseAnd(ctx); l = l || r; } return l; }
  parseAnd(ctx) { let l = this.parseUnary(ctx); while (this.eat('&&')) { const r = this.parseUnary(ctx); l = l && r; } return l; }
  parseUnary(ctx) {
    this.ws();
    if (this.eat('!')) return !this.parseUnary(ctx);
    if (this.eat('(')) { const v = this.parseOr(ctx); if (!this.eat(')')) throw new Error('expected )'); return v; }
    return this.parseAtom(ctx);
  }
  parseAtom(ctx) {
    this.ws();
    if (this.eat('auth')) return this.parseTarget(ctx.auth, ctx);
    if (this.s.startsWith('$', this.i)) {
      const m = /^\$([A-Za-z_]\w*)/.exec(this.s.slice(this.i));
      if (!m) throw new Error('bad $var at: ' + this.s.slice(this.i, this.i + 20));
      this.i += m[0].length;
      const val = ctx.vars[m[1]];
      if (val === undefined) throw new Error('unbound var $' + m[1]);
      // chainable: $date.matches(...), $cat.length >= 1, or comparison rhs
      return this.parseTarget(val, ctx);
    }
    if (this.eat('newData')) return this.parseTarget(ctx.newData, ctx);
    throw new Error('unexpected atom at: ' + this.s.slice(this.i, this.i + 30));
  }
  parseTarget(obj, ctx) {
    this.ws();
    if (this.eat('.val()')) return this.parseValOps(obj, ctx);
    // String method directly on the atom ($date.matches(/.../)) — must be
    // handled before generic property access, whose regex could otherwise
    // backtrack into the method name.
    let mm = /^\.matches\(\/((?:[^\/\\]|\\.)*)\/([a-z]*)\)/.exec(this.s.slice(this.i));
    if (mm) {
      this.i += mm[0].length;
      if (typeof obj !== 'string') return this.finishBool(false);
      return this.finishBool(new RegExp(mm[1], mm[2]).test(obj));
    }
    if (this.eat('.isString()')) return this.finishBool(typeof obj === 'string');
    if (this.eat('.isNumber()')) return this.finishBool(typeof obj === 'number' && isFinite(obj));
    if (this.eat('.isBoolean()')) return this.finishBool(typeof obj === 'boolean');
    if (this.eat('.hasChildren()')) return this.finishBool(obj !== null && typeof obj === 'object' && Object.keys(obj).length > 0);
    let m = /^\.hasChildren\(\s*\[([^\]]*)\]\s*\)/.exec(this.s.slice(this.i));
    if (m) {
      this.i += m[0].length;
      const keys = m[1].split(',').map(k => k.trim().replace(/^'|'$/g, ''));
      const has = obj !== null && typeof obj === 'object' && keys.every(k => Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== null);
      return this.finishBool(has);
    }
    m = /^\.child\(\s*'([^']+)'\s*\)/.exec(this.s.slice(this.i));
    if (m) {
      this.i += m[0].length;
      const child = (obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, m[1])) ? obj[m[1]] : null;
      return this.parseTarget(child, ctx);
    }
    // Property access (auth.uid, $cat.length on a STRING key). The (?![\w(])
    // lookahead stops both mid-identifier backtracking (.matche of .matches)
    // and method calls.
    let pm = /^\.([A-Za-z_]\w*)(?![\w(])/.exec(this.s.slice(this.i));
    if (pm) {
      this.i += pm[0].length;
      const has = obj !== null && (typeof obj === 'object' || typeof obj === 'string') && Object.prototype.hasOwnProperty.call(obj, pm[1]);
      const pv = has ? obj[pm[1]] : null;
      return this.parseValOps(pv, ctx);
    }
    // Bare comparison right after the atom (auth != null)
    const om = /^(===|!==|==|!=|<=|>=|<|>)\s*/.exec(this.s.slice(this.i));
    if (om) return this.parseCompareOps(obj, ctx);
    // bare bound var used as boolean (not emitted by our generator, but legal)
    this.finishBool(obj !== null && obj !== undefined);
    return true; // unreachable (finishBool throws on non-bool)
  }
  parseValOps(val, ctx) {
    this.ws();
    if (this.eat('=== null')) return this.finishBool(val === null || val === undefined);
    let m = /^\.matches\(\/((?:[^\/\\]|\\.)*)\/([a-z]*)\)/.exec(this.s.slice(this.i));
    if (m) {
      this.i += m[0].length;
      if (typeof val !== 'string') return this.finishBool(false);
      const re = new RegExp(m[1], m[2]); // unanchored, like RTDB; generator supplies anchors
      return this.finishBool(re.test(val));
    }
    m = /^\.length\s*(<=|>=|==|!=|<|>)\s*(-?\d+)/.exec(this.s.slice(this.i));
    if (m) {
      this.i += m[0].length;
      if (typeof val !== 'string') return this.finishBool(false);
      return this.finishBool(compare((val || '').length, m[1], Number(m[2])));
    }
    m = /^(<=|>=|===|!==|==|!=|<|>)\s*/.exec(this.s.slice(this.i));
    if (m) return this.parseCompareOps(val, ctx);
    // bare .val() truthiness
    return this.finishBool(val !== null && val !== undefined);
  }
  parseCompareOps(val, ctx) {
    const m = /^(<=|>=|===|!==|==|!=|<|>)\s*/.exec(this.s.slice(this.i));
    if (!m) throw new Error('expected comparison at: ' + this.s.slice(this.i, this.i + 20));
    const op = m[1] === '===' ? '==' : m[1] === '!==' ? '!=' : m[1];
    this.i += m[0].length;
    this.ws();
    if (this.eat('null')) return this.finishBool(compare(val, op, null));
    if (this.i < this.s.length && (this.s[this.i] === "'" || this.s[this.i] === '"')) {
      const lit = this.parseStringLit();
      return this.finishBool(compare(val, op, lit));
    }
    if (this.i < this.s.length && this.s[this.i] === '$') {
      const vm2 = /^\$([A-Za-z_]\w*)/.exec(this.s.slice(this.i));
      if (!vm2) throw new Error('bad $var rhs');
      this.i += vm2[0].length;
      const rv = ctx.vars[vm2[1]];
      if (rv === undefined) throw new Error('unbound var $' + vm2[1]);
      return this.finishBool(compare(val, op, rv));
    }
    const num = /^-?\d+(\.\d+)?/.exec(this.s.slice(this.i));
    if (num) { this.i += num[0].length; return this.finishBool(compare(val, op, Number(num[0]))); }
    throw new Error('bad comparison rhs at: ' + this.s.slice(this.i, this.i + 20));
  }
  parseStringLit() {
    const q = this.s[this.i]; this.i++;
    let out = '';
    while (this.i < this.s.length && this.s[this.i] !== q) {
      if (this.s[this.i] === '\\') { this.i++; out += this.s[this.i]; } else out += this.s[this.i];
      this.i++;
    }
    if (this.i >= this.s.length) throw new Error('unterminated string literal');
    this.i++;
    return out;
  }
  finishBool(b) { if (b !== true && b !== false) throw new Error('non-bool'); return b; }
}

function compare(l, op, r) {
  // RTDB-ish coercion: number vs numeric string compares numerically.
  const num = (x) => (typeof x === 'number' ? x : (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : undefined));
  const ln = num(l), rn = num(r);
  if (ln !== undefined && rn !== undefined) {
    switch (op) {
      case '<=': return ln <= rn; case '>=': return ln >= rn; case '==': return ln === rn;
      case '!=': return ln !== rn; case '<': return ln < rn; case '>': return ln > rn;
    }
  }
  switch (op) {
    case '==': return l === r; case '!=': return l !== r;
    case '<': return l < r; case '>': return l > r; case '<=': return l <= r; case '>=': return l >= r;
  }
  return false;
}
