class ARHUDCanvas {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.annotations = [];
    this.animFrameId = null;
    this.pulsePhase = 0;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  setAnnotations(annotations) {
    this.annotations = annotations || [];
    this.startAnimation();
  }

  clear() {
    this.annotations = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  startAnimation() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const loop = () => {
      this.render();
      this.pulsePhase += 0.05;
      if (this.annotations.length > 0) {
        this.animFrameId = requestAnimationFrame(loop);
      }
    };
    loop();
  }

  render() {
    this.resize();
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    if (!this.annotations || this.annotations.length === 0) return;

    this.annotations.forEach((item, index) => {
      const box = item.box;
      if (!box) return;

      // Convert 0..1000 scale to canvas coordinates (mirrored horizontally to match mirrored video)
      const bw = ((box.xmax - box.xmin) / 1000) * w;
      const x = w - (box.xmax / 1000) * w;
      const y = (box.ymin / 1000) * h;
      const bh = ((box.ymax - box.ymin) / 1000) * h;

      const color = box.color || '#00ffcc';
      const label = box.label || `Target ${index + 1}`;

      this.drawCornerBracketBox(x, y, bw, bh, color);
      this.drawHolographicLabel(x, y, label, color, item.description);
    });
  }

  drawCornerBracketBox(x, y, w, h, color) {
    const ctx = this.ctx;
    const cornerSize = Math.min(24, w * 0.2, h * 0.2);
    const pulseAlpha = 0.5 + 0.3 * Math.sin(this.pulsePhase);

    // Subtle background tint
    ctx.fillStyle = this.hexToRgba(color, 0.08);
    ctx.fillRect(x, y, w, h);

    // Dashed border
    ctx.strokeStyle = this.hexToRgba(color, 0.3);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Solid Neon Corner Brackets
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerSize, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + h - cornerSize);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerSize, y + h);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerSize);
    ctx.stroke();

    ctx.shadowBlur = 0; // Reset shadow
  }

  drawHolographicLabel(x, y, label, color, description) {
    const ctx = this.ctx;
    ctx.font = '700 15px "Orbitron", monospace';
    const textWidth = ctx.measureText(label).width;

    const padX = 14;
    const badgeH = 28;
    const badgeW = textWidth + padX * 2;
    const badgeY = Math.max(12, y - badgeH - 8);

    // Badge Background
    ctx.fillStyle = 'rgba(7, 10, 19, 0.95)';
    ctx.fillRect(x, badgeY, badgeW, badgeH);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, badgeY, badgeW, badgeH);

    // Label Text
    ctx.fillStyle = color;
    ctx.fillText(label, x + padX, badgeY + 19);

    // Small Anchor Dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 5, badgeY + badgeH, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }
}
