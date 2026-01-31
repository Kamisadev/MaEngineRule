// MaScript Parser (from Ma Engine)ses tokens into AST
// Part of Ma Engine - Content Optimization Tool

// AST Node Types
const NodeType = {
    PROGRAM: 'Program',
    DOMAIN_BLOCK: 'DomainBlock',
    GLOBAL_BLOCK: 'GlobalBlock',
    GROUP_BLOCK: 'GroupBlock',
    CONDITION_BLOCK: 'ConditionBlock',
    RULE: 'Rule',
    SELECTOR: 'Selector',
    PSEUDO_SELECTOR: 'PseudoSelector',
    ACTION: 'Action',
    IMPORT: 'Import',
    VARIABLE_DECLARATION: 'VariableDeclaration',
    LOGICAL_EXPRESSION: 'LogicalExpression',
    NEGATION_EXPRESSION: 'NegationExpression',
    // Phase 1: New node types
    ACTION_BLOCK: 'ActionBlock',
    GUARDED_ACTION: 'GuardedAction',
    PROPERTY_ACCESS: 'PropertyAccess',
    COMPARISON: 'ComparisonExpression',
    FUNCTION_DEFINITION: 'FunctionDefinition',
};

class ASTNode {
    constructor(type, props = {}) {
        this.type = type;
        Object.assign(this, props);
    }
}

class Parser {
    constructor(tokens) {
        this.tokens = tokens.filter(t =>
            t.type !== 'COMMENT' && t.type !== 'NEWLINE'
        );
        this.pos = 0;
        this.variables = new Map(); // Symbol table for variables
    }

    peek(offset = 0) {
        return this.tokens[this.pos + offset] || { type: 'EOF' };
    }

    advance() {
        return this.tokens[this.pos++];
    }

    expect(type) {
        const token = this.peek();
        if (token.type !== type) {
            throw new Error(`Expected ${type}, got ${token.type} at line ${token.line}`);
        }
        return this.advance();
    }

    isEOF() {
        return this.peek().type === 'EOF';
    }

    // Program = VariableDeclaration* (Block | Rule)*
    parseProgram() {
        const body = [];

        // Parse variable declarations first (check for = after variable ref)
        while (!this.isEOF() && this.peek().type === 'VARIABLE_REF' && this.peek(1).type === 'EQUALS') {
            const varDecl = this.parseVariableDeclaration();
            if (varDecl) body.push(varDecl);
        }

        // Parse rest of program
        while (!this.isEOF()) {
            const node = this.parseStatement();
            if (node) body.push(node);
        }

        return new ASTNode(NodeType.PROGRAM, { body, variables: this.variables });
    }

    // Statement = Block | Rule | Import
    parseStatement() {
        const token = this.peek();

        switch (token.type) {
            case 'DOMAIN':
                return this.parseDomainBlock();
            case 'GLOBAL':
                return this.parseGlobalBlock();
            case 'GROUP':
                return this.parseGroupBlock();
            case 'IF':
                return this.parseConditionBlock();
            case 'IMPORT':
                return this.parseImport();
            case 'SELECTOR':
            case 'TEXT':
            case 'SIZE':
            case 'POSITION':
            case 'ZINDEX':
            case 'HAS_CHILD':
            case 'HAS_TEXT':
            case 'VISIBLE':
            case 'VIEWPORT':
                return this.parseRule();
            // Check for potential function definition (fn) or variable declaration ($)
            // But usually this switch is for statements starting with keywords/selectors
            default:
                // Check if it's 'fn' keyword
                if (token.type === 'FN') {
                    return this.parseFunctionDefinition();
                }

                this.advance(); // Skip unknown
                return null;
        }
    }

    // VariableDeclaration = '$' identifier '=' value
    parseVariableDeclaration() {
        const nameToken = this.expect('VARIABLE_REF');
        const name = nameToken.value;

        this.expect('EQUALS');

        // Read value until we hit another variable declaration or a block
        let value = '';
        const stopTokens = ['VARIABLE_REF', 'DOMAIN', 'GLOBAL', 'GROUP', 'IF', 'IMPORT', 'EOF'];

        while (!this.isEOF() && !stopTokens.includes(this.peek().type)) {
            const token = this.advance();
            value += token.value;
        }

        value = value.trim();

        // Store in symbol table
        this.variables.set(name, value);

        return new ASTNode(NodeType.VARIABLE_DECLARATION, { name, value });
    }

    // DomainBlock = '@domain' '(' domains ')' '{' rules '}'
    parseDomainBlock() {
        this.expect('DOMAIN');
        this.expect('LPAREN');

        const domains = this.parseDomainList();

        this.expect('RPAREN');
        this.expect('LBRACE');

        const rules = this.parseRuleList();

        this.expect('RBRACE');

        return new ASTNode(NodeType.DOMAIN_BLOCK, { domains, rules });
    }

    // GlobalBlock = '@global' '{' rules '}'
    parseGlobalBlock() {
        this.expect('GLOBAL');
        this.expect('LBRACE');

        const rules = this.parseRuleList();

        this.expect('RBRACE');

        return new ASTNode(NodeType.GLOBAL_BLOCK, { rules });
    }

    // GroupBlock = '@group' '(' name ')' '{' rules '}'
    parseGroupBlock() {
        this.expect('GROUP');
        this.expect('LPAREN');

        const name = this.expect('STRING').value;

        this.expect('RPAREN');
        this.expect('LBRACE');

        const rules = this.parseRuleList();

        this.expect('RBRACE');

        return new ASTNode(NodeType.GROUP_BLOCK, { name, rules });
    }

    // ConditionBlock = '@if' '(' condition ')' '{' rules '}'
    parseConditionBlock() {
        this.expect('IF');
        this.expect('LPAREN');

        const condition = this.parseCondition();

        this.expect('RPAREN');
        this.expect('LBRACE');

        const rules = this.parseRuleList();

        this.expect('RBRACE');

        return new ASTNode(NodeType.CONDITION_BLOCK, { condition, rules });
    }

    // Import = '@import' '(' path ')'
    parseImport() {
        this.expect('IMPORT');
        this.expect('LPAREN');

        const path = this.expect('STRING').value;

        this.expect('RPAREN');

        return new ASTNode(NodeType.IMPORT, { path });
    }

    // FunctionDefinition = 'fn' identifier '(' params ')' '{' actions '}'
    parseFunctionDefinition() {
        this.expect('FN');
        const nameToken = this.expect('SELECTOR'); // Function name is an identifier
        const name = nameToken.value;

        this.expect('LPAREN');
        const params = this.parsePseudoArgs().map(arg => arg.value); // Reuse logic for comma-separated list
        this.expect('RPAREN');

        // Parse body - re-use parseActionBlock but without checking for guard afterwards (unless we want guarded functions?)
        // Actually parseActionBlock expects LBRACE itself
        this.expect('LBRACE');
        const actions = [];

        while (this.peek().type !== 'RBRACE' && !this.isEOF()) {
            if (this.peek().type === 'SEMICOLON') {
                this.advance();
                continue;
            }

            // Allow recursive function calls and standard actions
            let action = this.parseAction();

            // Check for guard (when condition)
            if (this.peek().type === 'WHEN') {
                this.advance(); // consume 'when'
                const condition = this.parseGuardCondition();
                action = new ASTNode(NodeType.GUARDED_ACTION, { action, condition });
            }

            actions.push(action);

            if (this.peek().type === 'SEMICOLON') {
                this.advance();
            }
        }
        this.expect('RBRACE');

        return new ASTNode(NodeType.FUNCTION_DEFINITION, { name, params, actions });
    }

    // DomainList = domain (',' domain)*
    parseDomainList() {
        const domains = [];

        // First domain
        let domain = '';
        while (this.peek().type !== 'COMMA' && this.peek().type !== 'RPAREN') {
            domain += this.advance().value;
        }
        domains.push(domain.trim());

        // Additional domains
        while (this.peek().type === 'COMMA') {
            this.advance(); // skip comma
            domain = '';
            while (this.peek().type !== 'COMMA' && this.peek().type !== 'RPAREN') {
                domain += this.advance().value;
            }
            domains.push(domain.trim());
        }

        return domains;
    }

    // RuleList = Rule*
    parseRuleList() {
        const rules = [];

        while (this.peek().type !== 'RBRACE' && !this.isEOF()) {
            // Skip newlines/comments if they appear here (though lexer handles them usually)
            if (this.peek().type === 'NEWLINE' || this.peek().type === 'COMMENT') {
                this.advance();
                continue;
            }

            const rule = this.parseRule();
            if (rule) {
                rules.push(rule);
            } else {
                // If parseRule returns null but we are not at RBRACE/EOF, we must advance to avoid infinite loop
                this.advance();
            }
        }

        return rules;
    }

    // Rule = SelectorExpression ('->' Action | Block)
    parseRule() {
        const selectorExpr = this.parseSelectorExpression();

        if (!selectorExpr) return null;

        // Check for block syntax
        if (this.peek().type === 'LBRACE') {
            const action = this.parseActionBlock();
            return new ASTNode(NodeType.RULE, { selectorExpr, action });
        }

        // Check for arrow syntax
        if (this.peek().type === 'ARROW') {
            this.advance(); // consume ->
            const action = this.parseActionOrBlock();
            return new ASTNode(NodeType.RULE, { selectorExpr, action });
        }

        // Rule without action/block - default to hide
        return new ASTNode(NodeType.RULE, {
            selectorExpr,
            action: new ASTNode(NodeType.ACTION, { name: 'hide', args: [] })
        });
    }

    // SelectorExpression = OrExpression
    parseSelectorExpression() {
        return this.parseOrExpression();
    }

    // OrExpression = AndExpression ('||' AndExpression)*
    parseOrExpression() {
        let left = this.parseAndExpression();

        while (this.peek().type === 'OR') {
            this.advance(); // consume ||
            const right = this.parseAndExpression();
            left = new ASTNode(NodeType.LOGICAL_EXPRESSION, {
                operator: 'OR',
                left,
                right
            });
        }

        return left;
    }

    // AndExpression = NotExpression ('&&' NotExpression)*
    parseAndExpression() {
        let left = this.parseNotExpression();

        while (this.peek().type === 'AND') {
            this.advance(); // consume &&
            const right = this.parseNotExpression();
            left = new ASTNode(NodeType.LOGICAL_EXPRESSION, {
                operator: 'AND',
                left,
                right
            });
        }

        return left;
    }

    // NotExpression = '!' NotExpression | PrimarySelector
    parseNotExpression() {
        if (this.peek().type === 'NOT') {
            this.advance(); // consume !
            const operand = this.parseNotExpression(); // right-associative
            return new ASTNode(NodeType.NEGATION_EXPRESSION, { operand });
        }

        return this.parsePrimarySelector();
    }

    // PrimarySelector = '(' OrExpression ')' | SelectorChain
    parsePrimarySelector() {
        // Handle grouped expressions
        if (this.peek().type === 'LPAREN') {
            this.advance(); // consume (
            const expr = this.parseOrExpression(); // restart from lowest precedence
            this.expect('RPAREN');
            return expr;
        }

        // Parse traditional selector chain (backward compatibility)
        return this.parseSelectorChain();
    }

    // SelectorChain = Selector+
    parseSelectorChain() {
        const selectors = [];

        while (this.isSelectorToken(this.peek())) {
            selectors.push(this.parseSelector());
        }

        // If single selector, return it directly
        // If multiple selectors, wrap in implicit AND
        if (selectors.length === 0) return null;
        if (selectors.length === 1) return selectors[0];

        // Multiple selectors in chain = implicit AND
        let result = selectors[0];
        for (let i = 1; i < selectors.length; i++) {
            result = new ASTNode(NodeType.LOGICAL_EXPRESSION, {
                operator: 'AND',
                left: result,
                right: selectors[i]
            });
        }

        return result;
    }

    isSelectorToken(token) {
        return ['SELECTOR', 'TEXT', 'SIZE', 'POSITION', 'ZINDEX',
            'HAS_CHILD', 'HAS_TEXT', 'NTH_PARENT', 'VISIBLE', 'VIEWPORT', 'HAS', 'STYLE', 'VARIABLE_REF', 'LPAREN'].includes(token.type);
    }

    // Selector = CSSSelector | PseudoSelector | VariableRef
    parseSelector() {
        const token = this.peek();

        if (token.type === 'SELECTOR') {
            this.advance();
            return new ASTNode(NodeType.SELECTOR, {
                kind: 'css',
                value: token.value
            });
        }

        if (token.type === 'VARIABLE_REF') {
            this.advance();
            return new ASTNode(NodeType.SELECTOR, {
                kind: 'variable',
                value: token.value
            });
        }

        // Pseudo selector
        return this.parsePseudoSelector();
    }

    // PseudoSelector = ':name' '(' args ')'
    parsePseudoSelector() {
        const token = this.advance();
        const name = token.value.replace(':', '');
        let args = [];

        // Check for arguments
        if (this.peek().type === 'LPAREN') {
            this.advance(); // skip (
            args = this.parsePseudoArgs();
            this.expect('RPAREN');
        }

        return new ASTNode(NodeType.PSEUDO_SELECTOR, { name, args });
    }

    // PseudoArgs = Arg (',' Arg)*
    parsePseudoArgs() {
        const args = [];
        let currentArg = '';

        while (this.peek().type !== 'RPAREN' && !this.isEOF()) {
            const token = this.peek();

            if (token.type === 'COMMA') {
                if (currentArg) {
                    args.push({ type: 'string', value: currentArg.trim() });
                    currentArg = '';
                }
                this.advance(); // skip comma
            } else {
                // Combine tokens into a single argument string until comma or RPAREN
                // This handles "width: 1200px" or "1px solid red" naturally
                currentArg += this.advance().value + ' ';
            }
        }

        if (currentArg) {
            args.push({ type: 'string', value: currentArg.trim() });
        }

        return args;
    }
    // Action = ActionName ('(' args ')')? | VariableRef
    parseAction() {
        const token = this.peek();

        if (token.type === 'VARIABLE_REF') {
            this.advance();
            return new ASTNode(NodeType.ACTION, {
                name: token.value,
                isVariable: true,
                args: []
            });
        }

        // Accept ACTION token or SELECTOR token (for custom functions)
        // We consumed peek(), so need to advance
        this.advance();

        const name = token.value.replace('-', '');
        let args = [];

        // Phase 1: Check for parentheses (all actions can have them now)
        if (this.peek().type === 'LPAREN') {
            this.advance(); // skip (

            // Allow arguments for ALL actions if parentheses are used.
            // This supports both standard actions and custom function calls.
            // Validation of argument count/type can happen at runtime/compile time.
            args = this.parseActionArgs();

            this.expect('RPAREN');
        }

        return new ASTNode(NodeType.ACTION, { name, args });
    }

    // ActionArgs = Arg (',' Arg)*
    parseActionArgs() {
        const args = [];

        // Stop tokens that indicate start of new rule/block
        const stopTokens = ['LPAREN', 'SELECTOR', 'VARIABLE_REF', 'TEXT', 'SIZE',
            'POSITION', 'ZINDEX', 'HAS_CHILD', 'HAS_TEXT', 'VISIBLE', 'VIEWPORT',
            'HAS', 'STYLE', 'DOMAIN', 'GLOBAL', 'GROUP', 'IF', 'RBRACE'];

        while (this.peek().type !== 'RPAREN' && !this.isEOF()) {
            const token = this.peek();

            // Stop if we hit a selector-like token (likely next rule)
            if (stopTokens.includes(token.type)) {
                break;
            }

            if (token.type === 'STRING') {
                args.push(this.advance().value);
            } else if (token.type === 'NUMBER') {
                args.push(this.advance().value);
            } else if (token.type === 'COMMA') {
                this.advance();
            } else {
                args.push(this.advance().value);
            }
        }

        return args;
    }

    // Condition = expr operator expr
    parseCondition() {
        let condition = '';

        while (this.peek().type !== 'RPAREN' && !this.isEOF()) {
            condition += this.advance().value + ' ';
        }

        return condition.trim();
    }

    // Phase 1: New parser methods

    // Parse action, action block, or guarded action
    parseActionOrBlock() {
        // Check for action block { }
        if (this.peek().type === 'LBRACE') {
            return this.parseActionBlock();
        }

        // Parse single action
        const action = this.parseAction();

        // Check for guard (when)
        if (this.peek().type === 'WHEN') {
            this.advance(); // consume 'when'
            const condition = this.parseGuardCondition();
            return new ASTNode(NodeType.GUARDED_ACTION, { action, condition });
        }

        return action;
    }

    // Parse action block { action1(); action2(); }
    parseActionBlock() {
        this.expect('LBRACE');
        const actions = [];

        while (this.peek().type !== 'RBRACE' && !this.isEOF()) {
            // Skip semicolons
            if (this.peek().type === 'SEMICOLON') {
                this.advance();
                continue;
            }

            actions.push(this.parseAction());

            // Optional semicolon separator
            if (this.peek().type === 'SEMICOLON') {
                this.advance();
            }
        }

        this.expect('RBRACE');

        // Check for guard on entire block
        if (this.peek().type === 'WHEN') {
            this.advance();
            const condition = this.parseGuardCondition();
            return new ASTNode(NodeType.GUARDED_ACTION, {
                action: new ASTNode(NodeType.ACTION_BLOCK, { actions }),
                condition
            });
        }

        return new ASTNode(NodeType.ACTION_BLOCK, { actions });
    }

    // Parse guard condition (comparison or pseudo-selector or logical expr)
    parseGuardCondition() {
        // Check for property access (@property)
        if (this.peek().type === 'AT') {
            return this.parseComparison();
        }

        // Check for pseudo-selector (:visible, :has-ads, etc)
        // Parse just the single pseudo-selector, not a chain
        if (this.peek().type === 'COLON' || this.isPseudoSelector(this.peek().type)) {
            const pseudoSelector = this.parseSelector(); // Parse single selector only

            // Check if next token is a logical operator (continue parsing if so)
            if (this.peek().type === 'AND' || this.peek().type === 'OR') {
                // Build a logical expression with the pseudo-selector as the left side
                return this.buildLogicalExpression(pseudoSelector);
            }

            return pseudoSelector;
        }

        // For other cases (CSS selectors), parse carefully
        return this.parseGuardSelectorExpression();
    }

    // Build logical expression starting from a left operand
    buildLogicalExpression(left) {
        let result = left;

        while (this.peek().type === 'AND' || this.peek().type === 'OR') {
            const operator = this.peek().type;
            this.advance(); // consume operator

            // Parse right side (single selector or comparison)
            let right;
            if (this.peek().type === 'AT') {
                right = this.parseComparison();
            } else {
                right = this.parseSelector();
            }

            result = new ASTNode(NodeType.LOGICAL_EXPRESSION, {
                operator: operator === 'AND' ? 'AND' : 'OR',
                left: result,
                right
            });
        }

        return result;
    }

    // Parse a limited selector expression for guards (stops at rule boundaries)
    parseGuardSelectorExpression() {
        // Parse single CSS selector, stop before continuing the chain
        const selector = this.parseSelector();

        // Check if next token is a logical operator (continue parsing if so)
        if (this.peek().type === 'AND' || this.peek().type === 'OR') {
            return this.buildLogicalExpression(selector);
        }

        return selector;
    }

    // Parse property comparison (@width < 200 or @text.contains("foo"))
    parseComparison() {
        this.expect('AT');
        const propertyToken = this.advance();
        const property = propertyToken.value;

        // Expect comparison operator OR method call
        const operatorToken = this.advance();
        let operator;
        let methodMode = false;

        // Check for standard operators
        switch (operatorToken.type) {
            case 'LT': operator = '<'; break;
            case 'GT': operator = '>'; break;
            case 'EQ': operator = '=='; break;
            case 'LTE': operator = '<='; break;
            case 'GTE': operator = '>='; break;
            // Support method-style operators (e.g. .contains)
            case 'SELECTOR':
                if (operatorToken.value.startsWith('.')) {
                    operator = operatorToken.value.substring(1); // remove dot
                    methodMode = true;
                } else {
                    throw new Error(`Expected comparison operator, got ${operatorToken.value} at line ${operatorToken.line}`);
                }
                break;
            default:
                throw new Error(`Expected comparison operator, got ${operatorToken.type} at line ${operatorToken.line}`);
        }

        let value;

        if (methodMode) {
            // Method call syntax: @prop.method(value)
            this.expect('LPAREN');
            const valueToken = this.advance();

            if (valueToken.type === 'STRING' || valueToken.type === 'NUMBER' || valueToken.type === 'SELECTOR' || valueToken.type === 'VARIABLE_REF') {
                value = valueToken.value;
            } else {
                throw new Error(`Expected argument for ${operator}, got ${valueToken.type}`);
            }
            this.expect('RPAREN');

        } else {
            // Standard syntax: @prop < value
            const valueToken = this.advance();
            if (valueToken.type === 'NUMBER') {
                value = parseFloat(valueToken.value);
            } else if (valueToken.type === 'STRING') {
                value = valueToken.value;
            } else if (valueToken.type === 'SELECTOR' || valueToken.type === 'VARIABLE_REF') {
                // It's a variable reference or parameter name
                value = valueToken.value;
            } else {
                throw new Error(`Expected comparison value (number or variable), got ${valueToken.type} at line ${valueToken.line}`);
            }
        }

        return new ASTNode(NodeType.COMPARISON, { property, operator, value, isVariable: (typeof value === 'string') });
    }

    // Helper to check if token is a pseudo-selector
    isPseudoSelector(type) {
        const pseudoTypes = ['TEXT', 'SIZE', 'POSITION', 'ZINDEX', 'HAS_CHILD', 'HAS_TEXT',
            'VISIBLE', 'VIEWPORT', 'HAS', 'STYLE', 'ASPECT_RATIO', 'COMMON_DIMENSIONS',
            'LAYOUT_SHIFT', 'STICKY', 'AUTO_PLAY', 'OPENS_POPUP', 'LAZY_LOADED',
            'SCROLL_TRIGGERED', 'CONTAINS_IMAGE', 'EXTERNAL_DOMAIN', 'DISTRACTION_SCORE',
            'PROMOTED_CONTENT', 'OVERLAY_MODAL', 'COUNTDOWN_TIMER', 'EMPTY_AFTER_BLOCK',
            'SIBLING_MATCH', 'NTH_PARENT'];
        return pseudoTypes.includes(type);
    }
}

// Export for use
if (typeof module !== 'undefined') {
    module.exports = { Parser, ASTNode, NodeType };
}
if (typeof window !== 'undefined') {
    window.MaParser = { Parser, ASTNode, NodeType };
} else if (typeof self !== 'undefined') {
    self.MaParser = { Parser, ASTNode, NodeType };
}
