/**
 * Arithmetic expression evaluator.
 *
 * Replaces the previous `Function("return (" + expression + ")")` call, which was
 * a code-execution primitive: its character allowlist still spelled `alert(1)`,
 * `location` and `open`. This parser only ever produces numbers — there is no
 * path from user input to executed code.
 *
 * Grammar (recursive descent, standard precedence):
 *
 *   expression := term (("+" | "-") term)*
 *   term       := unary (("*" | "/" | "%") unary)*
 *   unary      := ("+" | "-") unary | power
 *   power      := primary ("^" unary)?          // right associative
 *   primary    := number | constant | name "(" args ")" | "(" expression ")"
 *   args       := expression ("," expression)*
 */

/** Stable reason codes; the caller maps these to localized messages. */
export type MathErrorCode = "badChar" | "badSyntax" | "unknownName" | "badArgs" | "notFinite" | "tooLong";

export class MathError extends Error {
  readonly code: MathErrorCode;
  constructor(code: MathErrorCode) {
    super(code);
    this.name = "MathError";
    this.code = code;
  }
}

const MAX_INPUT_LENGTH = 500;

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
};

/** `arity: 0` means "one or more arguments". */
const FUNCTIONS: Record<string, { arity: number; apply: (args: number[]) => number }> = {
  sqrt: { arity: 1, apply: ([x = NaN]) => Math.sqrt(x) },
  cbrt: { arity: 1, apply: ([x = NaN]) => Math.cbrt(x) },
  abs: { arity: 1, apply: ([x = NaN]) => Math.abs(x) },
  sign: { arity: 1, apply: ([x = NaN]) => Math.sign(x) },
  floor: { arity: 1, apply: ([x = NaN]) => Math.floor(x) },
  ceil: { arity: 1, apply: ([x = NaN]) => Math.ceil(x) },
  round: { arity: 1, apply: ([x = NaN]) => Math.round(x) },
  trunc: { arity: 1, apply: ([x = NaN]) => Math.trunc(x) },
  exp: { arity: 1, apply: ([x = NaN]) => Math.exp(x) },
  ln: { arity: 1, apply: ([x = NaN]) => Math.log(x) },
  log: { arity: 1, apply: ([x = NaN]) => Math.log10(x) },
  log2: { arity: 1, apply: ([x = NaN]) => Math.log2(x) },
  log10: { arity: 1, apply: ([x = NaN]) => Math.log10(x) },
  sin: { arity: 1, apply: ([x = NaN]) => Math.sin(x) },
  cos: { arity: 1, apply: ([x = NaN]) => Math.cos(x) },
  tan: { arity: 1, apply: ([x = NaN]) => Math.tan(x) },
  asin: { arity: 1, apply: ([x = NaN]) => Math.asin(x) },
  acos: { arity: 1, apply: ([x = NaN]) => Math.acos(x) },
  atan: { arity: 1, apply: ([x = NaN]) => Math.atan(x) },
  sinh: { arity: 1, apply: ([x = NaN]) => Math.sinh(x) },
  cosh: { arity: 1, apply: ([x = NaN]) => Math.cosh(x) },
  tanh: { arity: 1, apply: ([x = NaN]) => Math.tanh(x) },
  atan2: { arity: 2, apply: ([y = NaN, x = NaN]) => Math.atan2(y, x) },
  pow: { arity: 2, apply: ([x = NaN, y = NaN]) => x ** y },
  hypot: { arity: 0, apply: (args) => Math.hypot(...args) },
  min: { arity: 0, apply: (args) => Math.min(...args) },
  max: { arity: 0, apply: (args) => Math.max(...args) },
  deg: { arity: 1, apply: ([x = NaN]) => (x * 180) / Math.PI },
  rad: { arity: 1, apply: ([x = NaN]) => (x * Math.PI) / 180 },
};

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "%" | "^" }
  | { kind: "paren"; value: "(" | ")" }
  | { kind: "comma" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    // The loop guard makes this defined; `?? ""` only satisfies the type.
    const char = input[index] ?? "";

    if (char === " " || char === "\t" || char === "\n" || char === "\r" || char === "_") {
      index += 1;
      continue;
    }

    // Thousands separators are dropped only between digits, so "1,234" reads as
    // 1234 while "max(1,2)" still separates two arguments.
    if (char === "," && /[0-9]/.test(input[index - 1] ?? "") && /[0-9]/.test(input[index + 1] ?? "")) {
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ kind: "comma" });
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(input.slice(index));
      if (!match) throw new MathError("badSyntax");
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new MathError("badSyntax");
      tokens.push({ kind: "number", value });
      index += match[0].length;
      continue;
    }

    if (/[a-z]/i.test(char)) {
      const match = /^[a-z][a-z0-9]*/i.exec(input.slice(index));
      if (!match) throw new MathError("badChar");
      tokens.push({ kind: "name", value: match[0].toLowerCase() });
      index += match[0].length;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "%" || char === "^") {
      // "**" is accepted as a synonym for "^".
      if (char === "*" && input[index + 1] === "*") {
        tokens.push({ kind: "op", value: "^" });
        index += 2;
        continue;
      }
      tokens.push({ kind: "op", value: char });
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      index += 1;
      continue;
    }

    throw new MathError("badChar");
  }

  return tokens;
}

/** Evaluates an arithmetic expression. Throws {@link MathError} on any problem. */
export function evaluateExpression(input: string): number {
  if (input.length > MAX_INPUT_LENGTH) throw new MathError("tooLong");

  const tokens = tokenize(input);
  if (tokens.length === 0) throw new MathError("badSyntax");

  let position = 0;
  const peek = () => tokens[position];

  function parseExpression(): number {
    let left = parseTerm();
    for (;;) {
      const token = peek();
      if (token?.kind !== "op" || (token.value !== "+" && token.value !== "-")) return left;
      position += 1;
      const right = parseTerm();
      left = token.value === "+" ? left + right : left - right;
    }
  }

  function parseTerm(): number {
    let left = parseUnary();
    for (;;) {
      const token = peek();
      if (token?.kind !== "op" || (token.value !== "*" && token.value !== "/" && token.value !== "%")) return left;
      position += 1;
      const right = parseUnary();
      if (token.value === "*") left = left * right;
      else if (token.value === "/") left = left / right;
      else left = left % right;
    }
  }

  function parseUnary(): number {
    const token = peek();
    if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
      position += 1;
      const value = parseUnary();
      return token.value === "-" ? -value : value;
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePrimary();
    const token = peek();
    if (token?.kind === "op" && token.value === "^") {
      position += 1;
      return base ** parseUnary(); // right associative: 2^3^2 === 2^(3^2)
    }
    return base;
  }

  function parsePrimary(): number {
    const token = peek();
    if (!token) throw new MathError("badSyntax");

    if (token.kind === "number") {
      position += 1;
      return token.value;
    }

    if (token.kind === "paren" && token.value === "(") {
      position += 1;
      const value = parseExpression();
      const closing = peek();
      if (closing?.kind !== "paren" || closing.value !== ")") throw new MathError("badSyntax");
      position += 1;
      return value;
    }

    if (token.kind === "name") {
      position += 1;
      const next = peek();

      if (next?.kind === "paren" && next.value === "(") {
        const fn = FUNCTIONS[token.value];
        if (!fn) throw new MathError("unknownName");
        position += 1;
        const args: number[] = [];
        if (peek()?.kind === "paren" && (peek() as { value: string }).value === ")") {
          position += 1;
        } else {
          for (;;) {
            args.push(parseExpression());
            const separator = peek();
            if (separator?.kind === "comma") {
              position += 1;
              continue;
            }
            if (separator?.kind === "paren" && separator.value === ")") {
              position += 1;
              break;
            }
            throw new MathError("badSyntax");
          }
        }
        if (fn.arity === 0 ? args.length === 0 : args.length !== fn.arity) throw new MathError("badArgs");
        return fn.apply(args);
      }

      const found = CONSTANTS[token.value];
      if (found === undefined) throw new MathError("unknownName");
      return found;
    }

    throw new MathError("badSyntax");
  }

  const result = parseExpression();
  if (position !== tokens.length) throw new MathError("badSyntax");
  if (typeof result !== "number" || Number.isNaN(result) || !Number.isFinite(result)) throw new MathError("notFinite");
  return result;
}

/** Formats a result without exponent noise for everyday values. */
export function formatNumber(value: number) {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  const rounded = Number(value.toPrecision(12));
  return String(rounded);
}
