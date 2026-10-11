/** Canonical public routes, shared by Vite and the production Node server. */
export const pageRoutes:Record<string,string>={'/':'index.html','/editor':'editor.html','/advanced':'advanced.html','/homes':'homes.html','/share':'share.html'};
export const pageRedirects:Record<string,string>={'/editor.html':'/editor','/courtyard.html':'/editor','/courtyard':'/editor','/advanced.html':'/advanced','/homes.html':'/homes','/share.html':'/share','/editor/':'/editor','/advanced/':'/advanced','/homes/':'/homes','/share/':'/share'};
