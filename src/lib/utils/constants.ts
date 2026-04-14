export const BUSINESS_UNITS = [
  "Haengbocake",
  "Yeobo Space",
  "Yeobo Booth",
  "Gritamora",
] as const;

export type BusinessUnit = (typeof BUSINESS_UNITS)[number];

export const BUSINESS_UNIT_ROLES: Record<BusinessUnit, readonly string[]> = {
  Haengbocake: ["Admin", "Baker", "Cake Artist"],
  "Yeobo Space": ["Admin", "Editor", "Content Creator", "Manager"],
  "Yeobo Booth": ["Admin", "Graphic Designer", "Freelance"],
  Gritamora: ["Admin", "Storage"],
};

export const GENDERS = ["Female", "Male"] as const;

export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
