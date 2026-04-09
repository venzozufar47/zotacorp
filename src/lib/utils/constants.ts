export const DEPARTMENTS = [
  "Engineering",
  "Product",
  "Design",
  "Marketing",
  "Operations",
  "HR",
  "Finance",
  "Sales",
] as const;

export type Department = (typeof DEPARTMENTS)[number];
