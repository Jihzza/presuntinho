"""Fix {$t(...)} inside HTML string attribute values.

Svelte 4+ actually DOES support {$t(...)} inside quoted attributes — it's
parsed as a single expression. The braces are NOT a problem. But for clarity
and consistency with the rest of the codebase, we can leave them as-is.

This script is a no-op marker. The build passed (npm run check, npm run build),
so these {$t(...)} inside attribute values are syntactically correct.
"""
print("This script is intentionally a no-op.")
print("Build and check pass — {$t(...)} inside quoted attributes is valid Svelte.")
