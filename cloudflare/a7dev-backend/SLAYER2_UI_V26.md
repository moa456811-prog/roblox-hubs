# Slayer 2 V26 — simpler navigation

Version: runtime-v26-simple-navigation-20260925
SHA-256: 16a7045e7f9fe608c6436c9d57b5d63c18dced46c3909d14ba23d6e1bdaeeb23

The interface opens on Home with 11 working destination cards. The sidebar is flat and scrollable, with larger labels and touch targets. Explicit destinations include Farm Settings, Loot & Sell, and Config & Tools. Red/black styling and English labels remain.

Global feature search filters existing sections across all tabs, displays per-tab section match counts, selects a matching destination, and provides a clear action and empty state. Searches are debounced. Matching uses literal text. Search recovery after no matches is tested.

Unmapped sections in hidden second columns now move to the visible first column, including sections created by feature installers. Existing native callbacks and control instances remain intact.

Verification:
- Luau runtime and complete payload compilation passed.
- Extracted production search tests: cross-tab routing, counts, empty-result recovery, clear, intentionally hidden sections, literal special characters.
- Extracted routing tests: mapped placement and unmapped hidden-column recovery.
- Protected base and all restored gameplay implementations (including Auto Sell and Anti AFK) are byte-identical to V25.
- No live Roblox visual or gameplay test was available; unrelated gameplay bugs are not claimed fixed.

Runtime: hubs/project-slayer-2/runtime_patch_v26.lua
Deployment uses staged Cloudflare source with compare-and-swap activation, previous-source backup, and mirrored Supabase database/emergency fallback. Loader and loadstrings unchanged.
