import {
  ArrayAst,
  Ast,
  FunctionAst,
  LiteralAst,
  ObjectAst,
  RegExpAst,
  UnionAst,
  ValueAst,
} from './ast';
import { InvalidSchemaError, ValidationFn } from './types';
import {
  allOf,
  error,
  expected,
  flatten,
  isPlainObject,
  noExtraKeys,
  oneOf,
  replaceKey,
  valueIs,
} from './util';

const compileRegExp = (ast: RegExpAst): ValidationFn =>
  (obj) => {
    if (typeof obj !== 'string') return [expected(ast.key, 'string')];
    return obj.match(ast.value)
      ? []
      : [error(ast.key, `Value does not match: ${ast.value}`)];
  };

const compileUnion = (ast: UnionAst): ValidationFn =>
  oneOf(ast.key, ast.items.map(compile));

const compileFunction = (ast: FunctionAst): ValidationFn => ast.fn;

const compileValue = <T>(ast: ValueAst<T>): ValidationFn =>
  valueIs(ast.key, ast.value, ast.name);

function compileObject(ast: ObjectAst): ValidationFn {
  const fns: ValidationFn[] = ast.properties
      .map(p => ({ ...p, fn: compile(p.ast) }))
      .map(p => (obj: any) => p.fn(obj[p.key]));

  if (ast.strict) {
    fns.push(noExtraKeys(ast.key, ast.properties.map(p => p.key)));
  }

  const fn = allOf(fns);

  return obj =>
    isPlainObject(obj)
      ? fn(obj)
      : [expected(ast.key, 'object')];
}

function compileArray(ast: ArrayAst): ValidationFn {
  const fn = compile(ast.item);

  return (obj) => {
    if (!Array.isArray(obj)) return [expected(ast.key, 'array')];
    const errors = obj.map(
      (v, i) => fn(v).map(replaceKey(ast.key, `${ast.key}.${i}`)),
    );
    return flatten(errors);
  };
}

const quoteLiteral = (value: LiteralAst['value']): string =>
  typeof value === 'string'
    ? `'${value}'`
    : `${value}`;

const compileLiteral = (ast: LiteralAst): ValidationFn =>
  obj =>
    obj === ast.value
      ? []
      : [expected(ast.key, quoteLiteral(ast.value))];

// === Global =============================================================== //
export function compile(ast: Ast): ValidationFn {
  switch (ast.type) {
    case 'array': return compileArray(ast);
    case 'function': return compileFunction(ast);
    case 'literal': return compileLiteral(ast);
    case 'object': return compileObject(ast);
    case 'regexp': return compileRegExp(ast);
    case 'union': return compileUnion(ast);
    case 'value': return compileValue(ast);
  }
  throw new InvalidSchemaError(`Unknown AST: ${JSON.stringify(ast)}`);
}
