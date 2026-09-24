import { InternalServerErrorException } from '@nestjs/common';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
export function integer(value: string | number | bigint, field: string): number {
  const parsed = typeof value === 'bigint' ? value : BigInt(value);
  if (parsed > MAX_SAFE || parsed < -MAX_SAFE) {
    throw new InternalServerErrorException({
      code: 'INTEGER_OUT_OF_RANGE',
      message: `Không thể biểu diễn chính xác ${field} trong hợp đồng API`,
    });
  }
  return Number(parsed);
}
