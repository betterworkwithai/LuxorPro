# Backup Log

This file tracks named backup snapshots of the LuxorPro codebase. Each entry
captures a git commit hash + tag so any past state can be restored with:

```bash
git checkout <tag-name>
# or
git diff <tag-name>..HEAD            # see what changed since
git restore --source=<tag-name> .    # roll specific files back
```

---

## 2026-05-06 · pre-cashflow-investment-split

**Tag:** `backup/2026-05-06-pre-cashflow-investment-split`
**Pre-change commit:** `7ee48e44b4bf5b1ec2913e0bac5c45a46b9e8df4`

State at the moment of this backup:
- Pluggy YTD imports working (page cap lifted)
- Server-side tombstones live (deleted Pluggy items never re-import)
- Investment performance tracking via priceHistory append-on-resync
- Asset-class normalization migration applied to all investments
- Settings restructured to tab-style nav (single section visible at a time)
- Support tickets table + UI live, admin management functional
- Duplicates section minimized by default in Fluxo de Caixa
- Convert-transaction-to-investment one-click in Cashflow rows
- 13 canonical asset classes enforced everywhere

To restore this exact state:

```bash
git checkout backup/2026-05-06-pre-cashflow-investment-split
```

---

## How to add a new backup

1. Commit your latest changes
2. Run:
   ```bash
   git tag backup/<YYYY-MM-DD>-<short-name>
   git push origin backup/<YYYY-MM-DD>-<short-name>
   ```
3. Append a new section to this file with the tag, commit hash, and a
   one-paragraph description of the state.
