declare module "gifenc" {
  export function GIFEncoder(options: { width: number; height: number }): {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      options: { palette: any; delay: number; first?: boolean }
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  };
  export function quantize(
    pixels: Uint8Array,
    numColors: number,
    options: { format: string }
  ): any;
  export function applyPalette(
    pixels: Uint8Array,
    palette: any,
    format: string
  ): Uint8Array;
}
