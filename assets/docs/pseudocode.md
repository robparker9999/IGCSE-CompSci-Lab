

# Cambridge Pseudocode Syntax Guide

This guide covers the standard pseudocode structures used in Cambridge IGCSE (2210/0984) and AS & A Level (9618) Computer Science.

## 1. Program Basics

* **Keywords**: Must be in **UPPERCASE** (e.g., `IF`, `WHILE`, `OUTPUT`).
* **Identifiers**: Variable names should be descriptive and typically use PascalCase or camelCase.
* **Comments**: Use `//` for single-line comments.

```pseudocode
// This is a comment
OUTPUT "Hello World" // Inline comment
```

## 2. Data Types

| Type | Description | Example |
| :--- | :--- | :--- |
| `INTEGER` | Whole numbers | `15`, `-3` |
| `REAL` | Decimal numbers | `3.14`, `2.0` |
| `CHAR` | Single character | `'A'`, `'$'` |
| `STRING` | Text | `"Cambridge"` |
| `BOOLEAN` | Logical values | `TRUE`, `FALSE` |
| `DATE` | Calendar date | `12/05/2024` |

## 3. Declarations & Assignment

### Variables
Variables must be declared before use.

```pseudocode
DECLARE <identifier> : <data type>
DECLARE PlayerScore : INTEGER
DECLARE ItemPrice : REAL
```

### Constants
Constants are assigned a value at declaration that cannot change.

```pseudocode
CONSTANT <identifier> ← <value>
CONSTANT PI ← 3.14159
```

### Assignment
Use the left-pointing arrow (`←`) for assignment.

```pseudocode
Total ← 0
Name ← "Student"
IsRunning ← TRUE
```

## 4. Input and Output

* **INPUT**: Receives data from the user.
* **OUTPUT**: Displays data to the screen.

```pseudocode
OUTPUT "Please enter your name: "
INPUT UserName
OUTPUT "Welcome, ", UserName
```

## 5. Selection (Conditional)

### IF Statements

```pseudocode
IF <condition> THEN
    <statements>
ELSE
    <statements>
ENDIF
```

### CASE Statements
Used when a single variable has multiple potential values.

```pseudocode
CASE OF <identifier>
    <value 1> : <statement>
    <value 2> : <statement>
    OTHERWISE <statement>
ENDCASE
```

## 6. Iteration (Loops)

### FOR Loop (Count-controlled)

```pseudocode
FOR i ← 1 TO 10
    OUTPUT i
NEXT i
```
*Note: You can add `STEP <increment>` to change the count interval (e.g., `FOR i ← 1 TO 10 STEP 2`).*

### WHILE Loop (Pre-condition)
Checks condition **before** execution.

```pseudocode
WHILE <condition> DO
    <statements>
ENDWHILE
```

### REPEAT Loop (Post-condition)
Executes at least once, checks condition **after**.

```pseudocode
REPEAT
    <statements>
UNTIL <condition>
```

## 7. Arrays

Arrays are indexed starting from a defined lower bound (usually 1).

* **1D Array**: `DECLARE <id> : ARRAY[<low>:<high>] OF <type>`
* **2D Array**: `DECLARE <id> : ARRAY[<r1>:<r2>, <c1>:<c2>] OF <type>`

```pseudocode
DECLARE Names : ARRAY[1:30] OF STRING
Names[1] ← "Alice"

DECLARE Board : ARRAY[1:3, 1:3] OF CHAR
Board[1, 1] ← 'X'
```

## 8. Subroutines

### Procedures
Tasks that do not return a value.

```pseudocode
PROCEDURE <name>(<params>)
    <statements>
ENDPROCEDURE

CALL <name>(<args>)
```

### Functions
Tasks that **must** return a value.

```pseudocode
FUNCTION <name>(<params>) RETURNS <type>
    <statements>
    RETURN <value>
ENDFUNCTION

Result ← <name>(<args>)
```

## 9. Operations

* **Arithmetic**: `+`, `-`, `*`, `/`, `^` (power)
* **Integer Div**: `DIV` (quotient), `MOD` (remainder)
* **Comparison**: `=`, `<>`, `<`, `>`, `<=`, `>=`
* **Logical**: `AND`, `OR`, `NOT`