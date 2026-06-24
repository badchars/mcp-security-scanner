export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

// Keyboard adjacency map (QWERTY layout)
const KEYBOARD_ADJACENT: Record<string, string[]> = {
  q: ["w", "a"], w: ["q", "e", "s", "a"], e: ["w", "r", "d", "s"],
  r: ["e", "t", "f", "d"], t: ["r", "y", "g", "f"], y: ["t", "u", "h", "g"],
  u: ["y", "i", "j", "h"], i: ["u", "o", "k", "j"], o: ["i", "p", "l", "k"],
  p: ["o", "l"],
  a: ["q", "w", "s", "z"], s: ["a", "w", "e", "d", "z", "x"],
  d: ["s", "e", "r", "f", "x", "c"], f: ["d", "r", "t", "g", "c", "v"],
  g: ["f", "t", "y", "h", "v", "b"], h: ["g", "y", "u", "j", "b", "n"],
  j: ["h", "u", "i", "k", "n", "m"], k: ["j", "i", "o", "l", "m"],
  l: ["k", "o", "p"],
  z: ["a", "s", "x"], x: ["z", "s", "d", "c"],
  c: ["x", "d", "f", "v"], v: ["c", "f", "g", "b"],
  b: ["v", "g", "h", "n"], n: ["b", "h", "j", "m"], m: ["n", "j", "k"],
};

export function isKeyboardAdjacent(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diffs = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diffs++;
      if (diffs > 1) return false;
      const adj = KEYBOARD_ADJACENT[a[i].toLowerCase()];
      if (!adj || !adj.includes(b[i].toLowerCase())) return false;
    }
  }
  return diffs === 1;
}

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

export function isVowelSwap(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diffs = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diffs++;
      if (diffs > 1) return false;
      if (!VOWELS.has(a[i].toLowerCase()) || !VOWELS.has(b[i].toLowerCase())) return false;
    }
  }
  return diffs === 1;
}

export function normalizeSeparators(name: string): string {
  return name.replace(/[-._]/g, "-").toLowerCase();
}

export function isSeparatorConfusion(a: string, b: string): boolean {
  if (a === b) return false;
  return normalizeSeparators(a) === normalizeSeparators(b);
}

export function isScopeSquatting(a: string, b: string): boolean {
  const scopeA = a.match(/^@([^/]+)\//);
  const scopeB = b.match(/^@([^/]+)\//);
  if (!scopeA || !scopeB) return false;
  if (scopeA[1] === scopeB[1]) return false;
  const nameA = a.replace(/^@[^/]+\//, "");
  const nameB = b.replace(/^@[^/]+\//, "");
  if (nameA !== nameB) return false;
  return levenshtein(scopeA[1], scopeB[1]) <= 2;
}
