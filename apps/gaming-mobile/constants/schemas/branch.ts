/**
 * A branch of a joined cafe, as returned by gaming-api
 * `GET /portal/customer/cafes` (each cafe carries its active branches).
 */
export interface BranchSummary {
  branchId: string;
  branchCode: string;
  branchName: string;
}

/**
 * A joined tenant ("cafe") with its branches — one entry of the
 * `GET /portal/customer/cafes` response.
 */
export interface CafeSummary {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  branches: BranchSummary[];
}
