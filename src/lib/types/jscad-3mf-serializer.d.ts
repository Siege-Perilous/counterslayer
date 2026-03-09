declare module '@jscad/3mf-serializer' {
  import type { Geom3 } from '@jscad/modeling/src/geometries/types';

  interface SerializeOptions {
    unit?: 'millimeter' | 'inch' | 'feet' | 'meter' | 'micrometer';
    metadata?: boolean;
    defaultcolor?: [number, number, number, number];
    compress?: boolean;
  }

  function serialize(options: SerializeOptions, ...geometries: Geom3[]): ArrayBuffer[];

  export default { serialize };
}
