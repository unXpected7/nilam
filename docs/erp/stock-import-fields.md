# Nilam ERP stock import CSV v1

Required columns: `sku`, `quantity`, `warehouse`, `effective_at`, `source_reference`, `reason`.

Optional columns: `batch`, `expiry_date`. Batch and expiry values are retained for future approved batch tracking and are not applied to inventory yet.

`quantity` is an absolute non-negative on-hand count. One source reference must identify one import submission. CSV values that begin with `=`, `+`, `-`, or `@` are rejected when parsing is implemented, preventing spreadsheet formula injection.
