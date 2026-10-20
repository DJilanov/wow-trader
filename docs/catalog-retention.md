# Catalog retention

The catalog store keeps one published build for each client product and locale. A non-published
import may temporarily coexist with that published build while it is reviewed, but importing a
second candidate replaces the older candidate. Publishing a candidate removes every previous build
in the same product and locale inside the publication transaction.

Catalog imports are serialized with a PostgreSQL transaction advisory lock scoped to the product and
locale. The snapshot key remains the idempotency key: importing the same snapshot again reuses its
existing build instead of inserting another copy. A partial unique index independently prevents more
than one published build for a product and locale.

Deleting a superseded build cascades through its item, spell, recipe, transformation, availability,
world, and community-reference version rows. Canonical item, spell, recipe, and profession identities
remain available because they are not build-scoped.

Migration `0019_premium_shard.sql` converts the remaining restrictive version foreign keys to
cascading deletes, removes pre-existing duplicate build history, and installs the uniqueness guard.
The migration prefers the latest published build when cleaning an existing database.

PostgreSQL normally reuses the released pages for later writes. Run `VACUUM FULL` only as an explicit
maintenance operation when space must be returned to the filesystem; it takes exclusive table locks
and is not part of normal catalog publication.

Before publication, the catalog guardian creates and verifies a full rollback dump. Once that dump
passes `pg_restore --list`, `scripts/prune-catalog-backups.mjs` removes older guardian-managed catalog
dumps and retains the new one. The cleanup accepts only the guardian's strict catalog-backup filename
format and ignores unrelated dumps, symbolic links, and the separately retained disaster-recovery
snapshot.
