modernGraphTool
===============

DEPLOYMENT
----------
Upload the entire contents of this folder to your web server via FTP.
Your visitors will see the tool at your domain (e.g. https://your-site.com/).

FILES YOU CAN EDIT
------------------
  config.js          — Main configuration: site title, phone database path,
                       default phones/targets, EQ settings, language, and more.
                       Edit this file to customize the tool for your site.

  theme.css          — Graph color variables (grid lines, axis labels, etc.).
                       Edit this to adjust the graph's visual appearance.

  data/phone_book.json   — Phone/headphone database entries.
  data/phones/           — Frequency response measurement files.
  data/target/           — Target curve files.
  assets/strings/        — UI text translations (en.json, ko.json).

FILES YOU SHOULD NOT EDIT
--------------------------
  index.html    — Auto-generated app entry point. Do not edit.
  _app/         — Auto-generated app files. Do not edit or delete.

UPDATING TO A NEW VERSION
--------------------------
When a new version of modernGraphTool is released:
1. Download the new release package.
2. Upload all files EXCEPT config.js, theme.css, data/, and assets/strings/
   (keep your customized versions of those files).
3. Or upload everything and re-apply your changes to config.js and theme.css.
