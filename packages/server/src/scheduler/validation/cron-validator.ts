/**
 * Cron Expression Validator
 * Handles validation of cron expressions and fields
 */

const CRON_FIELD_RE = /^[\d*/,-]+$/;

export interface CronFieldRanges {
  minute: [number, number];  // 0-59
  hour: [number, number];    // 0-23
  dayOfMonth: [number, number];  // 1-31
  month: [number, number];  // 1-12
  dayOfWeek: [number, number];  // 0-6
}

/**
 * Cron Validator handles cron expression validation
 * This is extracted from scheduler/cron.ts
 */
export class CronValidator {
  private readonly fieldRanges: CronFieldRanges = {
    minute: [0, 59],
    hour: [0, 23],
    dayOfMonth: [1, 31],
    month: [1, 12],
    dayOfWeek: [0, 6]
  };

  /**
   * Validate a single cron field value
   */
  validateField(field: string, min: number, max: number): boolean {
    // Handle wildcard
    if (field === "*") return true;

    // Handle lists (comma-separated values)
    if (field.includes(",")) {
      return field.split(",").every(part => this.validateField(part.trim(), min, max));
    }

    // Handle ranges (e.g., 1-5)
    if (field.includes("-")) {
      const [start, end] = field.split("-");
      const startNum = parseInt(start, 10);
      const endNum = parseInt(end, 10);
      if (isNaN(startNum) || isNaN(endNum)) return false;
      return startNum >= min && startNum <= max && endNum >= min && endNum <= max && startNum <= endNum;
    }

    // Handle step values (e.g., */5 or 1-10/2)
    if (field.includes("/")) {
      const [base, step] = field.split("/");
      const stepNum = parseInt(step, 10);
      if (isNaN(stepNum) || stepNum <= 0) return false;
      if (base === "*") return true;
      return this.validateField(base, min, max);
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
  validateExpression(expr: string): { valid: boolean; error?: string } {
    const parts = expr.trim().split(/\s+/);

    if (parts.length !== 5) {
      return { valid: false, error: `Cron expression must have 5 fields, got ${parts.length}` };
    }

    // Check each part has valid characters
    if (!parts.every((p) => CRON_FIELD_RE.test(p))) {
      return { valid: false, error: "Cron expression contains invalid characters" };
    }

    // Validate each field
    const ranges = [
      this.fieldRanges.minute,
      this.fieldRanges.hour,
      this.fieldRanges.dayOfMonth,
      this.fieldRanges.month,
      this.fieldRanges.dayOfWeek
    ];

    for (let i = 0; i < parts.length; i++) {
      const [min, max] = ranges[i];
      if (!this.validateField(parts[i], min, max)) {
        const fieldNames = ['minute', 'hour', 'day of month', 'month', 'day of week'];
        return {
          valid: false,
          error: `Invalid ${fieldNames[i]} field: "${parts[i]}" (valid range: ${min}-${max})`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check if expression is valid (returns boolean)
   */
  isValid(expr: string): boolean {
    return this.validateExpression(expr).valid;
  }

  /**
   * Parse cron expression into field values
   */
  parseExpression(expr: string): {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
  } | null {
    const validation = this.validateExpression(expr);
    if (!validation.valid) return null;

    const parts = expr.trim().split(/\s+/);
    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4]
    };
  }

  /**
   * Get next run time for a cron expression (simplified)
   */
  getNextRunTime(expr: string, from: Date = new Date()): Date | null {
    const validation = this.validateExpression(expr);
    if (!validation.valid) return null;

    // This is a simplified implementation
    // For production, use a library like 'cron-parser'
    const parsed = this.parseExpression(expr);
    if (!parsed) return null;

    // Simple heuristic: if expression runs every minute, return next minute
    if (parsed.minute === '*' && parsed.hour === '*') {
      const next = new Date(from);
      next.setMinutes(next.getMinutes() + 1);
      next.setSeconds(0);
      return next;
    }

    // If hourly at specific minute
    if (parsed.minute !== '*' && parsed.hour === '*') {
      const next = new Date(from);
      const targetMinute = parseInt(parsed.minute);
      if (next.getMinutes() < targetMinute) {
        next.setMinutes(targetMinute);
      } else {
        next.setHours(next.getHours() + 1);
        next.setMinutes(targetMinute);
      }
      next.setSeconds(0);
      return next;
    }

    // For more complex schedules, return a placeholder
    return new Date(from.getTime() + 60000); // 1 minute from now
  }

  /**
   * Get human-readable description of cron schedule
   */
  describeSchedule(expr: string): string | null {
    const parsed = this.parseExpression(expr);
    if (!parsed) return null;

    const parts: string[] = [];

    if (parsed.minute === '*' && parsed.hour === '*') {
      return "Every minute";
    }

    if (parsed.hour !== '*' && parsed.minute === '*') {
      return `Every minute at hour ${parsed.hour}`;
    }

    if (parsed.hour === '*' && parsed.minute !== '*') {
      return `Hourly at minute ${parsed.minute}`;
    }

    if (parsed.hour !== '*' && parsed.minute !== '*') {
      return `Daily at ${parsed.hour}:${parsed.minute.padStart(2, '0')}`;
    }

    return `Custom schedule: ${expr}`;
  }
}

/**
 * Validate cron expression (standalone function for backward compatibility)
 */
export function validateCronExpr(expr: string): boolean {
  const validator = new CronValidator();
  return validator.isValid(expr);
}
