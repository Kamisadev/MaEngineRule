// MaScript Lexer (from Ma Engine)s ZenScript source code
// Part of Ma Engine - Content Optimization Tool

const TokenType = {
    // Literals
    SELECTOR: 'SELECTOR',       // .class, #id, div, [attr]
    STRING: 'STRING',           // "text" or 'text'
    REGEX: 'REGEX',             // /pattern/flags
    NUMBER: 'NUMBER',           // 123, 50%

    // Variables
    VARIABLE_DEF: 'VARIABLE_DEF',   // $name =
    VARIABLE_REF: 'VARIABLE_REF',   // $name
    EQUALS: 'EQUALS',               // =

    // Logical operators
    AND: 'AND',                     // &&
    OR: 'OR',                       // ||
    NOT: 'NOT',                     // !

    // Keywords
    DOMAIN: 'DOMAIN',           // @domain
    GLOBAL: 'GLOBAL',           // @global
    IF: 'IF',                   // @if
    GROUP: 'GROUP',             // @group
    IMPORT: 'IMPORT',           // @import
    FN: 'FN',                   // fn (function definition)

    // Pseudo selectors
    TEXT: 'TEXT',               // :text
    SIZE: 'SIZE',               // :size
    POSITION: 'POSITION',       // :position
    ZINDEX: 'ZINDEX',           // :zindex
    HAS_CHILD: 'HAS_CHILD',     // :has-child
    HAS_TEXT: 'HAS_TEXT',       // :has-text
    NTH_PARENT: 'NTH_PARENT',   // :nth-parent
    VISIBLE: 'VISIBLE',         // :visible
    VIEWPORT: 'VIEWPORT',       // :viewport
    HAS: 'HAS',                 // :has (native CSS)
    STYLE: 'STYLE',             // :style(prop: value)

    // New advanced pseudo-selectors
    ASPECT_RATIO: 'ASPECT_RATIO',           // :aspect-ratio
    COMMON_DIMENSIONS: 'COMMON_DIMENSIONS', // :common-dimensions
    LAYOUT_SHIFT: 'LAYOUT_SHIFT',           // :layout-shift
    STICKY: 'STICKY',                       // :sticky
    AUTO_PLAY: 'AUTO_PLAY',                 // :auto-play
    OPENS_POPUP: 'OPENS_POPUP',             // :opens-popup
    LAZY_LOADED: 'LAZY_LOADED',             // :lazy-loaded
    SCROLL_TRIGGERED: 'SCROLL_TRIGGERED',   // :scroll-triggered
    CONTAINS_IMAGE: 'CONTAINS_IMAGE',       // :contains-image
    EXTERNAL_DOMAIN: 'EXTERNAL_DOMAIN',     // :external-domain
    DISTRACTION_SCORE: 'DISTRACTION_SCORE', // :distraction-score
    PROMOTED_CONTENT: 'PROMOTED_CONTENT',   // :promoted-content
    OVERLAY_MODAL: 'OVERLAY_MODAL',         // :overlay-modal
    COUNTDOWN_TIMER: 'COUNTDOWN_TIMER',     // :countdown-timer
    EMPTY_AFTER_BLOCK: 'EMPTY_AFTER_BLOCK', // :empty-after-block
    SIBLING_MATCH: 'SIBLING_MATCH',         // :sibling-match

    // Actions
    ARROW: 'ARROW',             // ->
    HIDE: 'HIDE',
    REMOVE: 'REMOVE',
    COLLAPSE: 'COLLAPSE',
    BLUR: 'BLUR',
    OPACITY: 'OPACITY',
    REMOVE_PARENT: 'REMOVE_PARENT',
    CLEAN_URL: 'CLEAN_URL',
    CLEAN_TEXT: 'CLEAN_TEXT',
    BLOCK: 'BLOCK',
    DELAY: 'DELAY',

    // New advanced actions
    FADE_OUT: 'FADE_OUT',               // fade-out
    REDIRECT_LINK: 'REDIRECT_LINK',     // redirect-link
    PREVENT_CLICK: 'PREVENT_CLICK',     // prevent-click
    REDUCE_ZINDEX: 'REDUCE_ZINDEX',     // reduce-zindex
    COLLAPSE_CONTAINER: 'COLLAPSE_CONTAINER', // collapse-container
    SPEED: 'SPEED',                     // speed

    // Punctuation
    LBRACE: 'LBRACE',           // {
    RBRACE: 'RBRACE',           // }
    LPAREN: 'LPAREN',           // (
    RPAREN: 'RPAREN',           // )
    COMMA: 'COMMA',             // ,
    COLON: 'COLON',             // :
    SEMICOLON: 'SEMICOLON',     // ; (for action blocks)

    // Phase 1: New tokens for advanced features
    WHEN: 'WHEN',               // when (guard keyword)
    AT: 'AT',                   // @ (property access)
    LT: 'LT',                   // < (less than)
    GT: 'GT',                   // > (greater than)
    EQ: 'EQ',                   // == (equals)
    LTE: 'LTE',                 // <= (less than or equal)
    GTE: 'GTE',                 // >= (greater than or equal)

    // Special
    COMMENT: 'COMMENT',
    NEWLINE: 'NEWLINE',
    EOF: 'EOF'
};

const KEYWORDS = {
    '@domain': TokenType.DOMAIN,
    '@global': TokenType.GLOBAL,
    '@if': TokenType.IF,
    '@group': TokenType.GROUP,
    '@import': TokenType.IMPORT,
    'when': TokenType.WHEN,
    'fn': TokenType.FN,
};

const PSEUDO_SELECTORS = {
    ':text': TokenType.TEXT,
    ':size': TokenType.SIZE,
    ':position': TokenType.POSITION,
    ':zindex': TokenType.ZINDEX,
    ':has-child': TokenType.HAS_CHILD,
    ':has-text': TokenType.HAS_TEXT,
    ':nth-parent': TokenType.NTH_PARENT,
    ':visible': TokenType.VISIBLE,
    ':viewport': TokenType.VIEWPORT,
    ':has': TokenType.HAS,
    ':style': TokenType.STYLE,

    // New advanced pseudo-selectors
    ':aspect-ratio': TokenType.ASPECT_RATIO,
    ':common-dimensions': TokenType.COMMON_DIMENSIONS,
    ':layout-shift': TokenType.LAYOUT_SHIFT,
    ':sticky': TokenType.STICKY,
    ':auto-play': TokenType.AUTO_PLAY,
    ':opens-popup': TokenType.OPENS_POPUP,
    ':lazy-loaded': TokenType.LAZY_LOADED,
    ':scroll-triggered': TokenType.SCROLL_TRIGGERED,
    ':contains-image': TokenType.CONTAINS_IMAGE,
    ':external-domain': TokenType.EXTERNAL_DOMAIN,
    ':distraction-score': TokenType.DISTRACTION_SCORE,
    ':promoted-content': TokenType.PROMOTED_CONTENT,
    ':overlay-modal': TokenType.OVERLAY_MODAL,
    ':countdown-timer': TokenType.COUNTDOWN_TIMER,
    ':empty-after-block': TokenType.EMPTY_AFTER_BLOCK,
    ':sibling-match': TokenType.SIBLING_MATCH,
};

const ACTIONS = {
    'hide': TokenType.HIDE,
    'remove': TokenType.REMOVE,
    'collapse': TokenType.COLLAPSE,
    'blur': TokenType.BLUR,
    'opacity': TokenType.OPACITY,
    'remove-parent': TokenType.REMOVE_PARENT,
    'clean-url': TokenType.CLEAN_URL,
    'clean-text': TokenType.CLEAN_TEXT,
    'block': TokenType.BLOCK,
    'delay': TokenType.DELAY,

    // New advanced actions
    'fade-out': TokenType.FADE_OUT,
    'redirect-link': TokenType.REDIRECT_LINK,
    'prevent-click': TokenType.PREVENT_CLICK,
    'reduce-zindex': TokenType.REDUCE_ZINDEX,
    'collapse-container': TokenType.COLLAPSE_CONTAINER,
    'speed': TokenType.SPEED,
};

class Token {
    constructor(type, value, line, column) {
        this.type = type;
        this.value = value;
        this.line = line;
        this.column = column;
    }
}

class Lexer {
    constructor(source) {
        this.source = source;
        this.pos = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
    }

    peek(offset = 0) {
        return this.source[this.pos + offset] || '\0';
    }

    advance() {
        const char = this.source[this.pos++];
        if (char === '\n') {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }
        return char;
    }

    skipWhitespace() {
        while (/[ \t]/.test(this.peek())) {
            this.advance();
        }
    }

    isEOF() {
        return this.pos >= this.source.length;
    }

    readString(quote) {
        const start = { line: this.line, column: this.column };
        this.advance(); // skip opening quote
        let value = '';

        while (!this.isEOF() && this.peek() !== quote) {
            if (this.peek() === '\\') {
                this.advance();
                value += this.advance();
            } else {
                value += this.advance();
            }
        }

        if (this.peek() === quote) {
            this.advance(); // skip closing quote
        }

        return new Token(TokenType.STRING, value, start.line, start.column);
    }

    readRegex() {
        const start = { line: this.line, column: this.column };
        this.advance(); // skip opening /
        let pattern = '';
        let flags = '';

        while (!this.isEOF() && this.peek() !== '/') {
            if (this.peek() === '\\') {
                pattern += this.advance();
                pattern += this.advance();
            } else {
                pattern += this.advance();
            }
        }

        if (this.peek() === '/') {
            this.advance(); // skip closing /
            // Read flags
            while (/[gimsuy]/.test(this.peek())) {
                flags += this.advance();
            }
        }

        return new Token(TokenType.REGEX, { pattern, flags }, start.line, start.column);
    }

    readNumber() {
        const start = { line: this.line, column: this.column };
        let value = '';

        while (/[\d.%xX*><]/.test(this.peek())) {
            value += this.advance();
        }

        return new Token(TokenType.NUMBER, value, start.line, start.column);
    }

    readIdentifier() {
        const start = { line: this.line, column: this.column };
        let value = '';

        // Include @ for keywords, : for pseudo selectors
        if (this.peek() === '@' || this.peek() === ':') {
            value += this.advance();
        }

        while (/[\w-]/.test(this.peek())) {
            value += this.advance();
        }

        // Check for keywords
        if (KEYWORDS[value]) {
            return new Token(KEYWORDS[value], value, start.line, start.column);
        }

        // Check for pseudo selectors
        if (PSEUDO_SELECTORS[value]) {
            return new Token(PSEUDO_SELECTORS[value], value, start.line, start.column);
        }

        // Check for actions
        if (ACTIONS[value]) {
            return new Token(ACTIONS[value], value, start.line, start.column);
        }

        return new Token(TokenType.SELECTOR, value, start.line, start.column);
    }

    readSelector() {
        const start = { line: this.line, column: this.column };
        let value = '';

        // Read CSS-like selector including [], *, ^=, $=, etc.
        while (!this.isEOF()) {
            const char = this.peek();

            // Stop at these characters
            if (/[\s{},():.]/.test(char) && value.length > 0) {
                // But allow : if it's part of pseudo-class inside []
                if (char === ':' && !value.includes('[')) break;
                if (char !== ':') break;
            }

            // Handle brackets
            if (char === '[') {
                value += this.advance();
                while (!this.isEOF() && this.peek() !== ']') {
                    value += this.advance();
                }
                if (this.peek() === ']') value += this.advance();
                continue;
            }

            // Handle arrow
            if (char === '-' && this.peek(1) === '>') break;

            // Normal characters
            if (/[\w.#*^$=\-\[\]">+~]/.test(char)) {
                value += this.advance();
            } else {
                break;
            }
        }

        return new Token(TokenType.SELECTOR, value.trim(), start.line, start.column);
    }

    readComment() {
        const start = { line: this.line, column: this.column };
        let value = '';

        if (this.peek() === '#' && this.peek(1) === '#' && this.peek(2) === '#') {
            // Multi-line comment
            this.advance(); this.advance(); this.advance();
            while (!this.isEOF()) {
                if (this.peek() === '#' && this.peek(1) === '#' && this.peek(2) === '#') {
                    this.advance(); this.advance(); this.advance();
                    break;
                }
                value += this.advance();
            }
        } else {
            // Single-line comment
            this.advance(); // skip #
            while (!this.isEOF() && this.peek() !== '\n') {
                value += this.advance();
            }
        }

        return new Token(TokenType.COMMENT, value.trim(), start.line, start.column);
    }

    readVariable() {
        const start = { line: this.line, column: this.column };
        this.advance(); // skip $
        let name = '';

        while (/[\w_]/.test(this.peek())) {
            name += this.advance();
        }

        return new Token(TokenType.VARIABLE_REF, name, start.line, start.column);
    }

    tokenize() {
        while (!this.isEOF()) {
            this.skipWhitespace();

            if (this.isEOF()) break;

            const char = this.peek();
            const start = { line: this.line, column: this.column };

            // Newline
            if (char === '\n') {
                this.advance();
                this.tokens.push(new Token(TokenType.NEWLINE, '\n', start.line, start.column));
                continue;
            }

            // Comments
            if (char === '#' || (char === '/' && this.peek(1) === '/')) {
                this.tokens.push(this.readComment());
                continue;
            }

            // Strings
            if (char === '"' || char === "'") {
                this.tokens.push(this.readString(char));
                continue;
            }

            // Regex
            if (char === '/' && this.peek(1) !== '/') {
                this.tokens.push(this.readRegex());
                continue;
            }

            // Arrow
            if (char === '-' && this.peek(1) === '>') {
                this.advance(); this.advance();
                this.tokens.push(new Token(TokenType.ARROW, '->', start.line, start.column));
                continue;
            }

            // Logical AND
            if (char === '&' && this.peek(1) === '&') {
                this.advance(); this.advance();
                this.tokens.push(new Token(TokenType.AND, '&&', start.line, start.column));
                continue;
            }

            // Logical OR
            if (char === '|' && this.peek(1) === '|') {
                this.advance(); this.advance();
                this.tokens.push(new Token(TokenType.OR, '||', start.line, start.column));
                continue;
            }

            // Logical NOT (only if not inside brackets for CSS attribute selectors)
            if (char === '!') {
                // Check if we're at the start of a selector (not inside [...])
                // Simple heuristic: ! at beginning or after whitespace/operators
                const lastToken = this.tokens[this.tokens.length - 1];
                const isOperatorContext = !lastToken ||
                    ['AND', 'OR', 'NOT', 'LPAREN', 'LBRACE', 'ARROW', 'NEWLINE'].includes(lastToken.type);

                if (isOperatorContext) {
                    this.advance();
                    this.tokens.push(new Token(TokenType.NOT, '!', start.line, start.column));
                    continue;
                }
                // Otherwise, it's part of CSS attribute selector, let readSelector handle it
            }

            // Punctuation
            if (char === '{') {
                this.advance();
                this.tokens.push(new Token(TokenType.LBRACE, '{', start.line, start.column));
                continue;
            }
            if (char === '}') {
                this.advance();
                this.tokens.push(new Token(TokenType.RBRACE, '}', start.line, start.column));
                continue;
            }
            if (char === '(') {
                this.advance();
                this.tokens.push(new Token(TokenType.LPAREN, '(', start.line, start.column));
                continue;
            }
            if (char === ')') {
                this.advance();
                this.tokens.push(new Token(TokenType.RPAREN, ')', start.line, start.column));
                continue;
            }
            if (char === ',') {
                this.advance();
                this.tokens.push(new Token(TokenType.COMMA, ',', start.line, start.column));
                continue;
            }

            if (char === ';') {
                this.advance();
                this.tokens.push(new Token(TokenType.SEMICOLON, ';', start.line, start.column));
                continue;
            }

            // Comparison operators (must come before single = check)
            if (char === '=' && this.peek(1) === '=') {
                this.advance(); this.advance();
                this.tokens.push(new Token(TokenType.EQ, '==', start.line, start.column));
                continue;
            }
            if (char === '<' && this.peek(1) === '=') {
                this.advance(); this.advance();
                this.tokens.push(new Token(TokenType.LTE, '<=', start.line, start.column));
                continue;
            }
            if (char === '>' && this.peek(1) === '=') {
                this.advance(); this.advance();
                this.tokens.push(new Token(TokenType.GTE, '>=', start.line, start.column));
                continue;
            }
            if (char === '<') {
                this.advance();
                this.tokens.push(new Token(TokenType.LT, '<', start.line, start.column));
                continue;
            }
            if (char === '>') {
                this.advance();
                this.tokens.push(new Token(TokenType.GT, '>', start.line, start.column));
                continue;
            }

            // Equals sign (for variable definitions)
            if (char === '=') {
                this.advance();
                this.tokens.push(new Token(TokenType.EQUALS, '=', start.line, start.column));
                continue;
            }

            // Variables
            if (char === '$') {
                this.tokens.push(this.readVariable());
                continue;
            }

            // Property access (@property) - must come before keyword check
            // Check if @ is followed by a lowercase letter (property) vs uppercase/prefixed (keyword)
            if (char === '@') {
                // Check if it's a known keyword first
                let word = '@';
                let i = 1;
                while (/[\w-]/.test(this.peek(i))) {
                    word += this.peek(i);
                    i++;
                }

                if (!KEYWORDS[word] && /[a-z]/.test(this.peek(1))) {
                    const start = { line: this.line, column: this.column };
                    this.advance(); // skip @
                    this.tokens.push(new Token(TokenType.AT, '@', start.line, start.column));
                    // The identifier will be read by the next iteration
                    continue;
                }
                // If it IS a keyword, fall through to the keyword matcher below
            }

            // Fallback for isolated colon (e.g. in arguments)
            if (char === ':') {
                // If it's a pseudo-selector start, readIdentifier captures it.
                // But if it's just a colon inside an arg list (width: 100px), readIdentifier returns just ":" which is fine as SELECTOR.
                // BUT, to be safer, let's peek ahead. If followed by space or number, it's likely a separator.
                const next = this.peek(1);
                if (/\s/.test(next) || /\d/.test(next)) {
                    this.advance();
                    this.tokens.push(new Token(TokenType.COLON, ':', start.line, start.column));
                    continue;
                }
            }

            // Keywords and pseudo selectors
            if (char === '@' || char === ':') {
                const token = this.readIdentifier();
                this.tokens.push(token);

                // Special handling for :has - capture the entire nested selector
                if (token.type === TokenType.HAS && this.peek() === '(') {
                    this.advance(); // skip (
                    let nested = '';
                    let parenDepth = 1;

                    while (!this.isEOF() && parenDepth > 0) {
                        const c = this.peek();
                        if (c === '(') parenDepth++;
                        else if (c === ')') parenDepth--;

                        if (parenDepth > 0) {
                            nested += this.advance();
                        } else {
                            this.advance(); // skip closing )
                        }
                    }

                    // Add the nested content as a raw string token
                    this.tokens.push(new Token(TokenType.LPAREN, '(', start.line, start.column));
                    this.tokens.push(new Token(TokenType.STRING, nested, start.line, start.column));
                    this.tokens.push(new Token(TokenType.RPAREN, ')', start.line, start.column));
                }
                continue;
            }

            // Numbers
            if (/[\d><=*]/.test(char) && /[\d><=*x]/.test(this.peek(1))) {
                this.tokens.push(this.readNumber());
                continue;
            }

            // Selectors and identifiers
            if (/[\w.#\[\*]/.test(char)) {
                // Check if it's a bare keyword (like 'when') before reading as selector
                if (/[a-z]/.test(char)) {
                    let word = '';
                    let tempPos = this.pos;
                    while (tempPos < this.source.length && /[\w-]/.test(this.source[tempPos])) {
                        word += this.source[tempPos++];
                    }

                    // Check if it's a keyword or action
                    if (KEYWORDS[word]) {
                        const token = this.readIdentifier();
                        this.tokens.push(token);
                        continue;
                    }
                    if (ACTIONS[word]) {
                        const token = this.readIdentifier();
                        this.tokens.push(token);
                        continue;
                    }
                }

                this.tokens.push(this.readSelector());
                continue;
            }

            // Unknown - skip
            this.advance();
        }

        this.tokens.push(new Token(TokenType.EOF, '', this.line, this.column));
        return this.tokens;
    }
}

// Export for use
if (typeof module !== 'undefined') {
    module.exports = { Lexer, Token, TokenType };
}
if (typeof window !== 'undefined') {
    window.MaLexer = { Lexer, Token, TokenType };
} else if (typeof self !== 'undefined') {
    self.MaLexer = { Lexer, Token, TokenType };
}
