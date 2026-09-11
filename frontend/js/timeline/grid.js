/**
 * Musical Beat Grid Canvas Renderer
 */

import { TimelineCoordinate } from "./coordinate.js";

export class TimelineGrid {
  static drawGrid(ctx, width, height, zoom, bpm = 120.0, timeSigNum = 4) {
    const secondsPerBeat = 60.0 / bpm;
    const secondsPerBar = secondsPerBeat * timeSigNum;
    const barWidthPx = secondsPerBar * zoom;

    const totalBars = Math.ceil(width / barWidthPx) + 1;

    // 1. Draw sub-beat lines if zoomed in enough
    if (barWidthPx > 80) {
      ctx.strokeStyle = "rgba(48, 54, 61, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let bar = 0; bar < totalBars; bar++) {
        const barX = bar * barWidthPx;
        for (let b = 1; b < timeSigNum; b++) {
          const beatX = barX + (b / timeSigNum) * barWidthPx;
          ctx.moveTo(beatX + 0.5, 0);
          ctx.lineTo(beatX + 0.5, height);
        }
      }
      ctx.stroke();
    }

    // 2. Draw major bar lines
    ctx.strokeStyle = "rgba(88, 166, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let bar = 0; bar < totalBars; bar++) {
      const barX = bar * barWidthPx;
      ctx.moveTo(barX + 0.5, 0);
      ctx.lineTo(barX + 0.5, height);
    }
    ctx.stroke();
  }
}
