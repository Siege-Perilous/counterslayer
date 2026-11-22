/**
 * Reserved space - a plain block that stands in for game parts that are not printed
 * (boards, rulebooks, card boxes). It takes part in a section's layout and height like a
 * tray, but has no printable geometry and is never exported.
 */

export interface ReservedSpaceParams {
  width: number; // X dimension (mm)
  depth: number; // Y dimension (mm)
  height: number; // Z dimension (mm)
}

export const defaultReservedSpaceParams: ReservedSpaceParams = {
  width: 100,
  depth: 100,
  height: 20
};

export function getReservedSpaceDimensions(params: ReservedSpaceParams): {
  width: number;
  depth: number;
  height: number;
} {
  return {
    width: Math.max(1, params.width),
    depth: Math.max(1, params.depth),
    height: Math.max(1, params.height)
  };
}
