import { describe, expect, it } from 'vitest';
import {
  courseListQuerySchema,
  courseUpdateSchema,
} from '../../src/modules/learning/learning.schemas.js';

describe('learning query schemas', () => {
  it('parses explicit query booleans without treating "false" as truthy', () => {
    expect(courseListQuerySchema.parse({ is_premium: 'false', is_published: '0' })).toMatchObject({
      is_premium: false,
      is_published: false,
    });
    expect(courseListQuerySchema.parse({ is_premium: 'true', is_published: '1' })).toMatchObject({
      is_premium: true,
      is_published: true,
    });
  });

  it('rejects ambiguous boolean query values', () => {
    expect(courseListQuerySchema.safeParse({ is_premium: 'yes' }).success).toBe(false);
    expect(courseListQuerySchema.safeParse({ is_published: '' }).success).toBe(false);
  });

  it('does not apply create defaults to partial course updates', () => {
    expect(courseUpdateSchema.parse({ is_premium: false })).toEqual({ is_premium: false });
  });
});
