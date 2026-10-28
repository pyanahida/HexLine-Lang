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
String variables (byte strings) are defined with `defstr`. They cannot do math, but they can be printed, indexed, searched, and concatenated!

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

## Lesson 6: Arrays & Aggregation
Arrays store sequences of hex numbers. Let's create one, manipulate it, and do math on it.
```text
using utf-8
defarr arr $A $B $C  // Array of 3 elements
append arr $D        // Add $D to the end
def len arr&len      // len = 4
def val arr&index{1} // val = $B
sum total arr        // total = $A + $B + $C + $D
```

## Lesson 7: Interactive Input & Timing
You can read user input with custom prompts, or even block the entire browser thread if you want.
```text
using utf-8
defstr prompt "Type a number:"
hinputnum a prompt // Opens dialog with custom text
sleep-s 2.5        // Blocks the browser for 2.5 seconds
print "Done"
```

## Lesson 8: Functions and Pointers
Functions in Hexline are fully isolated. When you call a function, it takes a deep copy of all global variables. This means unless you explicitly use pointers, your function cannot alter the outside world.

```text
using utf-8
def a $5

func %addToGlobal 'x
  def *a 0        // * forces modification of the global 'a'
  add *a *'x      // *'x accesses the pointer to the passed argument
endfunc

user::addToGlobal a // passes 'a' by reference
printnum a          // Outputs 5 + 0 = 5
```
*(Wait, in the example above, `a` was passed as an argument and accessed via `*'x`. This shows how to pass by reference).*

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
  - `LG3` (log10 3), `LG7` (log10 7), `GAMMA` (Euler-Mascheroni constant).
  - `SQRT2`, `SQRT3`, `SQRT5`, `PHI`, `LG2` (64 hex digits).
- **Arbitrary Precision**: Non-terminating fractions are truncated to 64 hex digits.

## Output
- `print ...`: Outputs bytes/strings using the `using` encoding. Non-printable ints output NUL.
- `printnum ...`: Hexadecimal, uppercase, no `0x`.
- `printdecnum ...`: Decimal, no separators.
- `println ...` / `printnumln ...` / `printdecnumln ...`: Print with a trailing newline.
- Line macros: If a line ends with `+`, it is automatically translated to a newline print statement.

## Variables & Memory
- `def a $10`: Define a number.
- `defstr s "text\x41"`: Define a string. Supports `\\`, `\"`, `\xNN`.
- `defarr arr x y z`: Define a numeric array (can be empty).
- `del a`: Delete a variable.
- `swap a b`: Swap the values of `a` and `b` (errors if types differ).
- `area ... endarea`: Dynamic scope block.

## Functions
- `func %name 'v1 'v2 ... endfunc`: Defines a void function. `'v1` declares a local parameter copy.
- `user::name arg1 arg2`: Calls a function. Passing literals restricts `*'v1` modifications.
- `*a`: Access/Modify the global variable `a` from inside a function.
- `'v1`: Access the parameter copy.
- `*'v1`: Access/Modify the actual argument passed to the function (by reference).

## Arrays
- `append arr x`: Append `x` to the array.
- `deli arr index`: Delete element at `index`.
- `allclear arr`: Empty the array.
- `exchange arr index place x`: Insert/replace.
- `sum a array` / `prod a array`: Sum or multiply all elements. Auto-creates `a` if missing.
- `arr&index{x}`: Read element at `x`.
- `arr&len`: Get array length.
- `arr&include{x}`: Returns `1` if `x` is in array, else `0`.
- `arr&findfirst{x}`: Returns index of first occurrence, or `-1`.
- `arr&join{str}`: Join all hex strings using separator `str`.
- `defarr arr RANGE{start}{end}{step}`: Generates an array following Python's `range` rules.
- `arr&randitem`: Return a random element.
- `shuffle arr`: Randomly shuffle the array in place.
- `defstrarr arr ...`: Defines an array of strings.

## Strings (Byte Arrays)
- `concat a b`: Concatenate strings `a` and `b`.
- `s&index{N}`: Extract Nth byte.
- `s&len`: Length of string in bytes.
- `s&find{d}`: Search for substring or byte.
- `s&divide{sep}`: Split string into a string array. If `sep` is empty, splits by whitespace.
- `a&toString`: Convert number to string.
- `s&toLowerCase`: Converts ASCII A-Z to lowercase.
- `s&toUpperCase`: Converts ASCII a-z to uppercase.
- `s&fullmatch{"regex"}`: Returns `1` if the string completely matches the JS regex, else `0`.
- String escapes: `\b`, `\a`, `\n`, `\t`, `\r`, `\\`, `\"`, `\xNN`.

## Arithmetic & Math
- `add/sub/mul/div/fdiv a b`: `div` floors, `fdiv` standard division.
- `mod/fmod a b`: `mod` requires integer `b`.
- `pow/ipow a b`: Real/Imaginary parts of \(a^b\).
- `concatnum a b`: Textual concatenation of numbers.
- `digitsave a num`: Keep `num` significant figures from the first non-zero digit (truncates and pads integers).
- `abs/floor/ceil/round/dot a`: `dot` clears the integer part.
- `lg/ln/log2 a`, `log a b`, `sin/cos/tan/arcsin/arccos/arctan a`
- `sinh/cosh/tanh/arsinh/arcosh/artanh a`, `exp/ten a`
- `usingrad` / `usingdeg` / `usinggrad`
- `percent a`: \(a / 100\)
- `sn a b c`: Scientific notation, \(a = b \times 10^c\).
- `sqrt/square/cube/cbrt a`: Square root, square, cube, cube root.
- `root a b`: Root of \(a\) with degree \(b\) (real part only).
- `fact a`: Factorial (errors if not non-negative integer).
- `pol a b c`: Polar radius, \(a = \sqrt{b^2 + c^2}\).
- `cot/coth/arccot/arcoth a`: Cotangent functions.
- `sec/csc/arcsec/arccsc/sech/csch/arsech/arcsch a`: Secant and cosecant functions.
- `versin/coversin/exsec/excsc/haversin a`: Historical trigonometric functions.

## Control Flow
- `if-eq A B ... endif` OR `if-eq A B ... endif-else ... endelse`
- `while-eq A B ... endwhile`
- `if-<type>` or `while-<type>`, the `type` can be:
  + 2 inputs: `eq ne lt le gt ge` + `A B`
  + 1 inputs: `isTrue isFalse` + `A`
- `loop N ... endloop`
- `break` / `continue`
- `label #name` / `goto #name`

## Timing (Blocking)
- `sleep-s a`, `sleep-ms a`, `sleep-us a`
- `sleep-min a`, `sleep-hour a`, `sleep-day a`, `sleep-week a`

## Input
- `input a`: Reads one character.
- `inputstr a` / `inputnum a` / `inputdecnum a`: Standard inputs.
- `hinputstr a hint` / `hinputnum a hint` / `hinputdecnum a hint`: Custom prompt inputs
