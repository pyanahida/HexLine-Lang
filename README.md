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

```text
using utf-8
def a $10      // a = 16 in decimal
def b $5       // b = 5
add a b        // a = a + b (21 in decimal, or $15)
printnum a     // Outputs '15' (hex)
```
Note: Hexline has infinite precision. You can do `def c $FFF.7A`, and it will never lose its accuracy.

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
*(Output: `*****` followed by a newline)*

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
You can read user input. `input` reads a single character (UTF-8 byte), and `inputstr` opens a prompt for a full string.

```text
using utf-8
input a
print a
```

---

# Language Reference

## Numbers & Precision
- Literals are hexadecimal only: `$` == `0x` (`$41`, `$-1`, `$7.5`).
- No integer/float distinction.
- **Arbitrary Precision**: Numbers are stored as hex arrays. Precision auto-expands as needed.
- Non-terminating fractions are truncated to 32 hex digits.

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
- `abs/floor/ceil/round/dot a` — `dot` clears the integer part, keeping the decimal.
- `lg/ln/log2/sin/cos/tan/arcsin/arccos/arctan a` — Math functions (radians).
- `log a b` — Base `b` logarithm of `a`.

## Strings
- `s&index{N}` — Extract Nth byte (0-based). Negative `N` counts from right. Decimals truncate.

## Bitwise (Truncated, absolute values)
- `and/or/xor/nand/nor/nxor a b`
- `not a`

## Control Flow
- `if-eq A B ... endif` (also `ne`, `gt`, `ge`, `lt`, `le`)
- `while-eq A B ... endwhile`
- `loop N ... endloop`
- `break` / `continue`
- `label #name` / `goto #name`

## Input
- `input a` — Reads one character.
- `inputstr a` — Reads a whole string.
