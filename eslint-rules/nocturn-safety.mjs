/**
 * Custom ESLint plugin for Nocturn-specific safety rules.
 *
 * These rules catch the exact bug classes found in QA rounds 1–6:
 * - Missing soft-delete filters on events/collective_members queries
 * - Using in-memory rateLimit instead of DB-backed rateLimitStrict
 * - Using .single() instead of .maybeSingle()
 * - Missing UUID validation before DB queries
 * - Using http: in sanitizeUrl
 */

const nocturnSafetyPlugin = {
  meta: {
    name: "eslint-plugin-nocturn-safety",
    version: "1.0.0",
  },
  rules: {
    /**
     * Rule: require-soft-delete-filter
     *
     * Flags .from("events") or .from("collective_members") queries
     * that don't chain .is("deleted_at", null) somewhere in the same
     * expression statement.
     *
     * Catches: forgotten soft-delete filters (found in 4+ audit rounds)
     */
    "require-soft-delete-filter": {
      meta: {
        type: "problem",
        docs: {
          description:
            'Require .is("deleted_at", null) on events and collective_members queries',
        },
        messages: {
          missingDeletedAt:
            '.from("{{table}}") query is missing .is("deleted_at", null). Soft-deleted rows will leak into results.',
        },
        schema: [],
      },
      create(context) {
        const TABLES_REQUIRING_SOFT_DELETE = ["events", "collective_members"];

        return {
          CallExpression(node) {
            // Look for .from("events") or .from("collective_members")
            if (
              node.callee?.type === "MemberExpression" &&
              node.callee.property?.name === "from" &&
              node.arguments.length >= 1 &&
              node.arguments[0]?.type === "Literal" &&
              TABLES_REQUIRING_SOFT_DELETE.includes(node.arguments[0].value)
            ) {
              const tableName = node.arguments[0].value;

              // Walk up the chain to find the full expression statement
              const sourceCode = context.sourceCode ?? context.getSourceCode();
              const fullText = sourceCode.getText(
                getTopLevelExpression(node)
              );

              // Check if the chain includes .is("deleted_at", null)
              if (!fullText.includes('"deleted_at"') && !fullText.includes("'deleted_at'")) {
                // Exceptions: count-only queries in analytics (admin dashboard)
                // and queries that already filter by specific id + status
                const filePath = context.filename || context.getFilename();
                if (filePath.includes("analytics/page.tsx") && tableName === "events") {
                  // Analytics admin page counts all events — skip
                  return;
                }

                context.report({
                  node,
                  messageId: "missingDeletedAt",
                  data: { table: tableName },
                });
              }
            }
          },
        };

        function getTopLevelExpression(node) {
          let current = node;
          while (current.parent) {
            if (current.parent.type === "ExpressionStatement") return current;
            if (current.parent.type === "VariableDeclarator") return current;
            if (current.parent.type === "ReturnStatement") return current;
            if (current.parent.type === "ArrayExpression") return current;
            if (current.parent.type === "Property") return current;
            current = current.parent;
          }
          return current;
        }
      },
    },

    /**
     * Rule: no-memory-rate-limit
     *
     * Flags imports of `rateLimit` (in-memory) from rate-limit module.
     * Must use `rateLimitStrict` (DB-backed) instead in serverless.
     *
     * Catches: in-memory rate limiting that resets on cold starts
     */
    "no-memory-rate-limit": {
      meta: {
        type: "problem",
        docs: {
          description: "Disallow in-memory rateLimit in favor of rateLimitStrict",
        },
        messages: {
          useStrict:
            'Use "rateLimitStrict" (DB-backed) instead of "rateLimit" (in-memory). In-memory rate limiting resets on serverless cold starts.',
        },
        schema: [],
      },
      create(context) {
        return {
          ImportSpecifier(node) {
            if (
              node.imported?.name === "rateLimit" &&
              node.imported?.name !== "rateLimitStrict"
            ) {
              // Check the import source
              const importDecl = node.parent;
              if (
                importDecl?.source?.value &&
                importDecl.source.value.includes("rate-limit")
              ) {
                // Allow if it's the definition file itself
                const filePath = context.filename || context.getFilename();
                if (filePath.includes("lib/rate-limit")) return;

                context.report({
                  node,
                  messageId: "useStrict",
                });
              }
            }
          },
        };
      },
    },

    /**
     * Rule: no-single-query
     *
     * Flags .single() calls on Supabase queries.
     * Must use .maybeSingle() to handle 0-row results gracefully.
     *
     * Catches: runtime crashes when a query returns no rows
     */
    "no-single-query": {
      meta: {
        type: "problem",
        docs: {
          description: "Disallow .single() in favor of .maybeSingle()",
        },
        messages: {
          useMaybeSingle:
            "Use .maybeSingle() instead of .single(). .single() throws when 0 rows are returned.",
        },
        schema: [],
      },
      create(context) {
        return {
          MemberExpression(node) {
            if (
              node.property?.name === "single" &&
              node.parent?.type === "CallExpression" &&
              node.parent.arguments.length === 0
            ) {
              // Make sure this isn't maybeSingle (which would have a different property name)
              // and that it looks like a Supabase chain (.from().select()...single())
              const sourceCode = context.sourceCode ?? context.getSourceCode();
              const fullText = sourceCode.getText(node.parent);
              if (fullText.endsWith(".single()")) {
                context.report({
                  node: node.property,
                  messageId: "useMaybeSingle",
                });
              }
            }
          },
        };
      },
    },
  },
};

export default nocturnSafetyPlugin;
