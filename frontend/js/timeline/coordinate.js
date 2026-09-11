/**
 * Timeline Coordinate System — Conversion between Seconds, Pixels, and Musical Beats.
 */

export class TimelineCoordinate {
  /**
   * Convert seconds to horizontal pixel offset.
   * @param {number} seconds
   * @param {number} zoomLevel - Pixels per second
   * @returns {number}
   */
  static timeToPixel(seconds, zoomLevel = 80) {
    return Math.max(0, seconds * zoomLevel);
  }

  /**
   * Convert horizontal pixel offset to seconds.
   * @param {number} px
   * @param {number} zoomLevel - Pixels per second
   * @returns {number}
   */
  static pixelToTime(px, zoomLevel = 80) {
    return Math.max(0, px / zoomLevel);
  }

  /**
   * Convert seconds to musical beats.
   * @param {number} seconds
   * @param {number} bpm
   * @returns {number}
   */
  static timeToBeats(seconds, bpm = 120.0) {
    const beatsPerSecond = bpm / 60.0;
    return seconds * beatsPerSecond;
  }

  /**
   * Convert musical beats to seconds.
   * @param {number} beats
   * @param {number} bpm
   * @returns {number}
   */
  static beatsToTime(beats, bpm = 120.0) {
    const secondsPerBeat = 60.0 / bpm;
    return beats * secondsPerBeat;
  }

  /**
   * Quantize / Snap a time in seconds to the nearest grid division.
   * @param {number} seconds
   * @param {number} bpm
   * @param {string} snapMode - 'bar', '1/2', '1/4', '1/8', '1/16', '1/32', 'free'
   * @param {number} timeSigNumerator - e.g. 4 for 4/4
   * @returns {number}
   */
  static snapTimeToGrid(seconds, bpm = 120.0, snapMode = "1/4", timeSigNumerator = 4) {
    if (snapMode === "free") return seconds;

    const secondsPerBeat = 60.0 / bpm;
    let stepInBeats = 1.0;

    switch (snapMode) {
      case "bar":
        stepInBeats = timeSigNumerator;
        break;
      case "1/2":
        stepInBeats = 0.5;
        break;
      case "1/4":
        stepInBeats = 0.25;
        break;
      case "1/8":
        stepInBeats = 0.125;
        break;
      case "1/16":
        stepInBeats = 0.0625;
        break;
      case "1/32":
        stepInBeats = 0.03125;
        break;
      default:
        stepInBeats = 0.25;
    }

    const stepSeconds = stepInBeats * secondsPerBeat;
    const snapped = Math.round(seconds / stepSeconds) * stepSeconds;
    return Math.max(0, snapped);
  }
}
