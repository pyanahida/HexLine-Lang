# Hexline

A tiny language created on 2026-10-23. One operation per line. The compiler is a single HTML page. 

Hexline is an assembly-like, hex-centric language with arbitrary precision, infinite loops, and a slightly unhinged philosophy (like blocking the browser thread for weeks if you tell it to).

## Files
- `index.html` — UI: file picker, examples dropdown, code box, run button, console
- `bighex.js` / `encoding.js` / `dialog.js` / `parser.js` / `interpreter.js` / `ui.js` — split logic
- `style.css` — minimal dark theme

## Quick Start
1. Open `index.html` in a browser.
2. Pick a `.hxl` source file or select a built-in example.
3. Press **Run**.
4. Output and errors go to the console area.

---

# Beginner's Tutorial

Welcome to Hexline! This language is an assembly-like, one-operation-per-line system that operates entirely on hexadecimal numbers and arbitrary precision. Here is a step-by-step guide to mastering the language.

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
We also have built-in literals: `TRUE` (`1`), `FALSE` (`0`), `PI`, `E`, `RANDOM` (0-1 random hex), and `TIME` (Unix timestamp).

```text
using utf-8
def a $10      // a = 16 in decimal
def b $5       // b = 5
add a b        // a = a + b (21 in decimal, or $15)
printnum a     // Outputs '15' (hex)
```

Hexline has infinite precision. You can do `def c $FFF.7A`, and it will never lose its accuracy. It also supports complex operations and math functions (e.g., `sinh`, `lg`, `pow`).

## Lesson 3: Logic and Control Flow
Hexline supports `if-eq` with an optional `endif-else` and `endelse` for branching. (No standard `else` keyword here!).

```text
using utf-8
def x $2
if-eq x $2
  print "X is two!"
endif-else
  print "X is not two."
endelse
```

Loops can be created using `while` or a fixed count `loop`:
```text
using utf-8
def a $5
loop a
  print "*"
  sub a $1
endloop
print $0A     // $0A is the newline character
```

## Lesson 4: Strings, Indexing & Searching
String variables (byte strings) are defined with `defstr`. They cannot do math, but they can be printed, indexed, and searched!

```text
using utf-8
defstr s "hexcdc"
def a s&index{0}  // Extracts the 0th byte: 'h' ($68)
def b s&find{"cd"} // Finds substring "cd", returns index $3
print a
```

## Lesson 5: Dynamic Scopes & Memory
Variables can be swapped (if they are the same type) or deleted. You can also create temporary scopes with `area`.

```text
using utf-8
def a $1
def b $2
swap a b       // a becomes $2, b becomes $1
del b          // b is gone
```

## Lesson 6: Arrays
Arrays store sequences of hex numbers. Let's create one and manipulate it.
```text
using utf-8
defarr arr $A $B $C  // Array of 3 elements
append arr $D        // Add $D to the end
def len arr&len      // len = 4
def val arr&index{1} // val = $B
```

## Lesson 7: Interactive Input & Timing
You can read user input, or even block the entire browser thread if you want.
```text
using utf-8
inputnum a     // Opens dialog for hex input
sleep-s 2.5    // Blocks the browser for 2.5 seconds (press F5 to force quit!)
print "Done"
```

---

# Complete Language Reference

## Numbers & Precision
- **Literals**: Hexadecimal only. `$` == `0x` (`$41`, `$-1`, `$7.5`).
- **Built-in Constants**:
  - `TRUE` (`$1`), `FALSE` (`$0`)
  - `PI` (64 hex digits), `E` (64 hex digits)
  - `RANDOM`: Generates a random hex float in `[0, 1)` with 64-digit precision.
  - `TIME`: Current Unix timestamp.
  - `RANDINT{a}{b}`: Generates a random integer in `[min(a,b), max(a,b)]`. Decimals truncate.
- **Arbitrary Precision**: No integer/float distinction. Infinite precision arrays used. Non-terminating fractions are truncated to 64 hex digits.

## Output
- `print ...`: Outputs bytes/strings using the `using` encoding. Non-printable ints output NUL.
- `printnum ...`: Hexadecimal, uppercase, no `0x`.
- `printdecnum ...`: Decimal, no separators.

## Variables & Memory
- `def a $10`: Define a number.
- `defstr s "text\x41"`: Define a string. Supports `\\`, `\"`, `\xNN`.
- `defarr arr x y z`: Define a numeric array.
- `del a`: Delete a variable. If `a` is an array, `del arr index` deletes a specific element.
- `swap a b`: Swap the values of `a` and `b` (errors if types differ).
- `area ... endarea`: Dynamic scope block. Variables declared inside are destroyed at `endarea`.

## Arrays
- `append arr x`: Append `x` to the array.
- `allclear arr`: Empty the array.
- `exchange arr index place x`: 
  - `place == 0`: replace `arr[index]` with `x`.
  - `place < 0`: insert `x` before `arr[index]`.
  - `place > 0`: insert `x` after `arr[index]`.
- `arr&index{x}`: Read element at `x` (negative allowed). Errors on out-of-bounds.
- `arr&len`: Get array length.
- `arr&include{x}`: Returns `1` if `x` is in array, else `0`.
- `arr&findfirst{x}`: Returns index of first occurrence of `x`, or `-1`.

## Strings (Byte Arrays)
- `s&index{N}`: Extract Nth byte (0-based). Negative `N` counts from right. Decimals truncate. Returns `-1` if out of bounds.
- `s&find{d}`: Search for substring (if `d` is a string) or byte (if `d` is a number). Returns first index or `-1`.

## Arithmetic & Math
- `add/sub/mul/div/fdiv a b`: `div` floors, `fdiv` standard division.
- `mod/fmod a b`: `mod` requires integer `b`. Sign follows: same signs -> positive, diff signs -> negative.
- `pow/ipow a b`: Real/Imaginary parts of \(a^b\).
- `concatnum a b`: Textual concatenation of numbers.
- `abs/floor/ceil/round/dot a`: `dot` clears the integer part, keeping the decimal.
- `lg/ln/log2 a`: Base 10, e, 2 logarithms.
- `log a b`: Base `b` logarithm of `a`.
- `sin/cos/tan/arcsin/arccos/arctan a`: Trig functions.
- `sinh/cosh/tanh/arsinh/arcosh/artanh a`: Hyperbolic functions.
- `exp/ten a`: \(e^a\) and \(10^a\).
- `usingrad` / `usingdeg`: Switch trig mode between radians and degrees.

## Bitwise
- `and/or/xor/nand/nor/nxor a b`
- `not a`

## Control Flow
- `if-eq A B ... endif` OR `if-eq A B ... endif-else ... endelse` (Also `ne`, `gt`, `ge`, `lt`, `le`).
- `while-eq A B ... endwhile` (Also `ne`, `gt`, `ge`, `lt`, `le`).
- `loop N ... endloop`: Runs N times.
- `break` / `continue`: Works inside `while` and `loop`.
- `label #name` / `goto #name`: Unconditional jump.

## Timing (Blocking)
- `sleep-s a`, `sleep-ms a`, `sleep-us a`
- `sleep-min a`, `sleep-hour a`, `sleep-day a`, `sleep-week a`
- Blocks the main thread for `a` time. Negatives are treated as absolute.

## Input
- `input a`: Reads one character (UTF-8 byte).
- `inputstr a`: Reads a whole string.
- `inputnum a`: Prompts for hex number.
- `inputdecnum a`: Prompts for decimal number (converted to 64-digit hex).
