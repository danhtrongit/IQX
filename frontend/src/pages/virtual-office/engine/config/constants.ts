/** Office footprint in grid cells (1 cell = 1 metre). Grid x → world X, grid y → world Z. */
export const GRID_W = 30;
export const GRID_H = 21;
export const WALL_H = 3.2;

/** Logical HUD size; the Phaser canvas is rendered at DPR for crisp text. */
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const DPR = Math.min(2, window.devicePixelRatio || 1);
