import {
  ExpressionKind,
  type typeutil,
  type Cardinality,
} from "edgedb/dist/reflection/index.js";
import type {
  Expression,
  ObjectTypePointers,
  TypeSet,
  ObjectTypeSet,
  stripBacklinks,
  stripNonUpdateables,
  ObjectTypeExpression,
  ObjectType,
  $scopify,
} from "./typesystem.js";
import type { pointerToAssignmentExpression } from "./casting.js";
import { $expressionify, $getScopedExpr, $assert_single } from "./path.js";
import {
  type SelectModifiers,
  type NormalisedSelectModifiers,
  type ComputeSelectCardinality,
  $existingScopes,
  $handleModifiers,
} from "./select.js";
import { $normaliseInsertShape, type pointerIsOptional } from "./insert.js";

/////////////////
/// UPDATE
/////////////////

export type $expr_Update<
  El extends ObjectType = ObjectType,
  Card extends Cardinality = Cardinality,
  // Set extends TypeSet = TypeSet,
  // Expr extends ObjectTypeSet = ObjectTypeSet,
  // Shape extends UpdateShape<ObjectTypeSet> = any
> = Expression<{
  __kind__: ExpressionKind.Update;
  __element__: El;
  __cardinality__: Card;
  __expr__: TypeSet;
  __shape__: any;
  __modifiers__: NormalisedSelectModifiers;
  __scope__: ObjectTypeExpression;
}>;

export type UpdateShape<Root extends ObjectTypeSet> =
  typeutil.stripNever<
    stripNonUpdateables<stripBacklinks<Root["__element__"]["__pointers__"]>>
  > extends infer Shape
    ? Shape extends ObjectTypePointers
      ? {
          [k in keyof Shape]?:
            | (
                | pointerToAssignmentExpression<Shape[k]>
                | (Shape[k]["cardinality"] extends
                    | Cardinality.Many
                    | Cardinality.AtLeastOne
                    ?
                        | {
                            "+=": pointerToAssignmentExpression<Shape[k], true>;
                          }
                        | {
                            "-=": pointerToAssignmentExpression<Shape[k], true>;
                          }
                    : never)
              )
            | (pointerIsOptional<Shape[k]> extends true
                ? undefined | null
                : never);
        }
      : never
    : never;

export function update<
  Expr extends ObjectTypeExpression,
  Shape extends {
    filter?: SelectModifiers["filter"];
    filter_single?: SelectModifiers<Expr["__element__"]>["filter_single"];
    set: UpdateShape<Expr>;
  },
  // SetShape extends UpdateShape<Expr>,
  // Modifiers extends Pick<SelectModifiers, "filter">
>(
  expr: Expr,
  shape: (scope: $scopify<Expr["__element__"]>) => Readonly<Shape>,
): $expr_Update<Expr["__element__"], ComputeSelectCardinality<Expr, Shape>> {
  const cleanScopedExprs = $existingScopes.size === 0;

  const scope = $getScopedExpr(expr as any, $existingScopes);

  const resolvedShape = shape(scope);

  if (cleanScopedExprs) {
    $existingScopes.clear();
  }

  const mods: any = {};
  let updateShape: any | null;
  for (const [key, val] of Object.entries(resolvedShape)) {
    if (key === "filter" || key === "filter_single") {
      mods[key] = val;
    } else if (key === "set") {
      updateShape = val;
    } else {
      throw new Error(
        `Invalid update shape key '${key}', only 'filter', 'filter_single', ` +
          `and 'set' are allowed`,
      );
    }
  }

  if (!updateShape) {
    throw new Error(`Update shape must contain 'set' shape`);
  }

  const { modifiers, cardinality, needsAssertSingle } = $handleModifiers(mods, {
    root: expr,
    scope,
  });

  const updateExpr = {
    __kind__: ExpressionKind.Update,
    __element__: expr.__element__,
    __cardinality__: cardinality,
    __expr__: expr,
    __shape__: $normaliseInsertShape(expr, updateShape, true),
    __modifiers__: modifiers,
    __scope__: scope,
  } as any;

  return needsAssertSingle
    ? $assert_single(updateExpr)
    : $expressionify(updateExpr);
}
