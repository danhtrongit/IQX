import { UnprocessableEntityException } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';

import type { InstrumentSearchQuery } from '../../modules/market/instruments/index.js';

type LegacyValidationIssue = {
  type: string;
  loc: ['query', string];
  msg: string;
  input: unknown;
  ctx?: { ge?: number; le?: number };
};

function scalar(value: unknown): unknown {
  // Starlette's QueryParams returns the last value for a repeated key.
  return Array.isArray(value) ? value.at(-1) : value;
}

function intValue(
  field: 'page' | 'page_size',
  raw: unknown,
  issues: LegacyValidationIssue[],
): number | undefined {
  const value = scalar(raw);
  const validNumber =
    typeof value === 'number' && Number.isInteger(value)
      ? value
      : typeof value === 'string' && /^[+-]?\d+(?:\.0+)?$/.test(value.trim())
        ? Number(value)
        : undefined;

  if (validNumber === undefined || !Number.isSafeInteger(validNumber)) {
    issues.push({
      type: 'int_parsing',
      loc: ['query', field],
      msg: 'Input should be a valid integer, unable to parse string as an integer',
      input: value,
    });
    return undefined;
  }

  if (validNumber < 1) {
    issues.push({
      type: 'greater_than_equal',
      loc: ['query', field],
      msg: 'Input should be greater than or equal to 1',
      input: value,
      ctx: { ge: 1 },
    });
    return undefined;
  }

  if (field === 'page_size' && validNumber > 100) {
    issues.push({
      type: 'less_than_equal',
      loc: ['query', field],
      msg: 'Input should be less than or equal to 100',
      input: value,
      ctx: { le: 100 },
    });
    return undefined;
  }

  return validNumber;
}

function boolValue(raw: unknown, issues: LegacyValidationIssue[]): boolean | undefined {
  const value = scalar(raw);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (['0', 'f', 'false', 'n', 'no', 'off'].includes(normalized)) return false;
    if (['1', 't', 'true', 'y', 'yes', 'on'].includes(normalized)) return true;
  }

  issues.push({
    type: 'bool_parsing',
    loc: ['query', 'include_indices'],
    msg: 'Input should be a valid boolean, unable to interpret input',
    input: value,
  });
  return undefined;
}

/** Reproduce FastAPI/Pydantic's legacy query coercion and validation envelope. */
export class LegacyInstrumentQueryPipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata): InstrumentSearchQuery {
    const query = (value ?? {}) as Record<string, unknown>;
    const issues: LegacyValidationIssue[] = [];
    const includeIndices = boolValue(query.include_indices ?? false, issues);
    const page = intValue('page', query.page ?? 1, issues);
    const pageSize = intValue('page_size', query.page_size ?? 20, issues);

    if (issues.length > 0) {
      throw new UnprocessableEntityException({ detail: issues });
    }

    return {
      q: typeof scalar(query.q) === 'string' ? (scalar(query.q) as string) : undefined,
      exchange:
        typeof scalar(query.exchange) === 'string' ? (scalar(query.exchange) as string) : undefined,
      asset_type:
        typeof scalar(query.asset_type) === 'string'
          ? (scalar(query.asset_type) as string)
          : undefined,
      include_indices: includeIndices ?? false,
      page: page ?? 1,
      page_size: pageSize ?? 20,
    };
  }
}
