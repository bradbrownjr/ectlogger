import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './redirectPath';

describe('safeRedirectPath', () => {
  it('keeps a path inside the app', () => {
    expect(safeRedirectPath('/subscribe/12')).toBe('/subscribe/12');
    expect(safeRedirectPath('/nets/5?check_in=1')).toBe('/nets/5?check_in=1');
  });

  it('drops anything that could leave the site', () => {
    for (const value of ['https://evil.example/', '//evil.example/', '/\\evil.example', 'subscribe/12', '', null, undefined]) {
      expect(safeRedirectPath(value)).toBeNull();
    }
  });
});
