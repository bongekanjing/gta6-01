// Keyboard and mouse state, polled once per frame by the game loop.
export class Input {
  constructor(canvas) {
    this.keys = {};
    this.pressed = {}; // edge-triggered: true only on the frame the key went down
    this.mouseX = 0; this.mouseY = 0;
    this.mouseDown = false;
    this.mousePressed = false;
    this.canvas = canvas;
    this._onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!this.keys[e.key]) this.pressed[e.key] = true;
      this.keys[e.key] = true;
    };
    this._onKeyUp = (e) => { this.keys[e.key] = false; };
    this._onMouseMove = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    };
    this._onMouseDown = (e) => { if (e.button === 0) { this.mouseDown = true; this.mousePressed = true; } };
    this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; };
    this._onBlur = () => { this.keys = {}; this.mouseDown = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
  }

  down(...names) { return names.some((n) => !!this.keys[n]); }
  hit(...names) { return names.some((n) => !!this.pressed[n]); }

  // Call at the end of each frame so edge triggers last exactly one frame.
  endFrame() { this.pressed = {}; this.mousePressed = false; }
}
