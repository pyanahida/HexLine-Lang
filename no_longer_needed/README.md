# Hexline

A tiny language created on 2026-10-23. One operation per line. The compiler is a single HTML page.

## Files
- `index.html` — UI: file picker, examples dropdown, code box, run button, console
- `script.js` — lexer/parser/interpreter
- `style.css` — minimal dark theme

## Usage
1. Open `index.html` in a browser.
2. Pick a `.hxl` source file or select a built-in example.
3. Press **Run**.
4. Output and errors go to the console area.

## Language

First line must specify the **output encoding** (this does not restrict the source file's encoding):
```text
using utf-8
```
Supported encodings: `utf-8`, `iso-8859-1`, `utf-16le`, `utf-16be`, `utf-32le`, `utf-32be`, `gbk`, `windows-1252`.

One operation per line. `//` starts a line comment. 

### Numbers & Precision
- Literals are hexadecimal only: `$` == `0x` (`$41`, `$-1`, `$7.5`).
- There is no integer/float distinction.
- **Arbitrary Precision**: Numbers are stored as hex arrays. Precision auto-expands as needed (e.g., `$FFF.7A + $3.0002` = `1002.7A02`). There is no upper limit for precision.
- Non-terminating fractions (like irrational numbers or repeating decimals) are truncated to 32 hex digits after the decimal point.

### Output
- `print ...` — if integer 0–255, accumulate as a byte; otherwise emit NUL. Byte strings are appended as-is. All bytes are decoded using the specified `using` encoding.
- `printnum ...` — hexadecimal, uppercase, no `0x`, no separators, fractions kept.
- `printdecnum ...` — decimal, no separators.

### Variables & arithmetic
- `def a $10`
- `defstr a "text\x41"` — define a byte string. Supports `\\`, `\"`, `\xNN`. Other escapes keep the `\`. Strings cannot participate in arithmetic or comparisons, only in `print`.
- `add/sub/mul/div/fdiv a b` — result stored in `a`. `div` floors. `fdiv` is normal division. Division by zero is an error.
- `mod a b` / `fmod a b` — remainder. `mod` requires integer `b`. Sign follows: different signs give negative, same signs give positive. Division by zero is an error.
- `pow a b` — real part of \(a^b\).
- `ipow a b` — imaginary part of \(a^b\). `pow` and `ipow` error on \(0^0\) or \(0^{-1}\).
- `abs/floor/ceil/round a` — unary, stored in `a`. `round` is mathematical rounding.

### String Operations
- String indexing: `s&index{N}` extracts the Nth byte.
  - Positive `N` counts from left (0-based).
  - Negative `N` counts from right.
  - Out of bounds returns `-1`.
  - Example: `def a s&index{4}` stores the 5th byte in `a`.

### Bitwise
- `and/or/xor/nand/nor/nxor a b`
- `nand a b` = `a & ~b`, `nor` / `nxor` likewise only invert the second operand.
- Operands truncate fractions and take absolute values. Width = max bit width of both operands.
- `not a` — invert within `a`'s bit width.

### Conditionals
```
if-eq A B
...
endif
```
Also `if-ne`, `if-gt`, `if-ge`, `if-lt`, `if-le`. Blocks can nest. There is no `else`.

### Loops
```
while-eq A B
...
endwhile
```
Also `while-ne`, `while-gt`, `while-ge`, `while-lt`, `while-le`. Blocks can nest. `break` and `continue` are supported.

### Jumps
```
label #name
goto #name
```
Label names: `#` + `[a-zA-Z0-9_]`. `goto` is unconditional.

### Input
- `input a` — reads one character (UTF-8 first byte) into `a`. On mobile, a temporary input element is created to trigger the soft keyboard.
- `inputstr a` — opens a native prompt to read a full string, stored in `a` as a byte string using the `using` encoding.

## Errors
Errors are printed on a new line in the console and stop execution.
