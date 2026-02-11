declare module "astro:actions" {
	type Actions = typeof import("/home/fedora/.openclaw/workspace/apps/pediatra-checker/src/actions/index.ts")["server"];

	export const actions: Actions;
}