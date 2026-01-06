declare module '@jscad/stl-serializer' {
	import type { Geom3 } from '@jscad/modeling/src/geometries/types';

	interface SerializeOptions {
		binary?: boolean;
	}

	function serialize(options: SerializeOptions, ...geometries: Geom3[]): ArrayBuffer[];

	export default { serialize };
}
