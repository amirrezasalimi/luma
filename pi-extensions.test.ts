import { describe, expect, test } from 'bun:test';
import {
  createPiCatalogCache,
  detectCategories,
  installSource,
  parsePiCatalog,
  parseQueryPatterns,
  parseRelativeUpdatedAge,
} from './src/server/services/pi-extensions';

const fixture = `# Awesome Pi
## Extensions
| Name | Description | Popularity | Updated |
|------|-------------|----------:|--------:|
| [test](https://www.npmjs.com/package/@test/extension) | A useful extension with mcp adapter and memory compression | 100/mo | today |
| [repo](https://github.com/test/extension) | Claude model provider and dynamic subagent workflow | 12 | yesterday |
| [manual](https://github.com/test/mono/tree/main/plugin) | Manual setup linter and web search tool | 1 | 3d ago |
## Themes
| [theme](https://www.npmjs.com/package/theme) | Theme | 100 | today |
`;
describe('Pi extension catalog', () => {
  test('indexes only extensions and keeps unsupported links manual', () => {
    const rows = parsePiCatalog(fixture);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.source).toBe('npm:@test/extension');
    expect(rows[1]!.source).toBe('git:github.com/test/extension');
    expect(rows[2]!.source).toBeNull();
  });
  test('categorizes rows by name and description patterns', () => {
    const rows = parsePiCatalog(fixture);
    expect(rows[0]!.tags).toContain('mcp');
    expect(rows[0]!.tags).toContain('memory');
    expect(rows[1]!.tags).toContain('providers');
    expect(rows[1]!.tags).toContain('agents');
    expect(rows[2]!.tags).toContain('tools');
    expect(rows[2]!.tags).toContain('web');
  });
  test('parses search query pattern tokens and text', () => {
    expect(parseQueryPatterns('claude tag:providers source:npm is:installed')).toEqual({
      text: 'claude',
      category: 'providers',
      source: 'npm',
      installedOnly: true,
    });
    expect(parseQueryPatterns('category:mcp')).toEqual({
      text: '',
      category: 'mcp',
      source: undefined,
      installedOnly: undefined,
    });
  });
  test('parses relative updated strings for sorting', () => {
    expect(parseRelativeUpdatedAge('today')).toBe(0);
    expect(parseRelativeUpdatedAge('yesterday')).toBe(1);
    expect(parseRelativeUpdatedAge('5d ago')).toBe(5);
    expect(parseRelativeUpdatedAge('~2mo ago')).toBe(60);
    expect(parseRelativeUpdatedAge('1y ago')).toBe(365);
    expect(parseRelativeUpdatedAge('unknown')).toBe(999999);
  });
  test('rejects command injection and noncanonical sources', () => {
    for (const value of ['https://npmjs.com/package/test;rm', 'https://npmjs.com/package/test?x=y', 'https://evil.test/package/test', 'https://github.com/test/repo/tree/main', 'http://github.com/test/repo']) expect(installSource(value)).toBeNull();
  });
  test('deduplicates catalog rows', () => {
    expect(parsePiCatalog(fixture.replace('## Themes', '| [test](https://www.npmjs.com/package/@test/extension) | Duplicate | 0 | today |\n## Themes'))).toHaveLength(3);
  });
  test('deduplicates concurrent loads and caches for exactly one hour', async () => {
    let calls = 0, now = 0;
    const load = createPiCatalogCache(async () => { calls++; return fixture; }, () => now);
    await Promise.all([load(), load(), load()]);
    expect(calls).toBe(1);
    now = 3_599_999;
    await load();
    expect(calls).toBe(1);
    now = 3_600_000;
    await load();
    expect(calls).toBe(2);
  });
  test('does not cache failures or empty catalogs', async () => {
    let calls = 0;
    const load = createPiCatalogCache(async () => ++calls === 1 ? 'invalid' : fixture);
    await expect(load()).rejects.toThrow('format changed');
    expect(await load()).toHaveLength(3);
    expect(calls).toBe(2);
  });
});
