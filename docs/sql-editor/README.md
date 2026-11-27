# Scripts to paste into the Supabase SQL Editor

The repository's migrations are the source of truth. These files exist because
the live project (`gsogrvpstliezlurjsvf`) is **ahead of and behind** `main` in
different places, and nobody should be pasting migrations in from memory.

Everything here is either copied verbatim from `supabase/migrations/` or is
read-only. Nothing was retyped.

## Run them in this order

Two sets. The numbered parts bring the project up to `0010`; the lettered
files take it from `0011` to `0016`. Finish the first set before starting the
second.

| File | What it does | Changes data? |
| --- | --- | --- |
| `part1-preflight.sql` | reports which migrations are already applied | no |
| `part2-realtime.sql` | adds `messages` to the realtime publication — fixes [#20](https://github.com/YadavMatch/My-rebuild/issues/20) | publication only |
| `part3-migrations.sql` | migrations `0009` and `0010`, verbatim | yes |
| `part4-cleanup.sql` | hides the placeholder profiles — part 2 of [#13](https://github.com/YadavMatch/My-rebuild/issues/13) | yes, reversible |
| `part5-optional-stray-table.sql` | inspects the stray `public."SQL Editor"` table | no — the drop is commented out |
| | | |
| `A-preflight-0011-0016.sql` | what is applied, **and how many rows the irreversible steps touch** | no |
| `B-apply-0011-to-0015.sql` | migrations `0011`–`0015`, verbatim | yes, one step irreversible |
| `C-apply-0016.sql` | migration `0016`, verbatim | yes, irreversible |
| `D-postcheck.sql` | eight PASS/FAIL checks, plus radius adoption | no |

Then run `supabase/tests/verify_on_supabase.sql` for all 27 checks.

**Read file A's output before running B and C.** Two steps cannot be undone:
`0011` rounds every stored location to a ~1 km grid, and `0016` nulls the
fabricated `1900-01-01` dates of birth and hides anyone who was in the deck on
one. File A counts the rows each will touch, before you decide. `C` is
separate from `B` for that reason — it is the one that changes what members
see.

Every file is safe to run twice. The second paste is a no-op, not an error.

## Two things about the SQL Editor itself

**It shows the result of the last statement only.** So every read-only file
here is written as a *single* statement, with a `section` column, and reports
everything in one grid. If you split one up, you will silently lose all but
the final block.

`part4-cleanup.sql` is the exception: an `UPDATE` followed by a `SELECT` that
confirms it. That is deliberate — folding them into one statement would make
the `SELECT` read the pre-update snapshot and report the old number. So the
editor shows you the confirming count, and the update's row count goes by.

**An error aborts the whole script.** Which is why `part5` reaches the stray
table's row count through a lateral over `pg_class` rather than selecting from
it directly: if that table has already been dropped, part5 says so in a row
instead of failing and taking the rest of the output with it.

## How these were tested

Against a throwaway PostgreSQL 16 cluster with **real PostGIS**, on a
database built to `0001`–`0008` and then seeded with the live project's actual
state — a placeholder profile, `1900-01-01` sentinels on every row, and
precise un-coarsened coordinates. Pasted in order, then pasted again.

Observed on the second run, 27 November 2026:

- file A: all eight rows `NOT applied`, impact counts 2 locations / 3
  sentinels / 2 profiles about to be hidden
- after B and C: all eight `applied`, and A's impact counts fall to 0
- file D: 8 of 8 `PASS`, both passes
- `verify_on_supabase.sql`: **27 of 27 PASS**
- every file re-ran cleanly, with `ON_ERROR_STOP=1` throughout

What that does **not** cover: the live project is not this database. The
counts you see in file A will be your own, and they are the ones that matter.
