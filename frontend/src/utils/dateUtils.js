/**
 * Date formatting and calculation utilities for Self-Study SaaS
 * Standardizes all date presentation to DD/MM/YYYY
 */

/**
 * Format a Date object, YYYY-MM-DD string, or ISO string to DD/MM/YYYY
 * @param {string | Date | null | undefined} dateInput
 * @returns {string} Formatted date as DD/MM/YYYY or 'N/A' / '-'
 */
export function formatDateDDMMYYYY(dateInput) {
  if (!dateInput) return '-';

  try {
    if (typeof dateInput === 'string') {
      const cleanStr = dateInput.trim();
      // If already in YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss format
      if (/^\d{4}-\d{2}-\d{2}/.test(cleanStr)) {
        const [y, m, d] = cleanStr.substring(0, 10).split('-');
        return `${d}/${m}/${y}`;
      }
      // If already in DD/MM/YYYY format
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleanStr)) {
        return cleanStr;
      }
      const parsed = new Date(cleanStr);
      if (!isNaN(parsed.getTime())) {
        const day = String(parsed.getDate()).padStart(2, '0');
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const year = parsed.getFullYear();
        return `${day}/${month}/${year}`;
      }
      return cleanStr;
    }

    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
      const day = String(dateInput.getDate()).padStart(2, '0');
      const month = String(dateInput.getMonth() + 1).padStart(2, '0');
      const year = dateInput.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch {
    return String(dateInput);
  }

  return '-';
}

/**
 * Format a Date object to YYYY-MM-DD (standard for <input type="date"> and backend APIs)
 */
export function formatDate(d) {
  if (!d) return '';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return '';
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayStr() {
  return formatDate(new Date());
}

/**
 * Add days to a YYYY-MM-DD string
 */
export function addDaysToDate(dateStr, days) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + days);
  return formatDate(dateObj);
}

/**
 * Add calendar months to a YYYY-MM-DD string (defaults to end of interval: n months minus 1 day)
 */
export function addMonthsToDate(dateStr, months) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1 + months, d);
  dateObj.setDate(dateObj.getDate() - 1);
  return formatDate(dateObj);
}

/**
 * Calculate total inclusive duration in days between two YYYY-MM-DD strings
 */
export function calculateDurationDays(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  const diffTime = e.getTime() - s.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Formats a date range into DD/MM/YYYY → DD/MM/YYYY
 */
export function formatDateRange(startStr, endStr) {
  if (!startStr && !endStr) return '-';
  if (!endStr) return `From ${formatDateDDMMYYYY(startStr)}`;
  if (!startStr) return `Until ${formatDateDDMMYYYY(endStr)}`;
  return `${formatDateDDMMYYYY(startStr)} → ${formatDateDDMMYYYY(endStr)}`;
}
