# CERTIS AgRoute Database — BACKUP POINT

Backup: 2025-12-18_K11-GOLD_PRE-LAYOUT
Created: 2025-12-18 20:54:11

State:
- Filtering logic verified GOLD (Retailers = State ∩ Retailer ∩ Category ∩ Supplier)
- Corporate HQ filtered by State only
- Kingpins always visible overlay
- Routing stable with debounce + AbortController + route-key guard
- Layout/theme inconsistency still present
- Mobile not yet fixed

Restore Instructions:
1) Copy these files back over the main repo (same paths)
2) Run the standard FULL BUILD & DEPLOY block
