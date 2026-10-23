# Hexline

A tiny language created on 2026-10-22. One operation per line. The compiler is a single HTML page.

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

One operation per line. `//` starts a line comment. Literals are hexadecimal only: `$` == `0x` (`$41`, `$-1`, `$7.5`). No integer/float distinction.

### Output
- `print ...` — each value: if integer 0–255, accumulate as a byte; otherwise emit NUL. At the end, bytes are decoded using the specified `using` encoding and output.
- `printnum ...` — hexadecimal, uppercase, no `0x`, no separators, fractions kept.
- `printdecnum ...` — decimal, no separators.

### Variables & arithmetic
- `def a $10`
- `add/sub/mul/div/fdiv a b` — result stored in `a`. `div` floors. `fdiv` is normal division. Division by zero is an error.
- `abs/floor/ceil/round a` — unary, stored in `a`. `round` is mathematical rounding.

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
- `input a` — reads one character (UTF-8 first byte) into `a`. On mobile devices, a temporary input element is created to trigger the soft keyboard.

## Errors
Errors are printed on a new line in the console and stop execution.
