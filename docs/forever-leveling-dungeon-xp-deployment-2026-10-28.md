# Dungeon quest XP deployment — October 28, 2026

Status: deployed and publicly verified at 06:08 UTC.
Source commit: `0760377750323dfa75ba356a60bc7531dab837f1`.
Release: `kfc-helper-dungeon-xp-20261028-0760377`.
Next build: `Vvqv4yH5Z2GJeFE_bQopY`.

The release copies the preceding live `kfc-helper-guide-login-20261025-r1` source and applies
only the 17 files in the pushed dungeon XP commit. Every overlaid file matches its committed
SHA-256, and the pre-build source comparison found exactly those 17 changes. Unrelated pending
simulator work and other changes already committed to main were excluded from this rollout.
The preceding live source, its login correction and its static delivery remain available.

## Live behavior

Fresh unidentified bundles now use quest levels 40/45/53 for Drowned City, Krol'dok and Alcaz.
Their estimated four-quest totals are 44,600/55,600/75,000 XP per character. Alcaz displays
18,750 estimated XP per quest. Previously saved custom levels and skipped slots remain intact;
an existing level-50 Alcaz override still calculates 16,850 per quest until changed to 53.

Later scaled page rewards retain their captured coefficients. The public browser confirms
Mythology 8,900, Agmond's Fate 5,000 and Solution to Doom 6,150, with their original coefficients.
Neither planning changes nor navigation modify the party's recorded actual XP.

The [source audit](forever-leveling-dungeon-xp-audit-2026-10-28.md) still distinguishes estimates
from measured rewards. The ten historical source disagreements and three unidentified bundles
remain pending evidence; deployment does not resolve them or certify an in-game playthrough.

## Verification

- Isolated Linux candidate: 574 leveling tests, 202 focused web tests and four audit regressions
  passed, together with leveling build/types/lint, scoped web/script lint, strict web TypeScript
  and the optimized Next build.
- Real production guide inputs compile both route modes: 43 dungeon-first and 47 mixed chapters,
  with zero missing numeric forecast endpoints before the measured finishing circuit. Both native
  exports compile, without creating or publishing a review ZIP. Reference builds remain 70205;
  the public item catalog remains 70532.
- Candidate and public Chromium each passed 18 checks at 1440, 390 and 320 pixels. Checks cover
  all three default bundles, custom-level and skipped-slot persistence, unchanged actual XP,
  captured coefficients and both bundle panels on the reported Alcaz chapter. No page errors,
  failed assets or horizontal page overflow were observed. Screenshots were reviewed.
- Public asset verification passed nine pages and 87 unique assets, including both website homes,
  the tools landing page, Alcaz, Warrior/Smite, and the previously reported recipe images.
- Candidate and public simulator verification passed all 11 published profiles and checked their
  selected releases, libraries, databases and private-proof denial. No optimization or combat
  benchmark was run for this leveling deployment.
- Static verification checked 59,250 files and 3,210 compressed variants. Public activation also
  checked gzip/identity lengths, decoded checksums, conditional caching, MIME and private paths.
- Guide session/provider endpoints remain healthy; general downloads and payments remain disabled.

## Activation and operational correction

The first activation attempt rolled the static pointer back before changing the web pointer or
restarting web. Its public compressed-asset check caught a Nginx permission denial: the private
operation's inherited `umask 077` created the new public directories as 0700 and newly generated
compressed files as 0600.

Only that unactivated generated public tree was corrected. Directories became 0755; unreadable
compressed inodes became 0644 only after verifying that all their hard links belonged to this tree.
Byte checksums remained identical, and no source inode shared outside the tree was changed.
Readability was checked as `www-data`; the private web environment remained unreadable to it.
The original failed attempt and corrected retry receipts are preserved. Future public staging
must run with `umask 022` and verify worker readability before activation.

The successful retry activated at `2026-10-28T06:06:12.495Z` and restarted only `kfc-helper-web`.
All other managed-process PIDs remained unchanged. Frozen simulator selection SHA-256 remained
`5e626e26a40117b3a28819f6e67451dc55e83a56841a23ac58efcea5b7be94cd`.
No migration, crawler run, publication-index change, Docker operation or unrelated cleanup occurred.
The owned loopback preview and SSH tunnel were stopped after checks. About 7.07 GiB remained free.

Protected server receipts:
`/home/wow-trader-system/shared/operations/dungeon-xp-20261028-0760377/`.
Local browser evidence:
`artifacts/dungeon-xp-release-20261028/candidate-browser-v3/` and
`artifacts/dungeon-xp-release-20261028/public-browser/`.

Test the [Alcaz chapter](https://kfcguild.online/tools/forever/leveling/routes/alliance-human/chapters/premade-dungeon-alcaz?plan=premade).
