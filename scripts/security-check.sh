#!/bin/bash
# ============================================================================
# Nocturn Security Pre-Deploy Checklist
# Run before every deploy: npm run security-check
#
# Catches the exact bug classes from QA Audit Rounds 1-6.
# Exit code 1 = failures found, deploy should be blocked.
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILURES=0
WARNINGS=0

fail() {
  echo -e "${RED}FAIL${NC}: $1"
  FAILURES=$((FAILURES + 1))
}

warn() {
  echo -e "${YELLOW}WARN${NC}: $1"
  WARNINGS=$((WARNINGS + 1))
}

pass() {
  echo -e "${GREEN}PASS${NC}: $1"
}

echo "============================================"
echo "  Nocturn Security Pre-Deploy Check"
echo "============================================"
echo ""

# ── 1. No in-memory rateLimit in API routes ──
echo "--- Rate Limiting ---"
MEMORY_RL=$(grep -rn "import.*{ rateLimit }" src/app/api/ --include="*.ts" 2>/dev/null | grep -v rateLimitStrict | grep -v node_modules || true)
if [ -n "$MEMORY_RL" ]; then
  fail "In-memory rateLimit found in API routes (use rateLimitStrict):"
  echo "$MEMORY_RL"
else
  pass "All API routes use DB-backed rateLimitStrict"
fi

# ── 2. No http: in sanitizeUrl ──
echo ""
echo "--- URL Sanitization ---"
HTTP_ALLOW=$(grep -rn 'protocol === "http:"' src/lib/email/ --include="*.ts" 2>/dev/null || true)
if [ -n "$HTTP_ALLOW" ]; then
  fail "http: protocol allowed in email sanitizeUrl (only https: and mailto: should be allowed):"
  echo "$HTTP_ALLOW"
else
  pass "Email templates only allow https: and mailto:"
fi

# ── 3. No NODE_ENV-only guards on seed routes ──
echo ""
echo "--- Seed Route Protection ---"
NODE_ENV_GUARD=$(grep -rn 'NODE_ENV.*production.*ALLOW_SEED' src/app/api/seed* --include="*.ts" 2>/dev/null || true)
if [ -n "$NODE_ENV_GUARD" ]; then
  fail "Seed routes use NODE_ENV guard (should use ALLOW_SEED only):"
  echo "$NODE_ENV_GUARD"
else
  pass "Seed routes use ALLOW_SEED-only guard"
fi

# ── 4. collective_members queries include deleted_at filter ──
echo ""
echo "--- Soft-Delete Filters ---"
# Find .from("collective_members") lines that don't have deleted_at within 5 lines
CM_QUERIES=$(grep -rn 'from("collective_members")' src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v ".test." || true)
CM_MISSING=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  FILE=$(echo "$line" | cut -d: -f1)
  LINENUM=$(echo "$line" | cut -d: -f2)
  # Check next 10 lines for deleted_at
  CONTEXT=$(sed -n "${LINENUM},$((LINENUM + 10))p" "$FILE" 2>/dev/null)
  if ! echo "$CONTEXT" | grep -q "deleted_at"; then
    warn "collective_members query at $FILE:$LINENUM may be missing deleted_at filter"
    CM_MISSING=$((CM_MISSING + 1))
  fi
done <<< "$CM_QUERIES"
if [ "$CM_MISSING" -eq 0 ]; then
  pass "All collective_members queries include deleted_at filter"
fi

# ── 5. events queries include deleted_at filter (in dashboard pages) ──
EV_QUERIES=$(grep -rn 'from("events")' src/app/\(dashboard\)/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules || true)
EV_MISSING=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  FILE=$(echo "$line" | cut -d: -f1)
  LINENUM=$(echo "$line" | cut -d: -f2)
  CONTEXT=$(sed -n "${LINENUM},$((LINENUM + 10))p" "$FILE" 2>/dev/null)
  if ! echo "$CONTEXT" | grep -q "deleted_at"; then
    warn "events query at $FILE:$LINENUM may be missing deleted_at filter"
    EV_MISSING=$((EV_MISSING + 1))
  fi
done <<< "$EV_QUERIES"
if [ "$EV_MISSING" -eq 0 ]; then
  pass "All dashboard events queries include deleted_at filter"
fi

# ── 6. No .single() calls (should be .maybeSingle()) ──
echo ""
echo "--- Query Safety ---"
SINGLE_CALLS=$(grep -rn '\.single()' src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v maybeSingle | grep -v node_modules | grep -v ".test." || true)
if [ -n "$SINGLE_CALLS" ]; then
  warn ".single() found (use .maybeSingle() to handle 0 rows):"
  echo "$SINGLE_CALLS"
else
  pass "No unsafe .single() calls found"
fi

# ── 7. No secrets in client-side code ──
echo ""
echo "--- Secret Exposure ---"
# Only flag client components ("use client" files) that reference server secrets.
# Server components can safely import these — they're never sent to the browser.
CLIENT_SECRET_FILES=""
for f in $(grep -rl "SUPABASE_SERVICE_ROLE_KEY\|STRIPE_SECRET_KEY\|STRIPE_WEBHOOK_SECRET\|RESEND_API_KEY\|CRON_SECRET\|OPENAI_API_KEY\|ANTHROPIC_API_KEY" src/app/\(auth\)/ src/app/\(public\)/ src/app/\(dashboard\)/ src/components/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v node_modules); do
  # Check if this is a client component
  if head -5 "$f" | grep -q '"use client"'; then
    CLIENT_SECRET_FILES="$CLIENT_SECRET_FILES\n$(grep -n "SUPABASE_SERVICE_ROLE_KEY\|STRIPE_SECRET_KEY" "$f")"
  fi
done
CLIENT_SECRETS=$(echo -e "$CLIENT_SECRET_FILES" | grep -v "^$" || true)
if [ -n "$CLIENT_SECRETS" ]; then
  fail "Server secrets referenced in client-side code:"
  echo "$CLIENT_SECRETS"
else
  pass "No server secrets in client-side code"
fi

# ── 8. UUID validation before DB queries in API routes ──
echo ""
echo "--- Input Validation ---"
API_ROUTES_WITHOUT_UUID=$(grep -rL "uuidRegex\|uuid.*test\|UUID.*valid" src/app/api/checkout/ src/app/api/create-payment-intent/ 2>/dev/null | grep -v node_modules || true)
if [ -n "$API_ROUTES_WITHOUT_UUID" ]; then
  warn "API routes potentially missing UUID validation:"
  echo "$API_ROUTES_WITHOUT_UUID"
else
  pass "Payment API routes include UUID validation"
fi

# ── Summary ──
echo ""
echo "============================================"
echo "  Results: ${FAILURES} failures, ${WARNINGS} warnings"
echo "============================================"

if [ "$FAILURES" -gt 0 ]; then
  echo -e "${RED}BLOCKED: Fix ${FAILURES} failure(s) before deploying.${NC}"
  exit 1
fi

if [ "$WARNINGS" -gt 0 ]; then
  echo -e "${YELLOW}CAUTION: ${WARNINGS} warning(s) should be reviewed.${NC}"
fi

echo -e "${GREEN}Security check passed.${NC}"
exit 0
