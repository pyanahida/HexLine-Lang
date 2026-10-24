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
