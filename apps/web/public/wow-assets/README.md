# WoW visual asset sources

These files are presentation assets only; catalog IDs and game facts never depend on them.

- `games/forever-logo.jpg` is the official Blizzard announcement header from
  `bnetcmsus-a.akamaihd.net/cms/blog_header/p9/P9HCAU7X9HSV1789250934116.png`, linked by the
  official “Carve a New Path with World of Warcraft: Forever” article.
- `games/tbc-logo.png` is the Burning Crusade logo mirrored by SteamGridDB at
  `cdn2.steamgriddb.com/logo/d3edd466842655ec6dc7ac0590baf52d.png`.
- `classes/*.jpg`, `professions/*.jpg`, and `tools/*.jpg` are 56 px in-game icons served by
  Wowhead's `wow.zamimg.com/images/wow/icons/large/` CDN.

The local copies avoid runtime dependencies on third-party image hosts. Replace the TBC mirror with
an organization-provided Blizzard press-kit file if one becomes available; the component path is
stable.
