# Hexline

A tiny language created on 2026-10-23. One operation per line. The compiler is a single HTML page.

## Files
- `index.html` — UI: file picker, examples dropdown, code box, run button, console
- `script.js` (or split logic: `bighex.js`, `encoding.js`, `interpreter.js`, `ui.js`) — lexer/parser/interpreter
- `style.css` — minimal dark theme

## Quick Start
1. Open `index.html` in a browser.
2. Pick a `.hxl` source file or select a built-in example.
3. Press **Run**.
4. Output and errors go to the console area.

---

# Beginner's Tutorial

Welcome to Hexline! This language is an assembly-like, one-operation-per-line system that operates entirely on hexadecimal numbers and arbitrary precision. Here is a step-by-step guide to writing your first programs.

## Lesson 1: Hello, World!
Every Hexline program must start by declaring the character encoding using the `using` keyword. Let's start with UTF-8.

```text
using utf-8
print "Hello, World!"
```

Because `print` supports raw string literals (with spaces), this is straightforward. But remember, Hexline's core is hexadecimal. If you want to print "ABC", you can also use ASCII hex codes (`$41`, `$42`, `$43`):

```text
using utf-8
print $41 $42 $43
```
*(Output: `ABC`)*

## Lesson 2: Variables and Math
Variables are defined using `def`. All numbers are hexadecimal (`$` is the same as `0x`).
We also have built-in literals: `TRUE` (`1`), `FALSE` (`0`), `PI`, and `E`.

```text
using utf-8
def a $10      // a = 16 in decimal
def b $5       // b = 5
add a b        // a = a + b (21 in decimal, or $15)
printnum a     // Outputs '15' (hex)
```

Hexline has infinite precision. You can do `def c $FFF.7A`, and it will never lose its accuracy.

## Lesson 3: Logic and Control Flow
Hexline doesn't have `else`, but it has conditionals and loops. Blocks are closed with `endif` or `endloop`.

```text
using utf-8
def a $5
loop a
  print "*"
  sub a $1
endloop
print $0A     // $0A is the newline character
```

You can also use `while` loops or `if` conditions:
```text
using utf-8
def x $2
if-eq x $2
  print "X is two!"
endif
```

## Lesson 4: Strings and Indexing
String variables (byte strings) are defined with `defstr`. They can't do math, but they can be printed and indexed!

```text
using utf-8
defstr s "hex"
def a s&index{0}  // Extracts the 0th byte: 'h' ($68)
print a           // Outputs 'h'
```

You can also use variables for the index. If you index out of bounds, it returns `-1`.

## Lesson 5: Interactive Input
You can read user input. `input` reads a single character, `inputstr` opens a prompt for a string, and `inputnum` / `inputdecnum` read numbers.

```text
using utf-8
inputnum a
printnum a
```

---

# Language Reference

## Numbers & Precision
- Literals are hexadecimal only: `$` == `0x` (`$41`, `$-1`, `$7.5`).
- Built-in literals: `TRUE` (`$1`), `FALSE` (`$0`), `PI`, `E`. (These cannot be used as variable names).
- No integer/float distinction.
- **Arbitrary Precision**: Numbers are stored as hex arrays. Precision auto-expands as needed.
- Non-terminating fractions are truncated to 64 hex digits.
- Built-in `PI` and `E` are accurate to 64 hex digits.

## Output
- `print ...` — Outputs bytes/strings using the `using` encoding. NUL for out-of-range ints.
- `printnum ...` — Hexadecimal, uppercase, no `0x`.
- `printdecnum ...` — Decimal.

## Variables & Arithmetic
- `def a $10` / `del a` (delete variable)
- `defstr s "text\x41"` — Supports `\\`, `\"`, `\xNN`.
- `add/sub/mul/div/fdiv a b` — `div` floors, `fdiv` normal division.
- `mod/fmod a b` — `mod` requires integer `b`. Signs: same=positive, diff=negative.
- `pow/ipow a b` — Real/Imaginary parts of \(a^b\).
- `concatnum a b` — Purely textual concatenation of `a` and `b`. Integer parts join, fractional parts join. Zero integer parts are omitted (but default to '0' if both are empty). Signs: same sign -> positive, diff sign -> negative.
- `abs/floor/ceil/round/dot a` — `dot` clears the integer part, keeping the decimal.
- `lg/ln/log2 a` — Logarithms (base 10, e, 2).
- `log a b` — Base `b` logarithm of `a`.
- `sin/cos/tan/arcsin/arccos/arctan a` — Trig functions.
- `sinh/cosh/tanh/arsinh/arcosh/artanh a` — Hyperbolic functions.
- `exp/ten a` — \(e^a\) and \(10^a\).
- `usingrad` / `usingdeg` — Switch trig mode between radians and degrees (default `usingrad`).

## Strings
- `s&index{N}` — Extract Nth byte (0-based). Negative `N` counts from right. Decimals truncate.

## Bitwise (Truncated, absolute values)
- `and/or/xor/nand/nor/nxor a b`
- `not a`

## Control Flow
- `if-eq A B ... endif` (also `ne`, `gt`, `ge`, `lt`, `le`)
- `while-eq A B ... endwhile`
- `loop N ... endloop`
- `area ... endarea` — Dynamic scope block. Variables defined inside are destroyed at the end. Modifying external variables affects them globally.
- `break` / `continue`
- `label #name` / `goto #name`

## Input
- `input a` — Reads one character.
- `inputstr a` — Reads a whole string.
- `inputnum a` — Prompts for a hex number.
- `inputdecnum a` — Prompts for a decimal number (converted to hex, 64 digits precision).
