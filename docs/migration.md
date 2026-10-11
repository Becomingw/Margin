# Moving to Margin

Margin uses `.margin.json`, `.margin/`, `margin.local.json`, the `margin` CLI,
`MARGIN_*` environment variables, `X-Margin: 1` for scripted writes and a separate
desktop application ID and app-data directory. New exports use
`margin-review-package` / `margin-review` and `.marginreview` or `.zip`.

Existing `.paper-pal.json` / `.paper-pal/` and older `.draft-review.json` /
`.draft-review/` workspaces can still be opened. New names take precedence; existing
state is read in place rather than silently creating an empty parallel history.
To move to the new on-disk namespace, close both applications, back up the whole
workspace, then rename the configuration to `.margin.json` and the matching state
directory to `.margin`. Do not combine two state directories by hand.

Legacy v1 ZIP and `.ppreview` review packages remain importable, with IDs, anchors,
versions and events preserved. Export them from the old desktop app and import
into a new Margin workspace to migrate managed projects. Recent-project lists
and theme preferences are independent; they are not copied automatically.

Old `PAPER_PAL_*` and `DRAFT_REVIEW_HOST` environment variables do not configure
Margin. Rename machine settings to `MARGIN_*`. Legacy API provider configuration
does not enable AI execution. Credentials are not needed.

Margin's repository is https://github.com/Becomingw/Margin. Releases and support
belong to that repository. Git history is retained as provenance; the predecessor's
remote is detached.
