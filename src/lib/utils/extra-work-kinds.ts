/**
 * Allow-list of extra-work kinds the client can submit. Server validates
 * against this so a tampered request can't seed arbitrary `kind` strings
 * into the table — keeps the column shape clean for future reporting.
 *
 * Lives in a plain util module (not inside the "use server" actions file)
 * because Next/Turbopack only allows async exports from server-action
 * modules — a const array or type alias there crashes the route at
 * build/request time.
 */
export const EXTRA_WORK_KINDS = ["belanja"] as const;
export type ExtraWorkKind = (typeof EXTRA_WORK_KINDS)[number];
