import { Hono, type Context } from "hono";
import { withAdmin, schema as base, eq, and, asc } from "agora/db";
import { createRateLimiter, clientIp } from "agora/server";
import { customerAuthMiddleware, type CustomerVars } from "agora/customer-auth";
import { chronoBranch } from "./schema";

/**
 * The "My Cafés" read for a signed-in GLOBAL customer — every tenant the
 * customer holds an active `tenantMember` in, each with that tenant's own
 * active `ChronoBranches`. A sibling of `stationMembershipStatusRoutes`
 * (`station/customer-portal-routes.ts`, mounted at `/portal/customer/venues`):
 * the web app merges the two by `tenantSlug`, and both read the same
 * membership-tenant spine (`loadMembershipTenants`) with the identical
 * isolation posture.
 *
 * Cross-tenant by construction — one global customer, many tenants in ONE
 * response — so every read goes through `withAdmin` with an EXPLICIT tenantId
 * filter, never `withTenant` (no single active tenant context exists for a
 * global-customer session) and never a bare scan of an RLS-forced table
 * (`withAdmin`'s admin connection bypasses RLS, so the explicit filter is the
 * only isolation on this path — same posture as `loadTenantVenueStatus`).
 * Every `tenantId` used to filter `ChronoBranches` comes from the caller's own
 * ACTIVE `tenantMember` rows (resolved server-side from
 * `c.var.customer.customerId`), never from client input — a customer with no
 * membership in a tenant can never have that tenant's `tenantId` reach the
 * branch query at all.
 */

const cafesLimiter = createRateLimiter(30, 60 * 1000, "portal-customer-cafes");

type CafeBranch = { branchId: string; branchCode: string; branchName: string };
type Cafe = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  branches: CafeBranch[];
};
type CafesResponse = { cafes: Cafe[] };

async function loadMembershipTenants(
  customerId: string,
): Promise<Array<{ tenantId: string; tenantSlug: string; tenantName: string }>> {
  return withAdmin((tx) =>
    tx
      .select({
        tenantId: base.organization.id,
        tenantSlug: base.organization.slug,
        tenantName: base.organization.name,
      })
      .from(base.tenantMember)
      .innerJoin(base.organization, eq(base.tenantMember.tenantId, base.organization.id))
      .where(
        and(eq(base.tenantMember.customerId, customerId), eq(base.tenantMember.status, "active")),
      ),
  );
}

async function loadTenantBranches(tenantId: string): Promise<CafeBranch[]> {
  const rows = await withAdmin((tx) =>
    tx
      .select({
        branchId: chronoBranch.id,
        branchCode: chronoBranch.code,
        branchName: chronoBranch.name,
      })
      .from(chronoBranch)
      .where(and(eq(chronoBranch.tenantId, tenantId), eq(chronoBranch.status, "active")))
      .orderBy(asc(chronoBranch.name)),
  );
  return rows;
}

export function customerCafesRoutes() {
  return new Hono().get(
    "/",
    customerAuthMiddleware(),
    async (c: Context<{ Variables: CustomerVars }>) => {
      const ip = clientIp(c) || "unknown";
      const retryAfter = await cafesLimiter.blockedFor(ip);
      if (retryAfter !== null) {
        return c.json({ error: "Too many requests." }, 429, { "Retry-After": String(retryAfter) });
      }
      await cafesLimiter.record(ip);

      const { customerId } = c.var.customer;
      const memberships = await loadMembershipTenants(customerId);
      const cafes: Cafe[] = await Promise.all(
        memberships.map(async ({ tenantId, tenantSlug, tenantName }) => ({
          tenantId,
          tenantSlug,
          tenantName,
          branches: await loadTenantBranches(tenantId),
        })),
      );
      const result: CafesResponse = { cafes };
      return c.json(result);
    },
  );
}
