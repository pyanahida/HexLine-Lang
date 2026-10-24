# Hexline

A tiny language created on 2026-10-23. One operation per line. The compiler is a single HTML page.

## Files
- `index.html` — UI: file picker, examples dropdown, code box, run button, console
- `bighex.js` / `encoding.js` / `parser.js` / `interpreter.js` / `ui.js` — split logic
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
We also have built-in literals: `TRUE` (`1`), `FALSE` (`0`), `PI`, `E`, and `RANDOM` (0~1 random 64-bit float).

```text
using utf-8
def a $10      // a = 16 in decimal
def b $5       // b = 5
add a b        // a = a + b (21 in decimal, or $15)
printnum a     // Outputs '15' (hex)
```

Hexline has infinite precision. You can do `def c $FFF.7A`, and it will never lose its accuracy.

## Lesson 3: Logic and Control Flow
Hexline supports `if-eq` with `endif-else` and `endelse` for branching.

```text
using utf-8
def x $2
if-eq x $2
  print "X is two!"
endif-else
  print "X is not two."
endelse
```

Loops and areas (scope blocks) are also supported:
```text
using utf-8
def a $5
loop a
  print "*"
  sub a $1
endloop
print $0A     // $0A is the newline character
```

## Lesson 4: Strings and Indexing
String variables (byte strings) are defined with `defstr`. They can be printed, indexed, and searched!

```text
using utf-8
defstr s "hexcdc"
def a s&index{0}  // Extracts the 0th byte: 'h'
def b s&find{"cd"} // Finds substring "cd", returns index 3 ($3)
def c s&find{$63}  // Finds byte 'c' ($63), returns index 2
```

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
- Literals are hexadecimal only: `$` == `0x`.
- Built-in literals: `TRUE` (`$1`), `FALSE` (`$0`), `PI`, `E`, `RANDOM` (64-bit hex float in [0, 1)).
- **Arbitrary Precision**: Numbers are stored as hex arrays. Non-terminating fractions are truncated to 64 hex digits.
- Built-in `PI` and `E` are accurate to 64 hex digits.

## Output
- `print ...` — Outputs bytes/strings using the `using` encoding.
- `printnum ...` — Hexadecimal, uppercase.
- `printdecnum ...` — Decimal.

## Variables & Arithmetic
- `def a $10` / `del a`
- `defstr s "text\x41"`
- `add/sub/mul/div/fdiv a b`
- `mod/fmod a b`
- `pow/ipow a b`
- `concatnum a b` — Purely textual concatenation of integers and fractions.
- `abs/floor/ceil/round/dot a`
- `lg/ln/log2 a`, `log a b`, `sin/cos/tan/arcsin/arccos/arctan a`
- `sinh/cosh/tanh/arsinh/arcosh/artanh a`, `exp/ten a`
- `usingrad` / `usingdeg`

## Strings
- `s&index{N}` — Extract Nth byte.
- `s&find{d}` — Search for substring (if `d` is a string) or byte (if `d` is a number), returns index or `-1`.

## Control Flow
- `if-eq A B ... endif` OR `if-eq A B ... endif-else ... endelse`
- `while-eq A B ... endwhile`
- `loop N ... endloop`
- `area ... endarea`
- `break` / `continue`
- `label #name` / `goto #name`

## Input
- `input a`, `inputstr a`, `inputnum a`, `inputdecnum a`.
