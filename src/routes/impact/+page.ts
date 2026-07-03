// Always prerendered; the SUI_IMPACT flag gates the content and the nav link,
// not the route — an unlinked stub page is harmless and keeps adapter-static
// happy without conditional route generation.
export const prerender = true;
