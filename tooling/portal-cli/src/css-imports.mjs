import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

// CSS strings and identifiers can escape a path's letters or separators.
function decodeCssEscapes(value) {
  return value.replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|(\r\n|[\r\n\f])|([\s\S]))/gi, (_match, hex, newline, character) => {
    if (hex) {
      const point = Number.parseInt(hex, 16);
      return point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) ? '\uFFFD' : String.fromCodePoint(point);
    }
    return newline ? '' : character;
  });
}

const significantNodes = (nodes) => nodes.filter(({ type }) => type !== 'space' && type !== 'comment');

/** Extract static CSS @import targets; preprocessors and other directives are separate. */
export function cssImports(contents, filename) {
  const references = [];
  const root = postcss.parse(contents, { from: filename });
  root.walkAtRules((rule) => {
    if (decodeCssEscapes(rule.name).toLowerCase() !== 'import') return;
    const token = significantNodes(valueParser(rule.params).nodes)[0];
    let target;
    if (token?.type === 'string') target = token;
    else if (token?.type === 'function' && decodeCssEscapes(token.value).toLowerCase() === 'url') {
      const nodes = significantNodes(token.nodes);
      if (token.unclosed) throw rule.error('Unclosed @import URL');
      if (nodes.length === 1 && (nodes[0].type === 'string' || nodes[0].type === 'word')) target = nodes[0];
    }
    if (target?.unclosed) throw rule.error('Unclosed @import string');
    if (target) references.push(decodeCssEscapes(target.value));
  });
  return references;
}
