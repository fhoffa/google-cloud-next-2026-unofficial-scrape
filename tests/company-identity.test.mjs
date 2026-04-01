import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalCompanyName, companyMatchesFilter, getCompanyIdentity, isGoogleInternalCompany } from '../lib/company-identity.mjs';

test('company identity normalizes obvious Google-family aliases conservatively', () => {
  assert.equal(canonicalCompanyName('Google Deepmind'), 'Google DeepMind');
  assert.equal(canonicalCompanyName('DeepMind'), 'Google DeepMind');
  assert.equal(canonicalCompanyName('Google LLC'), 'Google');
  assert.equal(canonicalCompanyName('YouTube'), 'YouTube');
  assert.equal(canonicalCompanyName('Anthropic'), 'Anthropic');
});

test('company identity marks Google-family labels as internal', () => {
  assert.equal(isGoogleInternalCompany('Google Public Sector'), true);
  assert.equal(isGoogleInternalCompany('Google DeepMind and Google Research'), true);
  assert.equal(isGoogleInternalCompany('Mandiant/Google'), true);
  assert.equal(isGoogleInternalCompany('YouTube'), true);
  assert.equal(isGoogleInternalCompany('Anthropic'), false);
});

test('company filter matching respects canonical aliases without breaking substring matches', () => {
  assert.equal(companyMatchesFilter('Google Deepmind', 'Google DeepMind'), true);
  assert.equal(companyMatchesFilter('Google Public Sector', 'google'), true);
  assert.equal(companyMatchesFilter('Anthropic', 'thro'), true);
  assert.equal(companyMatchesFilter('Anthropic', 'Google'), false);
});

test('company identity exposes canonical metadata for downstream rollups', () => {
  assert.deepEqual(getCompanyIdentity('Google LLC'), {
    raw: 'Google LLC',
    normalized: 'google llc',
    canonical: 'Google',
    canonicalNormalized: 'google',
    isGoogleInternal: true,
  });
});
