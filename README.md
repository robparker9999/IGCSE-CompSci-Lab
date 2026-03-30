# IGCSE Computer Science Lab

A comprehensive, web-based suite of interactive tools designed specifically for the **CIE IGCSE Computer Science (0478/0984)** curriculum. This lab provides students and educators with a professional-grade environment to experiment with logic gates, practice pseudocode, and design flowcharts using official syllabus notation.

## Live Demo
You can visit the website **[here!](https://robparker9999.github.io/IGCSE-CompSci-Lab/)**

## Features

### 1. Pseudocode IDE
A specialized code editor tailored to the Cambridge IGCSE pseudocode standard.
* **Execution Engine:** Run and "Step through" code to understand logic flow.
* **Trace Tables:** Built-in trace table functionality to track variable states during execution.
* **Algorithm Snippets:** Pre-loaded examples of common algorithms like Linear Search and Bubble Sort.
* **Syllabus Compliant:** Uses standard notation like `DECLARE`, `←`, and `OUTPUT`.

*there is a limitation with the IDE's power because there is no backend*

### 2. Logic Gate Simulator
A drag-and-drop workspace to build and test complex logic circuits.
* **Full Component Library:** Includes AND, OR, NOT, NAND, NOR, and XOR gates.
* **Live Truth Tables:** Automatically generates a truth table as you build the circuit.
* **Boolean Expressions:** Real-time generation of the logic expression for your circuit.
* **Interactive Inputs:** Toggle switches to see immediate signal propagation.

### 3. Flowchart & Structure Diagram Lab
A flexible canvas for creating algorithms visually.
* **Official Symbols:** Terminals, Processes, Input/Output, Decisions, and Subroutines.
* **Smart Connections:** Dynamic wires that snap to ports and support loop-backs.
* **Export Options:** Save your diagrams as a PNG for assignments.
* **Embedded Pseudocode:** Ability to attach pseudocode logic to specific modules.

## 📁 Project Structure (for main pages)

```text
.
├── css/
│   ├── flowcharts.css
│   ├── logic-gates.css
│   └── pseudocode.css
├── js/
│   ├── flowcharts.js
│   ├── logic-gates.js
│   └── pseudocode.js
├── flowcharts.html
├── index.html
├── logic-gates.html
└── pseudocode.html
```

## Technical Details

* **Pure Frontend:** Built with HTML5, CSS3, and Vanilla JavaScript. No heavy frameworks or backend required.
* **Responsive Design:** Uses a dark-themed, "IDE-style" UI inspired by modern developer tools.
* **Local Persistence:** Uses `localStorage` to save your work-in-progress circuits and code locally in your browser.

## Usage

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/IGCSE-CompSci-Lab.git
    ```
2.  **Run Locally:**
    Because the site uses `fetch()` to load documentation, it is recommended to run a local server:
    ```bash
    # If you have NodeJS installed
    npx serve .
    ```
3.  Open `http://localhost:3000` in your browser.

## License
This project is open-source and intended for educational purposes. Feel free to fork and adapt for your classroom or personal study. 

*I worked really hard on this and I hope it helps you!!*
