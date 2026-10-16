export type MemberApplicationStatus =
  | 'visitor'
  | 'pending'
  | 'approved'
  | 'rejected';

/**
 * The customer profile the app renders — the global-customer identity
 * (`GET /auth/customer/me`) merged with the tenant-scoped member profile
 * (`GET /portal/members/me`) when a cafe is linked. Member fields are optional
 * because a customer with no joined cafe has identity only.
 */
export interface CustomerProfile {
  /** Global-customer id. */
  id: string;
  name: string | null;
  email: string;
  hasPassword?: boolean;
  /** Tenant-scoped member fields (present once a cafe is joined). */
  memberId?: string;
  memberCode?: string | null;
  phone?: string | null;
  applicationStatus?: MemberApplicationStatus;
}
