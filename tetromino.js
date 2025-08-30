class tetromino {
  #type;
  #orientation;
  #color;
  #row;
  #col;

  constructor(type) {
    if (!TetrisPieces[type]) {
      throw new Error("Invalid Tetris piece type.");
    }

    this.#type = type;
    this.#orientation = 0;
    this.#color = this.#getDefaultColor(type);
    this.#row = 0;
    this.#col = 3;
  }

  // --- Getters ---
  getType() {
    return this.#type;
  }

  getOrientation() {
    return this.#orientation;
  }

  getColor() {
    return this.#color;
  }

  getRow() {
    return this.#row;
  }

  getCol() {
    return this.#col;
  }

  getShape() {
    return TetrisPieces[this.#type][this.#orientation];
  }

  getCell(row, col) {
    return this.getShape()[row][col];
  }

  // --- Setters ---
  setOrientation(orientation) {
    this.#orientation = orientation % 4;
  }

  rotateClockwise() {
    this.#orientation = (this.#orientation + 1) % 4;
  }

  rotateCounterClockwise() {
    this.#orientation = (this.#orientation + 3) % 4;
  }

  setColor(color) {
    this.#color = color;
  }

  setRow(row) {
    this.#row = row;
  }

  setCol(col) {
    this.#col = col;
  }

  setType(type){
    this.#type=type;
  }

  setPosition(row, col) {
    this.#row = row;
    this.#col = col;
  }

  // --- Private helper ---
  #getDefaultColor(type) {
    const colors = {
      O: "#D4AF37",
      I: "#4FB0C6",
      T: "#9B59B6",
      L: "#2980B9",
      J: "#F39C12",
      S: "#E74C3C",
      Z: "#2ECC71"
    };
    return colors[type] || "gray";
  }
}
