import companyRulesJson from '../config/company-rules.json' with { type: 'json' };

const NON_ALNUM_PATTERN = /[^a-z0-9]+/g;

export function normalizeCompanyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(NON_ALNUM_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createCompanyIdentityRules(rawRules = companyRulesJson) {
  return {
    aliases: new Map(Object.entries(rawRules.aliases || {}).map(([key, value]) => [normalizeCompanyKey(key), value])),
    googleInternalCanonical: new Set(rawRules.googleInternalCanonical || []),
    googleFamilyTokens: new Set((rawRules.googleFamilyTokens || []).map((value) => normalizeCompanyKey(value))),
  };
}

export const DEFAULT_COMPANY_IDENTITY_RULES = createCompanyIdentityRules();

export function getCompanyIdentity(company, rules = DEFAULT_COMPANY_IDENTITY_RULES) {
  const raw = String(company || '').trim();
  const normalized = normalizeCompanyKey(raw);
  const canonical = rules.aliases.get(normalized) || raw;
  const canonicalNormalized = normalizeCompanyKey(canonical);
  const tokens = canonicalNormalized ? canonicalNormalized.split(' ') : [];
  const isGoogleInternal = Boolean(canonical && (
    rules.googleInternalCanonical.has(canonical)
    || tokens.some((token) => rules.googleFamilyTokens.has(token))
  ));

  return {
    raw,
    normalized,
    canonical,
    canonicalNormalized,
    isGoogleInternal,
  };
}

export function canonicalCompanyName(company, rules = DEFAULT_COMPANY_IDENTITY_RULES) {
  return getCompanyIdentity(company, rules).canonical;
}

export function isGoogleInternalCompany(company, rules = DEFAULT_COMPANY_IDENTITY_RULES) {
  return getCompanyIdentity(company, rules).isGoogleInternal;
}

export function companyMatchesFilter(company, filterValue, rules = DEFAULT_COMPANY_IDENTITY_RULES) {
  const raw = String(company || '').trim();
  const filter = String(filterValue || '').trim();
  if (!filter) return true;

  const rawLower = raw.toLowerCase();
  const filterLower = filter.toLowerCase();
  if (rawLower.includes(filterLower)) return true;

  const companyIdentity = getCompanyIdentity(raw, rules);
  const filterIdentity = getCompanyIdentity(filter, rules);
  return Boolean(filterIdentity.canonical) && (
    companyIdentity.canonical === filterIdentity.canonical
    || companyIdentity.canonicalNormalized.includes(filterIdentity.canonicalNormalized)
  );
}
