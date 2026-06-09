/**
 * Cron Expression Validator
 * Validates cron expressions and field values
 */

const CRON_FIELD_RE = /^[\d*/,-]+$/;

/**
 * Cron field ranges
 */
const FIELD_RANGES = [
  [0, 59],   // minute
  [0, 23],   // hour
  [1, 31],   // day of month
  [1, 12],   // month
  [0, 6],    // day of week (0=Sunday, 6=Saturday)
] as const;

/**
 * Validate a single cron field value against its allowed range
 */
function validateCronField(field: string, min: number, max: number): boolean {
  // Handle wildcard
  if (field === '*') return true;

  // Handle lists (comma-separated values)
  if (field.includes(',')) {
    return field.split(',').every(part => validateCronField(part.trim(), min, max));
  }

  // Handle ranges (e.g., 1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-');
    const startNum = parseInt(start, 10);
    const endNum = parseInt(end, 10);
    if (isNaN(startNum) || isNaN(endNum)) return false;
    return startNum >= min && startNum <= max && endNum >= min && endNum <= max && startNum <= endNum;
  }

  // Handle step values (e.g., */5 or 1-10/2)
  if (field.includes('/')) {
    const [base, step] = field.split('/');
    const stepNum = parseInt(step, 10);
    if (isNaN(stepNum) || stepNum <= 0) return false;
    if (base === '*') return true;
    return validateCronField(base, min, max);
  }

  // Handle single number
  const num = parseInt(field, 10);
  if (isNaN(num)) return false;
  return num >= min && num <= max;
}

/**
 * Validate a cron expression
 * Format: minute hour day-of-month month day-of-week
 */
export function validateCronExpr(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  // Check each part has valid characters
  if (!parts.every((p) => CRON_FIELD_RE.test(p))) return false;

  // Validate ranges for each field
  return parts.every((part, i) => {
    const [min, max] = FIELD_RANGES[i];
    return validateCronField(part, min, max);
  });
}

/**
 * Get field range for a given field index
 */
export function getFieldRange(fieldIndex: number): [number, number] {
  return FIELD_RANGES[fieldIndex] ?? [0, 59];
}

/**
 * Get field name by index
 */
export function getFieldName(fieldIndex: number): string {
  const names = ['minute', 'hour', 'day_of_month', 'month', 'day_of_week'];
  return names[fieldIndex] ?? 'unknown';
}

/**
 * Parse cron expression into parts
 */
export function parseCronExpr(expr: string): {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
} | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 || !validateCronExpr(expr)) {
    return null;
  }

  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

/**
 * Check if expression is valid
 */
export function isValidCron(expr: string): boolean {
  return validateCronExpr(expr);
}

/**
 * Describe what a cron expression means in human-readable terms
 */
export function describeCronExpr(expr: string): string {
  const parsed = parseCronExpr(expr);
  if (!parsed) return 'Invalid cron expression';

  const parts: string[] = [];

  // Minute
  if (parsed.minute === '*') parts.push('every minute');
  else if (parsed.minute.includes('/')) parts.push(`every ${parsed.minute.split('/')[1]} minutes`);
  else parts.push(`at minute ${parsed.minute}`);

  // Hour
  if (parsed.hour === '*') parts.push('every hour');
  else if (parsed.hour.includes('/')) parts.push(`every ${parsed.hour.split('/')[1]} hours`);
  else parts.push(`at hour ${parsed.hour}`);

  // Day of month
  if (parsed.dayOfMonth === '*') parts.push('every day');
  else if (parsed.dayOfMonth.includes('/')) parts.push(`every ${parsed.dayOfMonth.split('/')[1]} days of month`);
  else parts.push(`on day ${parsed.dayOfMonth} of month`);

  // Month
  if (parsed.month === '*') parts.push('every month');
  else parts.push(`in month ${parsed.month}`);

  // Day of week
  if (parsed.dayOfWeek === '*') parts.push('every day of week');
  else parts.push(`on day ${parsed.dayOfWeek} of week`);

  return parts.join(', ');
}
