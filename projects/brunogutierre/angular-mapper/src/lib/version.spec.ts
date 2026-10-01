import { VERSION } from './version';
import packageJson from '../../package.json';

describe('VERSION', () => {
  it('matches the version declared in package.json', () => {
    expect(VERSION.full).toBe(packageJson.version);
  });

  it('exposes major, minor and patch parts', () => {
    const [major, minor, patch] = packageJson.version.split('.');
    expect(VERSION.major).toBe(major);
    expect(VERSION.minor).toBe(minor);
    expect(VERSION.patch).toBe(patch);
  });
});
