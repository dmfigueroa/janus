const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

const transparentExpressionTypes = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
]);

function isPascalCase(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function unwrapExpression(node) {
  return transparentExpressionTypes.has(node.parent?.type) ? unwrapExpression(node.parent) : node;
}

function getVariableFunctionName(node) {
  const declarator = unwrapExpression(node).parent;
  return declarator.type === "VariableDeclarator" ? declarator.id.name : null;
}

function getFunctionName(node) {
  return node.id ? node.id.name : getVariableFunctionName(node);
}

function isInFunctionReturn(node, owningFunction, ancestors) {
  if (
    owningFunction.type === "ArrowFunctionExpression" &&
    owningFunction.body.type !== "BlockStatement"
  ) {
    return true;
  }

  const functionIndex = ancestors.lastIndexOf(owningFunction);
  return ancestors.slice(functionIndex + 1).some((ancestor) => ancestor.type === "ReturnStatement");
}

function isNamedComponent(node) {
  const functionName = node && getFunctionName(node);
  return functionName ? isPascalCase(functionName) : false;
}

function isNotChildContainer(expressionContainer) {
  return !expressionContainer || expressionContainer.parent.type === "JSXAttribute";
}

export const noCallExpressionChildren = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow function calls used as JSX children",
    },
    messages: {
      callChild:
        "Render a value or component directly instead of calling a function inside JSX children.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const expressionContainer = context.sourceCode
          .getAncestors(node)
          .findLast((ancestor) => ancestor.type === "JSXExpressionContainer");

        if (isNotChildContainer(expressionContainer)) {
          return;
        }

        context.report({ messageId: "callChild", node });
      },
    };
  },
};

export const componentOwnedJsx = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require JSX to be returned directly by named components",
    },
    messages: {
      componentReturn:
        "Create JSX only in the direct return tree of a named PascalCase component; extract a component instead.",
    },
    schema: [],
  },
  create(context) {
    function checkJsx(node) {
      const ancestors = context.sourceCode.getAncestors(node);
      const owningFunction = ancestors.findLast((ancestor) => functionTypes.has(ancestor.type));

      if (!isNamedComponent(owningFunction)) {
        context.report({ messageId: "componentReturn", node });
        return;
      }

      if (!isInFunctionReturn(node, owningFunction, ancestors)) {
        context.report({ messageId: "componentReturn", node });
      }
    }

    return {
      JSXElement: checkJsx,
      JSXFragment: checkJsx,
    };
  },
};

export default {
  meta: {
    name: "component-rendering",
  },
  rules: {
    "component-owned-jsx": componentOwnedJsx,
    "no-call-expression-children": noCallExpressionChildren,
  },
};
