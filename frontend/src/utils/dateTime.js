export const formatPhilippineDateTime = (dateValue) => {
  if (!dateValue) return 'N/A';

  try {
    const rawValue = String(dateValue);
    const hasTimezone = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(rawValue);
    const normalized = hasTimezone ? rawValue : `${rawValue}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch (error) {
    return 'N/A';
  }
};

/**
 * Calculate relative time ago string.
 * Uses raw UTC comparison (timezone-independent) to avoid double-conversion bugs.
 */
export const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  // Normalize: treat timezone-less strings as UTC (same as formatPhilippineDateTime)
  const rawValue = String(dateStr);
  const hasTimezone = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(rawValue);
  const normalized = hasTimezone ? rawValue : `${rawValue}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';

  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return 'Just now';

  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatPhilippineDateTime(dateStr);
};
