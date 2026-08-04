// Replaces the commented-out CDN_MODE stub in defaults/config.js when
// scripts/build-site-template.js assembles the GitHub Pages template.
//
// Everything else in the template's config.js is defaults/config.js verbatim,
// so new options reach the template automatically. Only this block differs:
// the template is a CDN deployment, so CDN_MODE has to be live rather than a
// stub, and BASE_PATH needs the GitHub Pages explanation.
//
// Indentation is tabs, matching config.js. Keep the closing `},` — the script
// splices this in as a whole property. Everything from the first tab-indented
// line onward is what lands in the generated file.
	// How this site loads the application. Required — index.html is a thin
	// loader, not the app itself. → docs: CDN_MODE
	CDN_MODE: {
		// BASE_PATH — the subdirectory your site is served from, no trailing slash.
		//
		// Leave this commented out on GitHub Pages. index.html works it out from
		// the URL, so both layouts below are handled without an edit here:
		//
		//   username.github.io/my-repo/  →  '/my-repo'  (repo named anything)
		//   username.github.io/          →  ''          (repo named username.github.io)
		//
		// Uncomment it only when the auto-detect can't see the truth — a custom
		// domain serving the site from a subfolder, for example:
		// BASE_PATH: '/headphones',
		//
		// Getting this wrong loads the home page fine but 404s every share link.
		// → docs: deployment/github-pages#base-path

		// BASE: 'https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn',

		MAJOR_VERSION: 2 // Auto-updates within this major version. Bump to move majors.
	},
