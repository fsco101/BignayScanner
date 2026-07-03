// Philippine Location Data
// Uses phil-reg-prov-mun-brgy package for complete PH geographic data
// Region -> Province -> City/Municipality -> Barangay cascading structure

import {
  regions,
  provinces,
  city_mun,
  barangays,
  getProvincesByRegion,
  getCityMunByProvince,
  getBarangayByMun,
  sort,
} from 'phil-reg-prov-mun-brgy';

export const COUNTRY_CODES = [
  { code: '+63', country: 'Philippines', flag: '\u{1F1F5}\u{1F1ED}', maxLength: 10 },
  { code: '+1', country: 'United States', flag: '\u{1F1FA}\u{1F1F8}', maxLength: 10 },
  { code: '+44', country: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}', maxLength: 10 },
  { code: '+81', country: 'Japan', flag: '\u{1F1EF}\u{1F1F5}', maxLength: 10 },
  { code: '+82', country: 'South Korea', flag: '\u{1F1F0}\u{1F1F7}', maxLength: 10 },
  { code: '+65', country: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}', maxLength: 8 },
  { code: '+61', country: 'Australia', flag: '\u{1F1E6}\u{1F1FA}', maxLength: 9 },
  { code: '+971', country: 'UAE', flag: '\u{1F1E6}\u{1F1EA}', maxLength: 9 },
  { code: '+966', country: 'Saudi Arabia', flag: '\u{1F1F8}\u{1F1E6}', maxLength: 9 },
  { code: '+852', country: 'Hong Kong', flag: '\u{1F1ED}\u{1F1F0}', maxLength: 8 },
];

/**
 * Convert ALL CAPS name to Title Case
 * e.g., "ILOCOS NORTE" -> "Ilocos Norte"
 */
const toTitleCase = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-/(])\w/g, (match) => match.toUpperCase());
};

/**
 * Get all regions sorted alphabetically
 * Returns: [{ name: "Region I (Ilocos Region)", reg_code: "01" }, ...]
 */
export const getRegions = () => {
  return sort(regions).map((r) => ({
    name: toTitleCase(r.name),
    reg_code: r.reg_code,
  }));
};

/**
 * Get provinces for a given region code
 * Returns: [{ name: "Ilocos Norte", prov_code: "0128", reg_code: "01" }, ...]
 */
export const getProvinces = (regCode) => {
  if (!regCode) {
    // Return ALL provinces sorted if no region specified (backward compat)
    return sort(provinces).map((p) => toTitleCase(p.name));
  }
  return sort(getProvincesByRegion(regCode)).map((p) => ({
    name: toTitleCase(p.name),
    prov_code: p.prov_code,
    reg_code: p.reg_code,
  }));
};

/**
 * Get cities/municipalities for a given province code
 * Returns: [{ name: "Adams", mun_code: "012801", prov_code: "0128" }, ...]
 */
export const getCities = (provCode) => {
  if (!provCode) return [];
  return sort(getCityMunByProvince(provCode)).map((c) => ({
    name: toTitleCase(c.name),
    mun_code: c.mun_code,
    prov_code: c.prov_code,
  }));
};

/**
 * Get barangays for a given city/municipality code
 * Returns: [{ name: "Adams (Pob.)", mun_code: "012801" }, ...]
 */
export const getBarangays = (munCode) => {
  if (!munCode) return [];
  return sort(getBarangayByMun(munCode)).map((b) => ({
    name: toTitleCase(b.name),
    mun_code: b.mun_code,
  }));
};

/**
 * Lookup helpers - find codes from display names
 */
export const findRegionByName = (name) => {
  if (!name) return null;
  const lower = name.toLowerCase();
  return regions.find((r) => r.name.toLowerCase() === lower || toTitleCase(r.name).toLowerCase() === lower);
};

export const findProvinceByName = (name, regCode) => {
  if (!name) return null;
  const lower = name.toLowerCase();
  const list = regCode ? getProvincesByRegion(regCode) : provinces;
  return list.find((p) => p.name.toLowerCase() === lower || toTitleCase(p.name).toLowerCase() === lower);
};

export const findCityByName = (name, provCode) => {
  if (!name) return null;
  const lower = name.toLowerCase();
  const list = provCode ? getCityMunByProvince(provCode) : city_mun;
  return list.find((c) => c.name.toLowerCase() === lower || toTitleCase(c.name).toLowerCase() === lower);
};

export const findBarangayByName = (name, munCode) => {
  if (!name) return null;
  const lower = name.toLowerCase();
  const list = munCode ? getBarangayByMun(munCode) : barangays;
  return list.find((b) => b.name.toLowerCase() === lower || toTitleCase(b.name).toLowerCase() === lower);
};

/**
 * Compose a full address from structured parts
 */
export const composeFullAddress = (parts) => {
  const { houseNumber, street, barangay, city, province, region, postalCode } = parts;
  const addressParts = [
    houseNumber,
    street,
    barangay ? `Brgy. ${barangay}` : null,
    city,
    province,
    region,
    postalCode,
  ].filter(Boolean);
  return addressParts.join(', ');
};

/**
 * Validate Philippine phone number (without country code)
 */
export const validatePhoneNumber = (phone, countryCode = '+63') => {
  if (!phone) return { valid: false, error: 'Phone number is required' };

  const cleaned = phone.replace(/[\s\-()]/g, '');

  if (countryCode === '+63') {
    // PH: 09XXXXXXXXX (11 digits) or 9XXXXXXXXX (10 digits)
    if (/^0?9\d{9}$/.test(cleaned)) {
      return { valid: true, formatted: cleaned.startsWith('0') ? cleaned : `0${cleaned}` };
    }
    return { valid: false, error: 'Enter a valid PH number (e.g., 09171234567)' };
  }

  // Generic validation for other countries
  if (cleaned.length < 7 || cleaned.length > 15) {
    return { valid: false, error: 'Enter a valid phone number' };
  }
  return { valid: true, formatted: cleaned };
};

export default {
  COUNTRY_CODES,
  getRegions,
  getProvinces,
  getCities,
  getBarangays,
  findRegionByName,
  findProvinceByName,
  findCityByName,
  findBarangayByName,
  composeFullAddress,
  validatePhoneNumber,
};
