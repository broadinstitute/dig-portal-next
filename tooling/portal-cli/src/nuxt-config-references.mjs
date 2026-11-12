import ts from 'typescript';

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

/** Read selected static dependency fields without loading or executing Nuxt config. */
export function nuxtConfigReferences(contents, filename) {
  const source = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) return []; // The script validator reports syntax errors.
  const bindings = new Map(), references = [];
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.initializer) bindings.set(declaration.name.text, declaration.initializer);
    }
  }
  function resolve(node, seen = new Set()) {
    node = unwrap(node);
    if (node && ts.isIdentifier(node) && bindings.has(node.text) && !seen.has(node.text)) return resolve(bindings.get(node.text), new Set([...seen, node.text]));
    return node;
  }
  function nameOf(node) {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
    if (ts.isComputedPropertyName(node)) {
      const name = resolve(node.expression);
      if (name && ts.isStringLiteralLike(name)) return name.text;
    }
  }
  function properties(node, ancestors = new Set()) {
    node = resolve(node);
    const values = new Map();
    if (!node || !ts.isObjectLiteralExpression(node) || ancestors.has(node)) return values;
    const next = new Set([...ancestors, node]);
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        for (const [name, value] of properties(property.expression, next)) values.set(name, value);
      } else if (ts.isPropertyAssignment(property)) {
        const name = nameOf(property.name);
        if (name !== undefined) values.set(name, property.initializer);
      } else if (ts.isShorthandPropertyAssignment(property)) values.set(property.name.text, property.name);
    }
    return values;
  }
  function list(node, visit, ancestors = new Set()) {
    node = resolve(node);
    if (!node || ancestors.has(node)) return;
    if (ts.isArrayLiteralExpression(node)) {
      const next = new Set([...ancestors, node]);
      for (const entry of node.elements) {
        if (ts.isSpreadElement(entry)) list(entry.expression, visit, next);
        else visit(resolve(entry));
      }
    } else visit(node);
  }
  function add(node, field) {
    node = resolve(node);
    if (node && ts.isStringLiteralLike(node)) references.push({ field, target: node.text });
  }
  function inspect(node, prefix = '', ancestors = new Set()) {
    node = resolve(node);
    if (!node || ancestors.has(node)) return;
    if (ts.isCallExpression(node) && ((ts.isIdentifier(node.expression) && node.expression.text === 'defineNuxtConfig')
      || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'defineNuxtConfig'))) node = resolve(node.arguments[0]);
    if (!node || ancestors.has(node)) return;
    const next = new Set([...ancestors, node]);
    for (const [name, value] of properties(node)) {
      const field = prefix ? `${prefix}.${name}` : name;
      if (name === 'css') list(value, (entry) => add(entry, field));
      else if (name === 'extends' || name === 'modules') list(value, (entry) => add(entry && ts.isArrayLiteralExpression(entry) ? entry.elements[0] : entry, field));
      else if (name === 'plugins') list(value, (entry) => {
        if (entry && ts.isObjectLiteralExpression(entry)) add(properties(entry).get('src'), field);
        else add(entry, field);
      });
      else if (name === '$env') {
        for (const [environment, config] of properties(value)) inspect(config, `${field}.${environment}`, next);
      } else if (['$development', '$production', '$test', 'overrides'].includes(name)) inspect(value, field, next);
    }
  }
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) inspect(statement.expression);
    else if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression)) {
      const { left, right, operatorToken } = statement.expression;
      if (operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(left)
        && ts.isIdentifier(left.expression) && left.expression.text === 'module' && left.name.text === 'exports') inspect(right);
    }
  }
  return references;
}
