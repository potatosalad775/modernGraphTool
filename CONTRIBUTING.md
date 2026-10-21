# Contributing to modernGraphTool

Contributions are always welcome, no matter how small or large! Thank you for your interest in
helping improve modernGraphTool.

**The contributor guide lives in the docs:
[Guide for Developers → Contributing][contributing].** Please read it before opening your first
pull request. It covers setup, the code style CI enforces, the Svelte 5 conventions, the shared
components, and the PR process.

The rest of the developer guide:

- [Overview][overview]: tech stack, project layout, build commands
- [Testing][testing]: the two Vitest projects, the coverage ratchet, CI
- [Build & Deployment Internals][build]: build outputs and how `defaults/` reaches them
- [Internationalization][i18n]: UI strings, plurals, and the translation tooling
- [Translating][translating]: translate in your browser with Fink, no code required

## Quick start

Node.js 22.17 or later:

```bash
git clone https://github.com/potatosalad775/modernGraphTool.git
cd modernGraphTool
npm install
npm run dev
```

Before opening a PR, run what CI runs:

```bash
npm run check && npm run lint && npm run test
```

The docs sources are in [docs/src/content/docs/](docs/src/content/docs/), so a fix to this guide is a PR
like any other.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

[contributing]: https://potatosalad775.github.io/modernGraphTool/docs/guide-for-developers/contributing/
[overview]: https://potatosalad775.github.io/modernGraphTool/docs/guide-for-developers/overview/
[testing]: https://potatosalad775.github.io/modernGraphTool/docs/guide-for-developers/testing/
[build]: https://potatosalad775.github.io/modernGraphTool/docs/guide-for-developers/build-and-deploy/
[i18n]: https://potatosalad775.github.io/modernGraphTool/docs/guide-for-developers/i18n/
[translating]: https://potatosalad775.github.io/modernGraphTool/docs/guide-for-developers/translating/
