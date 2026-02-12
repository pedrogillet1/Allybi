function normalizeWhitespace(s) {
  return String(s || "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tokenizeWords(s) {
  // Normalize to keep diff stable and readable inside DOCX preview.
  const t = normalizeWhitespace(s);
  if (!t) return [];
  // Split on spaces but keep punctuation attached to tokens (good enough for UX).
  return t.split(" ").filter(Boolean);
}

// Myers diff (O((N+M)D)) on token arrays.
function myersDiff(a, b) {
  const N = a.length;
  const M = b.length;
  const max = N + M;
  const v = new Map();
  v.set(1, 0);
  const trace = [];

  for (let d = 0; d <= max; d += 1) {
    const vSnapshot = new Map(v);
    trace.push(vSnapshot);
    for (let k = -d; k <= d; k += 2) {
      const down = v.get(k - 1);
      const right = v.get(k + 1);
      let x;
      if (k === -d || (k !== d && (down ?? -Infinity) < (right ?? -Infinity))) {
        x = right ?? 0;
      } else {
        x = (down ?? 0) + 1;
      }
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v.set(k, x);
      if (x >= N && y >= M) {
        return { trace, d };
      }
    }
  }
  return { trace, d: max };
}

function backtrack(a, b, trace, d) {
  let x = a.length;
  let y = b.length;
  const edits = [];

  for (let depth = d; depth >= 0; depth -= 1) {
    const v = trace[depth];
    const k = x - y;
    const prevK =
      k === -depth || (k !== depth && (v.get(k - 1) ?? -Infinity) < (v.get(k + 1) ?? -Infinity))
        ? k + 1
        : k - 1;
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      edits.push({ type: "equal", token: a[x - 1] });
      x -= 1;
      y -= 1;
    }

    if (depth === 0) break;

    if (x === prevX) {
      // insertion
      edits.push({ type: "ins", token: b[prevY] });
      y -= 1;
    } else {
      // deletion
      edits.push({ type: "del", token: a[prevX] });
      x -= 1;
    }
  }

  edits.reverse();
  return edits;
}

export function wordDiff(beforeText, afterText) {
  const a = tokenizeWords(beforeText);
  const b = tokenizeWords(afterText);
  if (!a.length && !b.length) return [];
  if (!a.length) return b.map((t) => ({ type: "ins", text: t }));
  if (!b.length) return a.map((t) => ({ type: "del", text: t }));

  const { trace, d } = myersDiff(a, b);
  const raw = backtrack(a, b, trace, d);

  // Merge consecutive ops into spans and re-add spaces between tokens.
  const out = [];
  for (const r of raw) {
    const type = r.type;
    const token = r.token;
    if (!token) continue;
    const prev = out[out.length - 1] || null;
    if (prev && prev.type === type) prev.text += ` ${token}`;
    else out.push({ type, text: token });
  }
  return out;
}

