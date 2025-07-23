import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'modernGraphTool Docs',
  tagline: 'Docs for funky squiggly line tool',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://potatosalad775.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/modernGraphTool/docs/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'potatosalad775', // Usually your GitHub org/user name.
  projectName: 'modernGraphTool', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ko'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/potatosalad775/modernGraphTool/tree/main/docs/',
        },
        /*
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        */
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: '/img/mGT-social-card.jpg',
    navbar: {
      title: 'modernGraphTool',
      /*
      logo: {
        alt: 'My Site Logo',
        src: '/img/docusaurus.png',
      },
      */
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://potatosalad775.github.io/modernGraphTool',
          label: 'Demo',
          position: 'right',
        },
        {
          href: 'https://github.com/potatosalad775/modernGraphTool',
          label: 'GitHub',
          position: 'right',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        }
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Introduction',
              to: '/intro',
            },
            {
              label: 'Guide for Users',
              to: '/category/guide-for-users',
            },
            {
              label: 'Guide for Admins',
              to: '/category/guide-for-admins',
            },
            {
              label: 'Guide for Developers',
              to: '/category/guide-for-developers',
            },
          ],
        },
        {
          title: 'Useful Links',
          items: [
            {
              label: 'Theme Generator',
              href: '/theme-generator',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Demonstration Page',
              href: 'https://potatosalad775.github.io/modernGraphTool',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/potatosalad775/modernGraphTool',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} modernGraphTool Docs. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
