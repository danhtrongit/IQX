import { InternalServerErrorException } from '@nestjs/common';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/** Convert an integral PostgreSQL numeric only when JSON can represent it exactly. */
export function exactInteger(value: string | number | bigint, field: string): number {
  const integer = typeof value === 'bigint' ? value : BigInt(value);
  if (integer > MAX_SAFE || integer < MIN_SAFE) {
    throw new InternalServerErrorException({
      code: 'INTEGER_OUT_OF_RANGE',
      message: `Không thể biểu diễn chính xác ${field} trong hợp đồng API`,
    });
  }
  return Number(integer);
}

export function nullableExactInteger(
  value: string | number | bigint | null,
  field: string,
): number | null {
  return value === null ? null : exactInteger(value, field);
}

/** Compute a display percentage without ever converting either money operand to float. */
export function exactRatioPercent(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  const scale = 1_000_000n;
  const scaled = (numerator * 100n * scale) / denominator;
  return Number(scaled) / Number(scale);
}
