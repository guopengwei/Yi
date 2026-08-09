# Self-hosted Noto CJK webfonts

These font assets are served by Yi from `/assets/fonts/`. The application does not request fonts from Google Fonts, Fontsource, or another third-party CDN at runtime.

## Families

- `Noto Sans HK Variable` and `Noto Serif HK Variable` for `zh-HK` and the default locale
- `Noto Sans SC Variable` and `Noto Serif SC Variable` for `zh-CN`
- Each Chinese family also includes locally hosted Latin glyphs for mixed-language text

The Hong Kong variants preserve the glyph forms expected by Yi's primary audience. The Simplified Chinese variants are selected through `:lang(zh-CN)` so the two Chinese locales do not share regionally incorrect glyph forms.

## Provenance and license

The webfont packages were vendored from Fontsource `5.3.0`. The package version is part of every asset directory name so the one-year immutable cache can be safely replaced by a future versioned path. Each family directory contains the package metadata and its full SIL Open Font License 1.1 text. The original font project is [Noto CJK](https://github.com/notofonts/noto-cjk), and the webfont packaging project is [Fontsource](https://fontsource.org/).

The `wght.css` files retain Fontsource's Unicode-range splits and `font-display: swap`. Browsers therefore request only the locally hosted WOFF2 fragments required by the text on the current page.
