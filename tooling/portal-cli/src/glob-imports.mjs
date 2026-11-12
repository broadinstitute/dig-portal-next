import path from 'node:path';
import ts from 'typescript';
import picomatch from 'picomatch';

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

function literalPatterns(node) {
  node = unwrap(node);
  if (node && ts.isStringLiteralLike(node)) return [node.text];
  if (node && ts.isArrayLiteralExpression(node)) return node.elements.flatMap(literalPatterns);
  throw new Error('patterns must be literal strings or arrays of literal strings');
}

function literalOptions(node) {
  const options = { base: '', exhaustive: false, caseSensitive: true };
  if (!node) return options;
  node = unwrap(node);
  if (!ts.isObjectLiteralExpression(node)) throw new Error('options must be a literal object');
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) throw new Error('spread, computed or shorthand options require manual review');
    const key = property.name.text;
    if (!Object.hasOwn(options, key)) continue;
    const value = unwrap(property.initializer);
    if (key === 'base' && ts.isStringLiteralLike(value)) options.base = value.text;
    else if (key !== 'base' && (value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword)) options[key] = value.kind === ts.SyntaxKind.TrueKeyword;
    else throw new Error(`${key} must be literal`);
  }
  return options;
}

/** Inspect macros without evaluating source, constants, options or imported modules. */
export function scriptGlobs(contents, filename, language) {
  const kind = language === 'tsx' ? ts.ScriptKind.TSX : language === 'jsx' ? ts.ScriptKind.JSX
    : language === 'ts' ? ts.ScriptKind.TS : language === 'js' ? ts.ScriptKind.JS : ts.getScriptKindFromFileName(filename);
  const source = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true, kind);
  if (source.parseDiagnostics.length) return { globs: [], errors: ['cannot be parsed for glob dependency validation'] };
  const globs = [], errors = [];
  function visit(node) {
    const expression = ts.isCallExpression(node) ? unwrap(node.expression) : null;
    if (expression && ts.isPropertyAccessExpression(expression) && expression.name.text === 'glob'
      && ts.isMetaProperty(expression.expression) && expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword && expression.expression.name.text === 'meta') {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      try {
        globs.push({ patterns: literalPatterns(node.arguments[0]), ...literalOptions(node.arguments[1]), line });
      } catch (error) {
        errors.push(`cannot analyze import.meta.glob at line ${line}: ${error.message}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { globs, errors };
}

/** Match only known application-owned files; never expand globs outside the workspace. */
export function applicationGlobMatches(glob, root, source, files) {
  const directory = path.dirname(path.resolve(root, source)).split(path.sep).join('/');
  if (glob.base.startsWith('/') || path.win32.isAbsolute(glob.base)) throw new Error('base must be relative; app-root configuration requires manual review');
  const base = glob.base ? path.posix.join(directory, glob.base) : directory;
  const positive = [], negative = [];
  for (let pattern of glob.patterns) {
    const excluded = pattern.startsWith('!');
    if (excluded) pattern = pattern.slice(1);
    if (!pattern.startsWith('./') && !pattern.startsWith('../')) throw new Error('patterns must be relative; app-root and configured aliases require manual review');
    // The base is a literal directory, not part of the caller's glob syntax.
    const escapedBase = base.replace(/[()[\]{}*?+!|]/g, '\\$&');
    const matcher = picomatch(path.posix.join(escapedBase, pattern), { dot: glob.exhaustive, nocase: !glob.caseSensitive, windows: false });
    (excluded ? negative : positive).push(matcher);
  }
  return files.filter((filename) => {
    const target = filename.split(path.sep).join('/');
    return positive.some((matches) => matches(target)) && !negative.some((matches) => matches(target));
  });
}
