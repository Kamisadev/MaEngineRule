// MaScript Compiler (from Ma Engine)s AST to optimized CSS + JS
// Part of Ma Engine - Content Optimization Tool

// Import ASTNode from parser
let ASTNodeRef;
if (typeof require !== 'undefined') {
    // Node.js environment
    ({ ASTNode: ASTNodeRef } = require('./parser.js'));
} else if (typeof window !== 'undefined' && window.MaParser) {
    // Browser window environment
    ({ ASTNode: ASTNodeRef } = window.MaParser);
} else if (typeof self !== 'undefined' && self.MaParser) {
    // Service Worker environment
    ({ ASTNode: ASTNodeRef } = self.MaParser);
} else if (typeof ASTNode !== 'undefined') {
    // Fallback: Use global ASTNode if defined (e.g. same scope)
    ASTNodeRef = ASTNode;
}

// Expression Optimizer - Simplifies and reorders logical expressions
class ExpressionOptimizer {
    optimize(expression) {
        if (!expression) return expression;

        // Optimize operands first (bottom-up)
        if (expression.type === 'LogicalExpression') {
            const left = this.optimize(expression.left);
            const right = this.optimize(expression.right);

            // Deduplication: x && x → x
            if (expression.operator === 'AND' && this.isEqual(left, right)) {
                return left;
            }

            // Reorder AND by cost (cheap checks first)
            if (expression.operator === 'AND' && this.getCost(left) > this.getCost(right)) {
                return new ASTNodeRef('LogicalExpression', {
                    operator: 'AND',
                    left: right,
                    right: left
                });
            }

            return new ASTNodeRef('LogicalExpression', {
                operator: expression.operator,
                left,
                right
            });
        }

        // Double negation: !!x → x
        if (expression.type === 'NegationExpression' &&
            expression.operand.type === 'NegationExpression') {
            return this.optimize(expression.operand.operand);
        }

        if (expression.type === 'NegationExpression') {
            return new ASTNodeRef('NegationExpression', {
                operand: this.optimize(expression.operand)
            });
        }

        return expression;
    }

    getCost(expr) {
        if (!expr) return 0;

        if (expr.type === 'Selector') return 1; // cheap CSS match

        if (expr.type === 'PseudoSelector') {
            // Existing costs
            if (expr.name === 'visible') return 10; // expensive
            if (expr.name === 'viewport') return 10;
            if (expr.name === 'has-text') return 8;
            if (expr.name === 'has') return 3;
            if (expr.name === 'has-child') return 3;

            // New pseudo-selector costs
            if (expr.name === 'aspect-ratio') return 5;
            if (expr.name === 'common-dimensions') return 5;
            if (expr.name === 'layout-shift') return 15; // expensive (mutation tracking)
            if (expr.name === 'sticky') return 5;
            if (expr.name === 'auto-play') return 7;
            if (expr.name === 'opens-popup') return 10; // event listener overhead
            if (expr.name === 'lazy-loaded') return 6;
            if (expr.name === 'scroll-triggered') return 12; // intersection observer
            if (expr.name === 'contains-image') return 6;
            if (expr.name === 'external-domain') return 4;
            if (expr.name === 'distraction-score') return 20; // multi-factor scoring (expensive)
            if (expr.name === 'promoted-content') return 10;
            if (expr.name === 'overlay-modal') return 8;
            if (expr.name === 'countdown-timer') return 6;
            if (expr.name === 'empty-after-block') return 5;
            if (expr.name === 'sibling-match') return 4;

            return 5;
        }

        if (expr.type === 'LogicalExpression') {
            return this.getCost(expr.left) + this.getCost(expr.right);
        }

        if (expr.type === 'NegationExpression') {
            return this.getCost(expr.operand) + 1;
        }

        // Phase 1: Property comparisons are relatively cheap (getBoundingClientRect is cached)
        if (expr.type === 'ComparisonExpression') {
            return 4; // Slightly more expensive than CSS selector, but cheaper than most pseudo-selectors
        }

        return 5;
    }

    isEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
}

class Compiler {
    constructor(ast) {
        this.ast = ast;
        this.cssRules = [];
        this.jsRules = [];
        this.currentDomains = ['*']; // Default to global
        this.variables = ast.variables || new Map(); // Symbol table from parser
        this.functions = new Map(); // Function table
        this.optimizer = new ExpressionOptimizer();
    }

    compile() {
        this.visit(this.ast);
        return {
            css: this.generateCSS(),
            js: this.jsRules,
            cssRules: this.cssRules,
            functions: Object.fromEntries(this.functions) // Export functions for runtime
        };
    }

    visit(node) {
        if (!node) return;

        const method = `visit${node.type}`;
        if (this[method]) {
            return this[method](node);
        }

        console.warn(`No visitor for ${node.type}`);
    }

    visitFunctionDefinition(node) {
        // Compile the function body (actions)
        const compiledActions = node.actions.map(action => {
            if (action.type === 'ActionBlock') {
                return this.compileActionBlock(action);
            }
            if (action.type === 'GuardedAction') {
                return this.compileGuardedAction(action);
            }
            return this.compileAction(action);
        });

        // Store function in symbol table
        this.functions.set(node.name, {
            name: node.name,
            params: node.params,
            actions: compiledActions
        });
    }

    visitProgram(node) {
        for (const stmt of node.body) {
            this.visit(stmt);
        }
    }

    visitVariableDeclaration(node) {
        // Variables are already stored in symbol table, no code generation needed
        return;
    }

    visitGlobalBlock(node) {
        const prevDomains = this.currentDomains;
        this.currentDomains = ['*'];

        for (const rule of node.rules) {
            this.visit(rule);
        }

        this.currentDomains = prevDomains;
    }

    visitDomainBlock(node) {
        const prevDomains = this.currentDomains;
        this.currentDomains = node.domains;

        for (const rule of node.rules) {
            this.visit(rule);
        }

        this.currentDomains = prevDomains;
    }

    visitGroupBlock(node) {
        // Groups are just for organization, process rules normally
        for (const rule of node.rules) {
            this.visit(rule);
        }
    }

    visitConditionBlock(node) {
        // Condition blocks require JS runtime
        const condition = this.parseCondition(node.condition);

        for (const rule of node.rules) {
            const compiled = this.compileRule(rule);
            this.jsRules.push({
                domains: [...this.currentDomains],
                condition,
                ...compiled
            });
        }
    }

    visitRule(node) {
        const compiled = this.compileRule(node);

        // Determine if rule can be CSS-only or needs JS
        if (compiled.requiresJS) {
            this.jsRules.push({
                domains: [...this.currentDomains],
                ...compiled
            });

            // FALLBACK: If the base selector is pure CSS, add it to CSS rules as 'hide' for instant effect
            // BUT: Skip fallback if action is a function call (it has internal conditions we can't replicate in CSS)
            const isFunctionCall = compiled.action?.type === 'FunctionCall' ||
                (compiled.action?.name && this.functions.has(compiled.action.name));

            if (compiled.cssSelector && !compiled.cssSelector.includes(':has(') && !isFunctionCall) {
                this.cssRules.push({
                    domains: [...this.currentDomains],
                    cssSelector: compiled.cssSelector,
                    action: { css: 'display: none !important' }
                });
            }
        } else {
            this.cssRules.push({
                domains: [...this.currentDomains],
                ...compiled
            });
        }
    }

    compileRule(node) {
        // Optimize the expression
        const optimizedExpr = this.optimizer.optimize(node.selectorExpr);

        // Phase 1: Handle different action types
        let action;
        if (node.action.type === 'GuardedAction') {
            action = this.compileGuardedAction(node.action);
        } else if (node.action.type === 'ActionBlock') {
            action = this.compileActionBlock(node.action);
        } else {
            action = this.compileAction(node.action);
        }

        // Try to extract pure CSS
        const cssSelector = this.extractCSS(optimizedExpr);
        const requiresJS = this.requiresJS(optimizedExpr) || action.requiresJS;

        if (!requiresJS && cssSelector) {
            // Pure CSS rule
            return {
                cssSelector,
                action,
                requiresJS: false
            };
        }

        // JS rule with optional CSS fallback
        return {
            cssSelector, // null or partial CSS for instant optimization
            expression: optimizedExpr,
            action,
            requiresJS: true
        };
    }

    // Check if expression requires JavaScript evaluation
    requiresJS(expr) {
        if (!expr) return false;

        if (expr.type === 'Selector') {
            return expr.kind === 'variable'; // variables resolved at compile time, so no
        }

        if (expr.type === 'PseudoSelector') {
            // Most pseudo-selectors require JS, except :has() which is native CSS
            return !['has', 'has-child'].includes(expr.name);
        }

        if (expr.type === 'LogicalExpression') {
            // Both OR and AND can be pure CSS if their operands are pure CSS
            // OR = comma separated in CSS, AND = concatenation
            return this.requiresJS(expr.left) || this.requiresJS(expr.right);
        }

        if (expr.type === 'NegationExpression') {
            // Negation requires JS (CSS :not() handled separately)
            return true;
        }

        return false;
    }

    // Extract pure CSS selector from expression
    extractCSS(expr) {
        if (!expr) return null;

        // Single CSS selector
        if (expr.type === 'Selector' && expr.kind === 'css') {
            return expr.value;
        }

        // :has() is native CSS
        if (expr.type === 'PseudoSelector' && expr.name === 'has-child') {
            const childSelector = expr.args[0]?.value || '';
            return `:has(${childSelector})`;
        }

        // AND of pure CSS selectors (concatenate)
        if (expr.type === 'LogicalExpression' && expr.operator === 'AND') {
            const leftCSS = this.extractCSS(expr.left);
            const rightCSS = this.extractCSS(expr.right);

            if (leftCSS && rightCSS && !this.requiresJS(expr)) {
                return leftCSS + rightCSS;
            }

            // Return partial CSS for fallback (left side only if it's pure CSS)
            if (leftCSS && !this.requiresJS(expr.left)) {
                return leftCSS;
            }
        }

        // OR of pure CSS selectors (comma-separated)
        if (expr.type === 'LogicalExpression' && expr.operator === 'OR') {
            const leftCSS = this.extractCSS(expr.left);
            const rightCSS = this.extractCSS(expr.right);

            if (leftCSS && rightCSS && !this.requiresJS(expr)) {
                // CSS OR = comma separated: "#a, #b"
                return `${leftCSS}, ${rightCSS}`;
            }
        }

        return null;
    }

    compileSelector(node) {
        if (node.type === 'Selector') {
            // Handle variable reference
            if (node.kind === 'variable') {
                const varName = node.value;
                if (!this.variables.has(varName)) {
                    throw new Error(`Undefined variable: $${varName}`);
                }
                const resolvedValue = this.variables.get(varName);
                return {
                    css: resolvedValue,
                    requiresJS: false
                };
            }

            // Pure CSS selector
            return {
                css: node.value,
                requiresJS: false
            };
        }

        if (node.type === 'PseudoSelector') {
            return this.compilePseudoSelector(node);
        }

        if (node.type === 'LogicalExpression') {
            return this.compileLogicalExpression(node);
        }

        if (node.type === 'NegationExpression') {
            return this.compileNegationExpression(node);
        }

        return { css: '', requiresJS: false };
    }

    compileLogicalExpression(node) {
        // Phase 1: Use compileExpression instead of compileSelector to handle ComparisonExpression
        const left = this.compileExpression ? this.compileExpression(node.left) : this.compileSelector(node.left);
        const right = this.compileExpression ? this.compileExpression(node.right) : this.compileSelector(node.right);

        return {
            type: 'LogicalExpression',
            operator: node.operator,
            left,
            right,
            requiresJS: true, // Logical expressions always need JS
            css: '' // No direct CSS representation
        };
    }

    compileNegationExpression(node) {
        // Phase 1: Use compileExpression to handle ComparisonExpression
        const operand = this.compileExpression ? this.compileExpression(node.operand) : this.compileSelector(node.operand);

        // Check if it's a simple CSS selector - can use :not()
        if (operand.css && !operand.requiresJS) {
            return {
                type: 'NegationExpression',
                operand,
                requiresJS: false,
                css: `:not(${operand.css})`
            };
        }

        // Complex operand requires JS
        return {
            type: 'NegationExpression',
            operand,
            requiresJS: true,
            css: ''
        };
    }

    compilePseudoSelector(node) {
        const { name, args } = node;

        switch (name) {
            case 'text':
                return this.compileTextSelector(args);
            case 'size':
                return this.compileSizeSelector(args);
            case 'position':
                return this.compilePositionSelector(args);
            case 'zindex':
                return this.compileZIndexSelector(args);
            case 'has-child':
                return this.compileHasChildSelector(args);
            case 'has-text':
                return this.compileHasTextSelector(args);
            case 'nth-parent':
                return this.compileNthParentSelector(args);
            case 'visible':
                return { css: '', requiresJS: true, check: 'isVisible' };
            case 'viewport':
                return { css: '', requiresJS: true, check: 'isInViewport' };
            case 'smart-container':
            case 'native-ad':
                // Smart detection: find label text and remove entire ad container
                return this.compileSmartContainerSelector(args);
            case 'shadow':
                // Shadow DOM piercing
                return { css: '', requiresJS: true, check: 'shadowPierce', selector: args[0]?.value };
            case 'has':
                // Native CSS :has() - pass through with the full nested selector
                const innerSelector = args.map(a => a.value || a.raw || '').join('');
                return { css: `:has(${innerSelector})`, requiresJS: false };
            case 'style':
                return this.compileStyleSelector(args);

            // New advanced pseudo-selectors
            case 'aspect-ratio':
                return { css: '', requiresJS: true, check: 'aspectRatio', params: [args[0]?.value || '16:9', args[1]?.value || '0.1'] };
            case 'common-dimensions':
                return { css: '', requiresJS: true, check: 'commonDimensions' };
            case 'layout-shift':
                return { css: '', requiresJS: true, check: 'layoutShift', params: [args[0]?.value || '0.1'] };
            case 'sticky':
                return { css: '', requiresJS: true, check: 'sticky' };
            case 'auto-play':
                return { css: '', requiresJS: true, check: 'autoPlay' };
            case 'opens-popup':
                return { css: '', requiresJS: true, check: 'opensPopup' };
            case 'lazy-loaded':
                return { css: '', requiresJS: true, check: 'lazyLoaded', params: [args[0]?.value || '2000'] };
            case 'scroll-triggered':
                return { css: '', requiresJS: true, check: 'scrollTriggered' };
            case 'contains-image':
                return { css: '', requiresJS: true, check: 'containsImage', params: [args[0]?.value || ''] };
            case 'external-domain':
                return { css: '', requiresJS: true, check: 'externalDomain' };
            case 'distraction-score':
                return { css: '', requiresJS: true, check: 'distractionScore', params: [args[0]?.value || '50'] };
            case 'promoted-content':
                return this.compileSmartContainerSelector(args, true); // Enhanced version
            case 'overlay-modal':
                return { css: '', requiresJS: true, check: 'overlayModal' };
            case 'countdown-timer':
                return { css: '', requiresJS: true, check: 'countdownTimer' };
            case 'empty-after-block':
                return { css: '', requiresJS: true, check: 'emptyAfterBlock' };
            case 'sibling-match':
                return { css: '', requiresJS: true, check: 'siblingMatch', params: [args[0]?.value || '', args[1]?.value || 'any'] };

            default:
                return { css: '', requiresJS: false };
        }
    }

    // Smart container selector - finds native ads by label text
    compileSmartContainerSelector(args, isV2 = false) {
        const labelText = args[0]?.value || 'Sponsored';
        let matcher;

        if (args[0]?.type === 'regex') {
            matcher = { type: 'regex', pattern: args[0].pattern, flags: args[0].flags };
        } else {
            matcher = { type: 'contains', value: labelText };
        }

        return {
            css: '',
            requiresJS: true,
            check: isV2 ? 'nativeAdV2' : 'smartContainer',
            matcher,
            // This will use findAdContainer() to locate the proper container
            targetParent: true
        };
    }

    compileTextSelector(args) {
        const arg = args[0];
        let matcher;

        if (arg.type === 'regex') {
            matcher = { type: 'regex', pattern: arg.pattern, flags: arg.flags };
        } else {
            matcher = { type: 'exact', value: arg.value };
        }

        const targetParent = args.length > 1 && args[1].value === 'parent';

        return {
            css: '',
            requiresJS: true,
            check: 'textMatch',
            matcher,
            targetParent
        };
    }

    compileSizeSelector(args) {
        const sizeStr = args[0]?.value || '';
        const match = sizeStr.match(/([><]?)(\d+|\*)x([><]?)(\d+|\*)/);

        if (!match) return { css: '', requiresJS: true, check: 'sizeMatch', width: '*', height: '*' };

        return {
            css: '',
            requiresJS: true,
            check: 'sizeMatch',
            widthOp: match[1] || '=',
            width: match[2],
            heightOp: match[3] || '=',
            height: match[4]
        };
    }

    compilePositionSelector(args) {
        const position = args[0]?.value || 'fixed';
        const location = args[1]?.value || null;

        return {
            css: '',
            requiresJS: true,
            check: 'positionMatch',
            position,
            location
        };
    }

    compileZIndexSelector(args) {
        const zStr = args[0]?.value || '>0';
        const match = zStr.match(/([><]?)(\d+)/);

        return {
            css: '',
            requiresJS: true,
            check: 'zindexMatch',
            op: match?.[1] || '>',
            value: parseInt(match?.[2] || '0')
        };
    }

    compileHasChildSelector(args) {
        const childSelector = args[0]?.value || '';

        return {
            css: `:has(${childSelector})`, // Modern CSS :has()
            requiresJS: false // Use CSS :has() if supported
        };
    }

    compileHasTextSelector(args) {
        const text = args[0]?.value || '';

        return {
            css: '',
            requiresJS: true,
            check: 'hasText',
            text
        };
    }

    compileNthParentSelector(args) {
        const levels = parseInt(args[0]?.value || '1');

        return {
            css: '',
            requiresJS: true,
            check: 'nthParent',
            levels
        };
    }

    compileStyleSelector(args) {
        // args[0] might be "width: 1200px" or prop "width", value "1200px"
        // We'll support key:value string for simplicity
        const styleStr = args[0]?.value || '';
        const [prop, val] = styleStr.split(':').map(s => s.trim());

        return {
            css: '',
            requiresJS: true,
            check: 'styleMatch',
            prop,
            value: val
        };
    }

    compileAction(node) {
        if (!node) {
            return { name: 'hide', requiresJS: false, css: 'display: none !important' };
        }

        let { name, args } = node;

        // Resolve variable reference
        if (node.isVariable) {
            if (!this.variables.has(name)) {
                throw new Error(`Undefined variable: $${name}`);
            }
            name = this.variables.get(name);
        }

        switch (name) {
            case 'hide':
                return { name: 'hide', requiresJS: false, css: 'display: none !important' };

            case 'remove':
                return { name: 'remove', requiresJS: true };

            case 'collapse':
                return {
                    name: 'collapse',
                    requiresJS: false,
                    css: 'height: 0 !important; overflow: hidden !important; padding: 0 !important; margin: 0 !important'
                };

            case 'blur':
                const blurAmount = args[0] || '10px';
                return {
                    name: 'blur',
                    requiresJS: false,
                    css: `filter: blur(${blurAmount}) !important`
                };

            case 'opacity':
                const opacityValue = args[0] || '0';
                return {
                    name: 'opacity',
                    requiresJS: false,
                    css: `opacity: ${opacityValue} !important`
                };

            case 'removeparent':
            case 'remove-parent':
                const levels = parseInt(args[0] || '1');
                return { name: 'removeParent', requiresJS: true, levels };

            case 'cleanurl':
            case 'clean-url':
                return { name: 'cleanUrl', requiresJS: true };

            case 'cleantext':
            case 'clean-text':
                return { name: 'cleanText', requiresJS: true };

            case 'block':
                return { name: 'block', requiresJS: true };

            case 'delay':
                const delay = args[0] || '0';
                return { name: 'delay', requiresJS: true, delay };

            // New advanced actions
            case 'fadeout':
            case 'fade-out':
                const fadeOutDuration = args[0] || '300';
                return { name: 'fadeOut', requiresJS: true, args: [fadeOutDuration] };

            case 'redirectlink':
            case 'redirect-link':
                const redirectUrl = args[0] || '';
                return { name: 'redirectLink', requiresJS: true, args: [redirectUrl] };

            case 'preventclick':
            case 'prevent-click':
                return { name: 'preventClick', requiresJS: true };

            case 'reducezindex':
            case 'reduce-zindex':
                const zIndexAmount = args[0] || '10000';
                return { name: 'reduceZindex', requiresJS: true, args: [zIndexAmount] };

            case 'collapsecontainer':
            case 'collapse-container':
                return { name: 'collapseContainer', requiresJS: true };

            case 'speed':
                const wrappedAction = args[0] || 'remove';
                return { name: 'speed', requiresJS: true, args: [wrappedAction] };

            default:
                // Treat as valid custom function call
                return { name: name, type: 'FunctionCall', args: args || [], requiresJS: true };
        }
    }

    parseCondition(conditionStr) {
        // Parse conditions like "scroll > 500px", "viewport < 768px", "time > 22:00"
        const parts = conditionStr.split(/\s+/);

        if (parts.length >= 3) {
            return {
                type: parts[0],
                op: parts[1],
                value: parts[2]
            };
        }

        return { type: 'always', op: '=', value: true };
    }

    // Phase 1: New compilation methods

    compileActionBlock(node) {
        const compiledActions = node.actions.map(action => this.compileAction(action));
        return {
            type: 'ActionBlock',
            actions: compiledActions,
            requiresJS: compiledActions.some(a => a.requiresJS)
        };
    }

    compileGuardedAction(node) {
        const action = node.action.type === 'ActionBlock'
            ? this.compileActionBlock(node.action)
            : this.compileAction(node.action);

        const condition = this.compileGuardCondition(node.condition);

        return {
            type: 'GuardedAction',
            action,
            condition,
            requiresJS: true // Guards always require JS
        };
    }

    compileGuardCondition(node) {
        if (node.type === 'ComparisonExpression') {
            return {
                type: 'Comparison',
                property: node.property,
                operator: node.operator,
                value: node.value
            };
        }

        if (node.type === 'PseudoSelector') {
            return this.compilePseudoSelector(node);
        }

        // Logical expression
        return this.compileExpression(node);
    }

    compileExpression(node) {
        if (!node) return null;

        if (node.type === 'Selector') {
            return this.compileSelector(node);
        }

        if (node.type === 'PseudoSelector') {
            return this.compilePseudoSelector(node);
        }

        if (node.type === 'ComparisonExpression') {
            return {
                type: 'Comparison',
                property: node.property,
                operator: node.operator,
                value: node.value
            };
        }

        if (node.type === 'LogicalExpression') {
            return this.compileLogicalExpression(node);
        }

        if (node.type === 'NegationExpression') {
            return this.compileNegationExpression(node);
        }

        return null;
    }

    generateCSS() {
        const rulesByStyle = new Map();

        // Group rules by their CSS style
        for (const rule of this.cssRules) {
            if (!rule.cssSelector || !rule.action.css) continue;

            const key = rule.action.css;
            if (!rulesByStyle.has(key)) {
                rulesByStyle.set(key, []);
            }
            rulesByStyle.get(key).push(rule.cssSelector);
        }

        // Generate combined CSS
        let css = '/* MaScript Compiled CSS */\n';

        for (const [style, selectors] of rulesByStyle) {
            const uniqueSelectors = [...new Set(selectors)].filter(s => s.trim());
            if (uniqueSelectors.length > 0) {
                css += `${uniqueSelectors.join(',\n')} {\n  ${style};\n}\n\n`;
            }
        }

        return css;
    }
}

// Helper function to compile MaScript source to CSS + JS
function compileMaScript(source) {
    // Import lexer and parser if in module context
    let Lexer, Parser;

    if (typeof window !== 'undefined') {
        Lexer = window.MaLexer?.Lexer;
        Parser = window.MaParser?.Parser;
    } else if (typeof self !== 'undefined') {
        Lexer = self.MaLexer?.Lexer;
        Parser = self.MaParser?.Parser;
    } else if (typeof require !== 'undefined') {
        ({ Lexer } = require('./lexer.js'));
        ({ Parser } = require('./parser.js'));
    }

    if (!Lexer || !Parser) {
        throw new Error('Lexer and Parser must be loaded first');
    }

    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const parser = new Parser(tokens);
    const ast = parser.parseProgram();

    const compiler = new Compiler(ast);
    return compiler.compile();
}

// Export for use
if (typeof module !== 'undefined') {
    module.exports = { Compiler, compileMaScript };
}
if (typeof window !== 'undefined') {
    window.MaCompiler = { Compiler, compileMaScript };
    window.compileMaScript = compileMaScript;
} else if (typeof self !== 'undefined') {
    self.MaCompiler = { Compiler, compileMaScript };
    self.compileMaScript = compileMaScript;
}
