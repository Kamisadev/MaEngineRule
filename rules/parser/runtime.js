// Ma Engine Runtime Environmentcutes compiled rules in browser
// Part of Ma Engine - Content Optimization Tool

class MaRuntime {
    constructor() {
        this.compiledRules = null;
        this.styleElement = null;
        this.hostname = window.location.hostname;
        this.mainDomain = this.getMainDomain(this.hostname);
        this.removedCount = 0;
        this.removedDetails = {
            ma_core: 0,    // Standard rules
            ma_cleaner: 0, // Visual cleanup
            ma_privacy: 0  // Privacy/URL rules
        };
        this.observer = null;
        this.processedElements = new WeakSet(); // Track processed elements
        this.shadowContainer = null;
        this.processedElements = new WeakSet(); // Track processed elements
        this.shadowContainer = null;
        this.shadowRoot = null;
        this.functions = new Map(); // Global functions
    }

    // ========== SHADOW DOM SUPPORT ==========

    // Get all elements including those in Shadow DOM
    querySelectorAllDeep(selector, root = document) {
        const elements = [...root.querySelectorAll(selector)];

        // Search in shadow roots
        const allElements = root.querySelectorAll('*');
        for (const el of allElements) {
            if (el.shadowRoot) {
                elements.push(...this.querySelectorAllDeep(selector, el.shadowRoot));
            }
        }

        return elements;
    }

    // Get all elements for scanning (including Shadow DOM)
    getAllElements(root = document) {
        const elements = [...root.querySelectorAll('*')];

        for (const el of [...elements]) {
            if (el.shadowRoot) {
                elements.push(...this.getAllElements(el.shadowRoot));
            }
        }

        return elements;
    }

    // ========== IFRAME SUPPORT ==========

    // Try to access same-origin iframes
    scanIframes() {
        const iframes = document.querySelectorAll('iframe');

        for (const iframe of iframes) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (doc && doc.body) {
                    this.executeJSRulesInDocument(doc);
                }
            } catch {
                // Cross-origin iframe - can't access
            }
        }
    }

    getMainDomain(host) {
        const parts = host.split('.');
        return parts.length >= 2 ? parts.slice(-2).join('.') : host;
    }

    // Load and compile MaScript source
    async loadRules(source) {
        const { compileMaScript } = window.MaCompiler;
        this.compiledRules = compileMaScript(source);
        return this.compiledRules;
    }

    // Set pre-compiled rules
    setRules(compiled) {
        this.compiledRules = compiled;
        this.functions = new Map(Object.entries(compiled.functions || {}));
    }

    // Execute all rules
    execute() {
        if (!this.compiledRules) return;

        // 1. Inject CSS rules (fast path)
        this.injectCSS();

        // 2. Execute JS rules (complex matching)
        this.executeJSRules();

        // 3. Setup observer for dynamic content
        this.setupObserver();
    }

    // Inject compiled CSS
    injectCSS() {
        if (this.styleElement && this.styleElement.isConnected) return;
        if (!this.compiledRules.css) return;

        // Create style element if not exists
        if (!this.styleElement) {
            this.styleElement = document.createElement('style');
            this.styleElement.id = 'mascript-styles';
            this.styleElement.textContent = this.compiledRules.css;
        }

        // Try to inject
        const target = document.head || document.documentElement;
        if (target) {
            target.appendChild(this.styleElement);
        } else {
            // Wait for documentElement
            const observer = new MutationObserver(() => {
                if (document.head || document.documentElement) {
                    (document.head || document.documentElement).appendChild(this.styleElement);
                    observer.disconnect();
                }
            });
            observer.observe(document, { childList: true, subtree: true });
        }

        // Ensure it stays injected
        if (!this._cssObserver) {
            this._cssObserver = new MutationObserver(() => {
                if (this.styleElement && !this.styleElement.isConnected) {
                    (document.head || document.documentElement).appendChild(this.styleElement);
                }
            });
            this._cssObserver.observe(document.documentElement, { childList: true });
        }
    }

    // Remove injected CSS
    removeCSS() {
        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }
        if (this._cssObserver) {
            this._cssObserver.disconnect();
            this._cssObserver = null;
        }
    }

    // ========== STEALTH SHADOW INJECTION ==========

    // Create a hidden, closed-mode shadow root to store removed elements
    ensureShadowContainer() {
        if (this.shadowContainer && this.shadowContainer.isConnected) return;

        try {
            // Create host element
            this.shadowContainer = document.createElement('div');
            // Use a non-obvious name/style to avoid simple detection
            this.shadowContainer.style.display = 'none';
            this.shadowContainer.style.setProperty('display', 'none', 'important');
            this.shadowContainer.style.width = '0px';
            this.shadowContainer.style.height = '0px';
            this.shadowContainer.style.overflow = 'hidden';
            this.shadowContainer.style.visibility = 'hidden';

            // Attach closed shadow root - WEB SCRIPTS CANNOT ACCESS THIS
            this.shadowRoot = this.shadowContainer.attachShadow({ mode: 'closed' });

            // Append to document
            (document.body || document.documentElement).appendChild(this.shadowContainer);
        } catch (e) {
            console.error('[ZenRuntime] Failed to create shadow container:', e);
        }
    }

    // Move element to shadow DOM (Stealth removal)
    translocateToShadow(el) {
        this.ensureShadowContainer();
        if (!this.shadowRoot) {
            el.remove(); // Fallback
            return;
        }

        try {
            // Optional: Strip identifiable attributes before moving to prevent detection via some advanced scans
            // but keep them in shadow in case we need to restore? 
            // For now, just move.
            this.shadowRoot.appendChild(el);
        } catch (e) {
            el.remove();
        }
    }

    // Execute JS-based rules
    executeJSRules() {
        if (!this.compiledRules || !this.compiledRules.js) return;

        // Execute rules in main document
        this.executeJSRulesInDocument(document);

        // Execute roles in iframes
        this.scanIframes();
    }

    // Execute rules in a specific document/root
    executeJSRulesInDocument(root) {
        if (!this.compiledRules.js) return;

        for (const rule of this.compiledRules.js) {
            // Check domain match
            if (!this.matchesDomain(rule.domains)) continue;

            // Check condition if any
            if (rule.condition && !this.evaluateCondition(rule.condition)) continue;

            // Execute rule with the given root
            this.executeRule(rule, root);
        }
    }

    // Check if current domain matches rule domains
    matchesDomain(domains) {
        if (!domains || domains.includes('*')) return true;

        for (const domain of domains) {
            // Exclusion
            if (domain.startsWith('!')) {
                if (this.hostname.includes(domain.slice(1))) return false;
                continue;
            }

            // Wildcard
            if (domain.startsWith('*.')) {
                const suffix = domain.slice(2);
                if (this.hostname.endsWith(suffix)) return true;
                continue;
            }

            // Exact match
            if (this.hostname === domain || this.hostname.endsWith('.' + domain)) {
                return true;
            }
        }

        return domains.some(d => d.startsWith('!'));
    }

    // Evaluate runtime condition
    // Evaluate guard condition
    evaluateCondition(element, condition, context = {}) {
        // Handle both parser output ('ComparisonExpression') and compiler output ('Comparison')
        if (condition.type === 'ComparisonExpression' || condition.type === 'Comparison') {
            return this.evaluateComparison(element, condition, context);
        }

        if (condition.check) {
            // Pseudo-selector condition
            return this.matchJSSelector(element, condition);
        }

        // Logical expression
        return this.evaluateExpression(element, condition);
    }



    evaluateComparison(target, condition, context) {
        const { property, operator, value } = condition;

        // Resolve right-hand value (handle parameters)
        let rightVal = value;
        if (typeof value === 'string' && context[value] !== undefined) {
            rightVal = context[value];
        }

        const propValue = this.getElementProperty(target, property);

        console.log(`[DEBUG] Compare: ${property}(${propValue}) ${operator} ${rightVal} (raw: ${value})`);

        return this.compare(propValue, operator, rightVal);
    }

    getElementProperty(el, prop) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);

        switch (prop) {
            case 'width': return rect.width;
            case 'height': return rect.height;
            case 'top': return rect.top;
            case 'left': return rect.left;
            case 'right': return rect.right;
            case 'bottom': return rect.bottom;
            case 'text': return el.textContent || '';
            case 'children': return el.children.length;
            case 'opacity': return parseFloat(style.opacity);
            case 'zindex': return parseInt(style.zIndex) || 0;
            case 'id': return el.getAttribute('id') || '';
            case 'class':
                // Handle SVG elements and classList properly
                if (typeof el.className === 'string') {
                    return el.className;
                }
                // For SVG or other elements with className as object
                return el.getAttribute('class') || '';
            case 'href': return el.getAttribute('href') || '';
            case 'src': return el.getAttribute('src') || '';
            // New common attributes
            case 'rel': return el.getAttribute('rel') || '';
            case 'alt': return el.getAttribute('alt') || '';
            case 'title': return el.getAttribute('title') || '';
            case 'type': return el.getAttribute('type') || '';
            case 'name': return el.getAttribute('name') || '';
            case 'value': return el.value || el.getAttribute('value') || '';
            case 'placeholder': return el.getAttribute('placeholder') || '';
            case 'target': return el.getAttribute('target') || '';
            case 'role': return el.getAttribute('role') || '';
            default:
                // Support data-* and aria-* attributes dynamically
                if (prop.startsWith('data-') || prop.startsWith('aria-')) {
                    return el.getAttribute(prop) || '';
                }
                return '';
        }
    }


    compare(a, op, b) {
        // Ensure inputs are strings for string operators
        const strA = String(a || '');
        const strB = String(b || '');

        switch (op) {
            case '>': return a > b;
            case '<': return a < b;
            case '>=': return a >= b;
            case '<=': return a <= b;
            case '=':
            case '==':
                return a === b || strA === strB;

            // New String Operators
            case 'contains':
                // Empty search string should NOT match everything
                if (!strB || strB.length === 0) return false;
                return strA.includes(strB);
            case 'startsWith':
                if (!strB || strB.length === 0) return false;
                return strA.startsWith(strB);
            case 'endsWith':
                if (!strB || strB.length === 0) return false;
                return strA.endsWith(strB);
            case 'matches':
                try {
                    if (!strB || strB.length === 0) return false;
                    return new RegExp(strB).test(strA);
                } catch { return false; }

            default: return false;
        }
    }

    // Execute a single rule
    executeRule(rule, root = document) {
        if (!rule) return;

        let targets = [];
        try {
            // Get initial targets
            if (rule.cssSelector) {
                // Use deep selector if available
                targets = Array.from(this.querySelectorAllDeep(rule.cssSelector, root));
            } else {
                // Scan all elements if no selector (rare)
                targets = Array.from(this.getAllElements(root));
            }

            // Filter by expression
            if (rule.expression) {
                targets = targets.filter(el => this.evaluateExpression(el, rule.expression));
            }
        } catch (e) {
            console.warn('[MaScript] Error matching rule:', rule, e);
            return;
        }

        console.log(`[DEBUG] executeRule: ${rule.cssSelector || 'unknown'}, targets found: ${targets.length}`);

        targets.forEach(target => {
            if (this.processedElements.has(target)) return;

            const action = rule.action;
            if (!action) return;

            let executed = false;

            // Handle GuardedAction (top level)
            if (action.type === 'GuardedAction') {
                if (this.evaluateCondition(target, action.condition, {})) {
                    const inner = action.action;
                    if (inner.type === 'ActionBlock') {
                        executed = this.executeActionBlock(target, inner, {});
                    } else {
                        executed = this.executeAction(target, inner, {});
                    }
                }
            }
            // Handle ActionBlock
            else if (action.type === 'ActionBlock') {
                executed = this.executeActionBlock(target, action, {});
            }
            // Handle Single Action
            else {
                executed = this.executeAction(target, action, {});
            }

            // Only mark as processed if an action was actually taken
            // This allows elements to be re-evaluated if conditions change (e.g. lazy loading)
            if (executed) {
                this.processedElements.add(target);
            }
        });
    }

    // Evaluate logical expression tree
    evaluateExpression(element, expression) {
        if (!expression) return true;

        switch (expression.type) {
            case 'LogicalExpression':
                return this.evaluateLogical(element, expression);

            case 'NegationExpression':
                return !this.evaluateExpression(element, expression.operand);

            case 'Selector':
                return this.matchSelector(element, expression);

            case 'PseudoSelector':
                // Convert to old format for matchJSSelector
                const compiled = this.compilePseudoSelectorForRuntime(expression);
                return this.matchJSSelector(element, compiled);

            default:
                return true;
        }
    }

    // Evaluate logical operators with short-circuit
    evaluateLogical(element, expression) {
        const { operator, left, right } = expression;

        if (operator === 'AND') {
            // Short-circuit: stop at first false
            if (!this.evaluateExpression(element, left)) return false;
            return this.evaluateExpression(element, right);
        }

        if (operator === 'OR') {
            // Short-circuit: stop at first true
            if (this.evaluateExpression(element, left)) return true;
            return this.evaluateExpression(element, right);
        }

        return false;
    }

    // Match CSS selector with caching
    matchSelector(element, selector) {
        const css = selector.css || selector.value;
        if (!css) return false;

        // Use cache for repeated checks
        if (this.matchCache) {
            if (!this.matchCache.has(element)) {
                this.matchCache.set(element, new Map());
            }

            const elementCache = this.matchCache.get(element);
            if (elementCache.has(css)) {
                return elementCache.get(css);
            }

            try {
                const result = element.matches(css);
                elementCache.set(css, result);
                return result;
            } catch (e) {
                elementCache.set(css, false);
                return false;
            }
        }

        // No cache
        try {
            return element.matches(css);
        } catch (e) {
            return false;
        }
    }

    // Convert PseudoSelector AST to runtime format
    compilePseudoSelectorForRuntime(node) {
        // Map AST format to runtime check format
        const checkMap = {
            'text': 'textMatch',
            'size': 'sizeMatch',
            'position': 'positionMatch',
            'zindex': 'zindexMatch',
            'has-text': 'hasText',
            'visible': 'isVisible',
            'viewport': 'isInViewport',
            'smart-container': 'smartContainer',
            'shadow': 'shadowPierce',
            'style': 'styleMatch',

            // New content-optimization pseudo-selectors
            'aspect-ratio': 'aspectRatio',
            'common-dimensions': 'commonDimensions',
            'layout-shift': 'layoutShift',
            'sticky': 'sticky',
            'auto-play': 'autoPlay',
            'opens-popup': 'opensPopup',
            'lazy-loaded': 'lazyLoaded',
            'scroll-triggered': 'scrollTriggered',
            'contains-image': 'containsImage',
            'external-domain': 'externalDomain',
            'distraction-score': 'distractionScore',
            'promoted-content': 'promotedContent',
            'overlay-modal': 'overlayModal',
            'countdown-timer': 'countdownTimer',
            'empty-after-block': 'emptyAfterBlock',
            'sibling-match': 'siblingMatch'
        };

        return {
            check: checkMap[node.name] || node.name,
            ...node // Include args and other properties
        };
    }

    // Match element against JS selector
    matchJSSelector(el, selector) {
        switch (selector.check) {
            case 'textMatch':
                return this.checkTextMatch(el, selector);

            case 'sizeMatch':
                return this.checkSizeMatch(el, selector);

            case 'positionMatch':
                return this.checkPositionMatch(el, selector);

            case 'zindexMatch':
                return this.checkZIndexMatch(el, selector);

            case 'hasText':
                return this.checkHasText(el, selector);

            case 'isVisible':
                return el.offsetParent !== null;

            case 'isInViewport':
                return this.isInViewport(el);

            case 'smartContainer':
                return this.checkSmartContainer(el, selector);

            case 'shadowPierce':
                return this.checkShadowPierce(el, selector);

            case 'nthParent':
                // nth-parent is handled in action phase, always match here
                selector._levels = selector.levels;
                return true;

            // New advanced pseudo-selectors
            case 'aspectRatio':
                return this.checkAspectRatio(el, selector);

            case 'commonDimensions':
                return this.checkCommonDimensions(el);

            case 'layoutShift':
                return this.checkLayoutShift(el, selector);

            case 'sticky':
                return this.checkSticky(el);

            case 'autoPlay':
                return this.checkAutoPlay(el);

            case 'opensPopup':
                return this.checkOpensPopup(el);

            case 'lazyLoaded':
                return this.checkLazyLoaded(el, selector);

            case 'scrollTriggered':
                return this.checkScrollTriggered(el);

            case 'containsImage':
                return this.checkContainsImage(el, selector);

            case 'externalDomain':
                return this.checkExternalDomain(el);

            case 'distractionScore':
                return this.checkDistractionScore(el, selector);

            case 'promotedContent':
                return this.checkPromotedContent(el, selector);

            case 'overlayModal':
                return this.checkOverlayModal(el);

            case 'countdownTimer':
                return this.checkCountdownTimer(el);

            case 'emptyAfterBlock':
                return this.checkEmptyAfterBlock(el);

            case 'siblingMatch':
                return this.checkSiblingMatch(el, selector);

            default:
                return true;
        }
    }

    // Smart container detection for native ads
    checkSmartContainer(el, selector) {
        const text = el.textContent?.trim() || '';
        const { matcher } = selector;
        let matches = false;

        if (matcher.type === 'regex') {
            try {
                const regex = new RegExp(matcher.pattern, matcher.flags);
                matches = regex.test(text);
            } catch {
                return false;
            }
        } else {
            matches = text.toLowerCase().includes(matcher.value.toLowerCase());
        }

        if (matches) {
            // Find and store the container
            selector._targetElement = this.findPromotionalContainer(el);
            return true;
        }

        return false;
    }

    // Shadow DOM piercing
    checkShadowPierce(el, selector) {
        if (!el.shadowRoot) return false;

        try {
            const innerElements = el.shadowRoot.querySelectorAll(selector.selector || '*');
            return innerElements.length > 0;
        } catch {
            return false;
        }
    }

    // Explicit style matcher
    checkStyleMatch(el, selector) {
        const { prop, value } = selector;
        if (!prop) return true;

        const computed = window.getComputedStyle(el);
        const actual = computed.getPropertyValue(prop); // e.g. '1200px'

        if (!value) return !!actual;

        // Simple string comparison for now (can enhance later for numbers)
        return actual === value || actual.includes(value);
    }

    checkTextMatch(el, selector) {
        const { matcher, targetParent } = selector;

        // First, check if element or its children contain the text
        const text = el.textContent?.trim() || '';
        let matches = false;

        if (matcher.type === 'regex') {
            try {
                const regex = new RegExp(matcher.pattern, matcher.flags);
                matches = regex.test(text);
            } catch {
                return false;
            }
        } else {
            // Case-insensitive contains match
            matches = text.toLowerCase().includes(matcher.value.toLowerCase());
        }

        if (!matches) return false;

        // If targeting parent, find the best container
        if (targetParent && !selector._foundParent) {
            // Mark that we want to target parent in action phase
            selector._targetElement = this.findPromotionalContainer(el);
            selector._foundParent = true;
        }

        return true;
    }

    // Find the most likely ad container from a label element
    findPromotionalContainer(labelEl) {
        // Common ad container indicators
        const containerIndicators = [
            'article', 'li', 'section', 'div[class*="card"]', 'div[class*="item"]',
            'div[class*="post"]', 'div[class*="feed"]', 'div[class*="story"]'
        ];

        let current = labelEl;
        let bestContainer = labelEl.parentElement;
        let maxScore = 0;

        // Walk up the DOM tree to find suitable container
        for (let i = 0; i < 10 && current?.parentElement; i++) {
            current = current.parentElement;
            let score = 0;

            // Check if it's a semantic container
            const tagName = current.tagName.toLowerCase();
            if (['article', 'section', 'li', 'aside'].includes(tagName)) {
                score += 5;
            }

            // Check for card/item-like classes
            const className = current.className?.toLowerCase() || '';
            if (/card|item|post|feed|story|content|article/.test(className)) {
                score += 3;
            }

            // Check size - ad containers tend to be reasonably sized
            const rect = current.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 100 && rect.width < window.innerWidth * 0.8) {
                score += 2;
            }

            // Has siblings of same type (likely a list of items)
            if (current.parentElement) {
                const siblings = [...current.parentElement.children].filter(
                    c => c.tagName === current.tagName && c !== current
                );
                if (siblings.length > 0) {
                    score += 3;
                }
            }

            if (score > maxScore) {
                maxScore = score;
                bestContainer = current;
            }
        }

        return bestContainer;
    }

    checkSizeMatch(el, selector) {
        const rect = el.getBoundingClientRect();
        const { width, widthOp, height, heightOp } = selector;

        const widthMatch = width === '*' || this.compareSize(rect.width, widthOp, parseInt(width));
        const heightMatch = height === '*' || this.compareSize(rect.height, heightOp, parseInt(height));

        return widthMatch && heightMatch;
    }

    compareSize(actual, op, expected) {
        switch (op) {
            case '>': return actual > expected;
            case '<': return actual < expected;
            case '=': return Math.abs(actual - expected) < 10; // Allow 10px tolerance
            default: return Math.abs(actual - expected) < 10;
        }
    }

    checkPositionMatch(el, selector) {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        if (style.position !== selector.position) return false;

        if (selector.location) {
            const isTop = rect.top < 200;
            const isBottom = rect.bottom > window.innerHeight - 200;
            const isLeft = rect.left < 200;
            const isRight = rect.right > window.innerWidth - 200;

            switch (selector.location) {
                case 'top-left': return isTop && isLeft;
                case 'top-right': return isTop && isRight;
                case 'bottom-left': return isBottom && isLeft;
                case 'bottom-right': return isBottom && isRight;
                case 'corner': return (isTop || isBottom) && (isLeft || isRight);
                case 'fullscreen':
                    return rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8;
                default: return true;
            }
        }

        return true;
    }

    checkZIndexMatch(el, selector) {
        const zIndex = parseInt(getComputedStyle(el).zIndex) || 0;
        return this.compare(zIndex, selector.op, selector.value);
    }

    checkHasText(el, selector) {
        return el.textContent?.toLowerCase().includes(selector.text.toLowerCase());
    }

    isInViewport(el) {
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0 &&
            rect.left < window.innerWidth && rect.right > 0;
    }

    // ========== NEW ADVANCED PSEUDO-SELECTORS ==========

    // Check aspect ratio (width/height ratio with tolerance)
    checkAspectRatio(el, selector) {
        const params = selector.params || selector.args || [];
        const ratio = params[0] || '16:9';
        const tolerance = parseFloat(params[1] || '0.1');

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        const [w, h] = ratio.split(':').map(Number);
        const targetRatio = w / h;
        const actualRatio = rect.width / rect.height;
        const diff = Math.abs(actualRatio - targetRatio);

        return diff <= tolerance;
    }

    // Check if element matches common web layout dimensions
    checkCommonDimensions(el) {
        const rect = el.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);

        // Common layout dimensions (including IAB standard sizes) with 5px tolerance
        const standardSizes = [
            [728, 90],   // Leaderboard
            [300, 250],  // Medium Rectangle
            [160, 600],  // Wide Skyscraper
            [300, 600],  // Half Page
            [970, 250],  // Billboard
            [320, 50],   // Mobile Banner
            [320, 100],  // Large Mobile Banner
            [468, 60],   // Banner
            [234, 60],   // Half Banner
            [120, 600],  // Skyscraper
            [250, 250],  // Square
            [336, 280],  // Large Rectangle
            [180, 150],  // Rectangle
            [970, 90],   // Large Leaderboard
            [200, 200],  // Small Square
        ];

        return standardSizes.some(([sw, sh]) =>
            Math.abs(w - sw) <= 5 && Math.abs(h - sh) <= 5
        );
    }

    // Check if element causes layout shift (CLS detection)
    checkLayoutShift(el, selector) {
        const threshold = parseFloat(selector.params?.[0] || selector.args?.[0] || '0.1');

        // Track element position changes
        if (!this._layoutShiftTracking) {
            this._layoutShiftTracking = new WeakMap();
        }

        const rect = el.getBoundingClientRect();
        const currentTop = rect.top;

        if (this._layoutShiftTracking.has(el)) {
            const previousTop = this._layoutShiftTracking.get(el);
            const shift = Math.abs(currentTop - previousTop);
            const shiftScore = shift / window.innerHeight;

            return shiftScore > threshold;
        }

        // Store initial position
        this._layoutShiftTracking.set(el, currentTop);
        return false;
    }

    // Check if element has sticky/fixed positioning
    checkSticky(el) {
        const style = getComputedStyle(el);
        return style.position === 'fixed' || style.position === 'sticky';
    }

    // Check if video/audio element has autoplay
    checkAutoPlay(el) {
        if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
            return el.hasAttribute('autoplay') || el.autoplay === true || !el.paused;
        }

        // Check children
        const media = el.querySelector('video, audio');
        if (media) {
            return media.hasAttribute('autoplay') || media.autoplay === true || !media.paused;
        }

        return false;
    }

    // Check if element opens popups on click (heuristic)
    checkOpensPopup(el) {
        // Check for onclick handlers that call window.open
        const onclick = el.getAttribute('onclick') || '';
        if (/window\.open|popup|newwindow/i.test(onclick)) {
            return true;
        }

        // Check target attribute
        const target = el.getAttribute('target');
        if (target && /^_(blank|new)$/i.test(target)) {
            // Could be popup, but not conclusive
            return el.tagName === 'A' && /popup|window/i.test(el.href || '');
        }

        return false;
    }

    // Check if element was lazy-loaded (injected after delay)
    checkLazyLoaded(el, selector) {
        const delay = parseInt(selector.params?.[0] || selector.args?.[0] || '2000');

        if (!this._pageLoadTime) {
            this._pageLoadTime = Date.now();
        }

        // Check if element was added after the specified delay
        const elementAge = Date.now() - this._pageLoadTime;
        return elementAge > delay;
    }

    // Check if element appears on scroll (lazy-load detection)
    checkScrollTriggered(el) {
        // Use IntersectionObserver data if available
        if (!this._scrollObserver) {
            this._scrollTriggered = new WeakSet();

            this._scrollObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this._scrollTriggered.add(entry.target);
                    }
                });
            });
        }

        // Observe element if not already
        if (!this._scrollTriggered.has(el)) {
            this._scrollObserver.observe(el);
            return false;
        }

        return true;
    }

    // Check if element contains images with URL patterns
    checkContainsImage(el, selector) {
        const pattern = selector.params?.[0] || selector.args?.[0] || '';
        const regex = new RegExp(pattern, 'i');

        const images = el.querySelectorAll('img, picture source, video[poster]');
        return Array.from(images).some(img => {
            const src = img.src || img.getAttribute('src') || img.getAttribute('srcset') || img.getAttribute('poster') || '';
            return regex.test(src);
        });
    }

    // Check if link points to external domain
    checkExternalDomain(el) {
        if (el.tagName !== 'A' || !el.href) return false;

        try {
            const linkUrl = new URL(el.href);
            const currentHost = window.location.hostname;

            return linkUrl.hostname !== currentHost &&
                !linkUrl.hostname.endsWith('.' + currentHost);
        } catch {
            return false;
        }
    }

    // Heuristic scoring for distracting content
    checkDistractionScore(el, selector) {
        const threshold = parseInt(selector.params?.[0] || selector.args?.[0] || '50');
        let score = 0;

        // Signal 1: Common disruptive dimensions (+20)
        if (this.checkCommonDimensions(el)) {
            score += 20;
        }

        // Signal 2: Third-party promotional patterns (+30)
        const adPattern = /doubleclick|googlesyndication|googleadservices|taboola|outbrain|criteo|amazon-adsystem|advertising\.com|adnxs\.com/i;
        const attrs = ['src', 'href', 'data-src', 'data-href', 'action'];
        const hasAdNetwork = attrs.some(attr => {
            const value = el.getAttribute(attr);
            return value && adPattern.test(value);
        }) || Array.from(el.querySelectorAll('img, iframe, script')).some(child =>
            attrs.some(attr => {
                const val = child.getAttribute(attr);
                return val && adPattern.test(val);
            })
        );
        if (hasAdNetwork) {
            score += 30;
        }

        // Signal 3: Common distraction container position (+15)
        const rect = el.getBoundingClientRect();
        const isCommonAdZone = (
            rect.left < 10 || // Left sidebar
            rect.right > window.innerWidth - 300 || // Right sidebar
            rect.top < 100 || // Header
            rect.bottom > window.innerHeight - 100 // Footer
        );
        if (isCommonAdZone && rect.width > 100 && rect.height > 50) {
            score += 15;
        }

        // Signal 4: Obfuscated class names (+10)
        const className = el.className || '';
        const hasObfuscatedClass = /^[a-z0-9_-]{8,}$/i.test(className.split(' ')[0]);
        if (hasObfuscatedClass && className.length > 0) {
            score += 10;
        }

        // Signal 5: Ad-related attributes (+10)
        const adAttrs = ['data-ad', 'data-google-query-id', 'data-ad-slot', 'data-ad-unit', 'data-adunit'];
        if (adAttrs.some(attr => el.hasAttribute(attr))) {
            score += 10;
        }

        // Signal 6: Multiple iframes (+5)
        const iframeCount = el.querySelectorAll('iframe').length;
        if (iframeCount >= 2) {
            score += 5;
        }

        // Signal 7: Ad-related ID or class (+5)
        const idClass = (el.id + ' ' + className).toLowerCase();
        if (/ad|banner|sponsor|promo|advert/i.test(idClass)) {
            score += 5;
        }

        return score >= threshold;
    }

    // Enhanced native ad detection (v2 with better heuristics)
    checkNativeAdV2(el, selector) {
        const text = el.textContent?.trim().toLowerCase() || '';

        // Enhanced sponsor label patterns (multi-language)
        const sponsorPatterns = [
            /^sponsored$/i,
            /^promoted$/i,
            /^advertisement$/i,
            /^ad$/i,
            /^partner$/i,
            /^featured$/i,
            /^推廣/i,  // Chinese
            /^広告/i,  // Japanese
            /^스폰서/i, // Korean
            /^реклама/i, // Russian
            /^publicité/i, // French
            /^werbung/i, // German
        ];

        let matches = sponsorPatterns.some(pattern => pattern.test(text));

        if (matches) {
            // Use smart container finding
            selector._targetElement = this.findPromotionalContainer(el);
            return true;
        }

        // Check for sponsored attributes
        if (el.hasAttribute('data-sponsored') || el.hasAttribute('data-promoted')) {
            return true;
        }

        // Check for common native ad container classes
        const className = (el.className || '').toLowerCase();
        if (/native.*ad|sponsored.*content|promoted.*post|ad.*native/.test(className)) {
            return true;
        }

        return false;
    }

    // Check if element is a full-screen interstitial
    checkInterstitial(el) {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        // Must be fixed or absolute
        if (!['fixed', 'absolute'].includes(style.position)) {
            return false;
        }

        // High z-index
        const zIndex = parseInt(style.zIndex) || 0;
        if (zIndex < 1000) {
            return false;
        }

        // Covers >80% of viewport
        const coverage = (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
        return coverage > 0.8;
    }

    // Check if element contains countdown timer (ad skip detection)
    checkCountdownTimer(el) {
        const text = el.textContent?.trim() || '';

        // Look for countdown patterns: "Skip in 5", "Skip ad in 3", "00:05", etc.
        const timerPatterns = [
            /skip\s+(?:ad\s+)?in\s+\d+/i,
            /\d+\s+seconds?/i,
            /\d{1,2}:\d{2}/,
            /wait\s+\d+/i,
            /\d+\s*s(?:ec)?$/i,
        ];

        return timerPatterns.some(pattern => pattern.test(text));
    }

    // Check if container becomes empty after ad removal
    checkEmptyAfterBlock(el) {
        // This is checked post-blocking, so check current emptiness
        const children = el.children;
        if (children.length === 0) {
            return true;
        }

        // Check if all children are hidden/removed
        let visibleChildren = 0;
        for (const child of children) {
            const style = getComputedStyle(child);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
                visibleChildren++;
            }
        }

        return visibleChildren === 0;
    }

    // Check sibling elements
    checkSiblingMatch(el, selector) {
        const siblingSelector = selector.params?.[0] || selector.args?.[0] || '';
        const direction = selector.params?.[1] || selector.args?.[1] || 'any';

        try {
            if (direction === 'next') {
                return el.nextElementSibling?.matches(siblingSelector) || false;
            } else if (direction === 'prev') {
                return el.previousElementSibling?.matches(siblingSelector) || false;
            } else { // 'any'
                return (el.nextElementSibling?.matches(siblingSelector) ||
                    el.previousElementSibling?.matches(siblingSelector)) || false;
            }
        } catch {
            return false;
        }
    }

    // Execute action on element
    // Returns true if an action was successfully taken
    executeAction(el, action, context = {}) {
        if (!el || !action) return false;

        let target = el;

        // Handle parent targeting
        if (action.levels) {
            for (let i = 0; i < action.levels && target.parentElement; i++) {
                target = target.parentElement;
            }
        }

        let actionTaken = true; // Default to true if it matches a standard action

        switch (action.name) {
            case 'hide':
                target.style.setProperty('display', 'none', 'important');
                this.removedCount++;
                this.removedDetails.ma_cleaner++;
                break;

            case 'remove':
                this.translocateToShadow(target);
                this.removedCount++;
                this.removedDetails.ma_core++;
                break;

            case 'collapse':
                target.style.setProperty('height', '0', 'important');
                target.style.setProperty('overflow', 'hidden', 'important');
                target.style.setProperty('padding', '0', 'important');
                target.style.setProperty('margin', '0', 'important');
                this.removedCount++;
                this.removedDetails.ma_cleaner++;
                break;

            case 'blur':
                const blur = action.args?.[0] || '10px';
                target.style.setProperty('filter', `blur(${blur})`, 'important');
                this.removedCount++;
                this.removedDetails.ma_cleaner++;
                break;

            case 'opacity':
                const opacity = action.args?.[0] || '0';
                target.style.setProperty('opacity', opacity, 'important');
                this.removedCount++;
                this.removedDetails.ma_cleaner++;
                break;

            case 'removeParent': {
                const levels = action.levels || 1;
                let parent = el;
                for (let i = 0; i < levels && parent.parentElement; i++) {
                    parent = parent.parentElement;
                }
                this.translocateToShadow(parent);
                this.removedCount++;
                this.removedDetails.ma_core++;
                break;
            }

            case 'cleanUrl':
                if (el.tagName === 'A' && el.href) {
                    try {
                        const url = new URL(el.href);
                        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                            'fbclid', 'gclid', 'mc_cid', 'mc_eid'];
                        let changed = false;
                        for (const param of paramsToRemove) {
                            if (url.searchParams.has(param)) {
                                url.searchParams.delete(param);
                                changed = true;
                            }
                        }
                        if (changed) {
                            el.href = url.toString();
                            this.removedCount++;
                            this.removedDetails.ma_privacy++;
                        }
                    } catch { }
                }
                break;

            case 'delay':
                const delay = parseInt(action.delay) || 0;
                setTimeout(() => {
                    this.translocateToShadow(target);
                    this.removedCount++;
                    this.removedDetails.ma_core++;
                }, delay);
                break;

            // New advanced actions
            case 'fadeOut':
            case 'fade-out':
                const duration = parseInt(action.args?.[0] || '300');
                target.style.transition = `opacity ${duration}ms`;
                target.style.opacity = '0';
                setTimeout(() => {
                    target.style.setProperty('display', 'none', 'important');
                    this.removedCount++;
                    this.removedDetails.ma_cleaner++;
                }, duration);
                break;

            case 'redirectLink':
            case 'redirect-link':
                if (target.tagName === 'A' && action.args?.[0]) {
                    target.href = action.args[0];
                    this.removedCount++;
                    this.removedDetails.ma_privacy++;
                }
                break;

            case 'preventClick':
            case 'prevent-click':
                target.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, { capture: true });
                this.removedCount++;
                this.removedDetails.ma_privacy++;
                break;

            case 'reduceZindex':
            case 'reduce-zindex':
                const amount = parseInt(action.args?.[0] || '10000');
                const currentZ = parseInt(getComputedStyle(target).zIndex) || 0;
                target.style.zIndex = String(currentZ - amount);
                this.removedCount++;
                this.removedDetails.ma_cleaner++;
                break;

            case 'collapseContainer':
            case 'collapse-container': {
                this.translocateToShadow(target);
                this.removedCount++;
                this.removedDetails.ma_core++;

                // Check if parent is empty and collapse it too
                const parent = target.parentElement;
                if (parent && this.checkEmptyAfterBlock(parent)) {
                    parent.style.setProperty('display', 'none', 'important');
                }
                break;
            }

            case 'speed':
                // Execute wrapped action immediately (before render)
                const wrappedAction = action.args?.[0];
                if (wrappedAction) {
                    this.executeAction(target, { name: wrappedAction }, context);
                }
                break;

            case 'custom':
            default:
                // Check if it's a function call
                if (action.type === 'FunctionCall' || (action.name && this.functions.has(action.name))) {
                    const funcName = action.functionName || action.name;
                    const funcDef = this.functions.get(funcName);

                    console.log(`[DEBUG] Executing function: ${funcName}, found: ${!!funcDef}`);

                    if (funcDef) {
                        this.executeUserFunction(target, funcDef, action.args || [], context);
                    }
                } else {
                    console.log(`[DEBUG] Unknown action: ${action.name}`);
                    actionTaken = false;
                }
                break;
        }

        return actionTaken;
    }

    // Execute user-defined function
    executeUserFunction(target, funcDef, args, parentContext = {}) {
        console.log(`[DEBUG] executeUserFunction params:`, funcDef.params, "args:", args);
        // Create function scope
        const functionContext = { ...parentContext };

        // Bind parameters
        if (funcDef.params) {
            funcDef.params.forEach((paramName, index) => {
                // Argument can be a value or a variable from parent context
                let val = args[index];

                // Handle AST node objects - extract actual value
                if (val && typeof val === 'object') {
                    // If it's an AST node with a value property
                    if (val.value !== undefined) {
                        val = val.value;
                    } else if (val.name !== undefined) {
                        // Could be a variable reference
                        val = val.name;
                    }
                }

                // If arg is a string that exists in parent context, resolve it
                if (typeof val === 'string' && parentContext[val] !== undefined) {
                    val = parentContext[val];
                }

                functionContext[paramName] = val;
                console.log(`[DEBUG] Bound param ${paramName} = ${val} (type: ${typeof val})`);
            });
        }

        // Execute function body
        // Function actions are usually a list (compiledActions)
        let anyExecuted = false;
        if (funcDef.actions) {
            console.log(`[DEBUG] Function actions count: ${funcDef.actions.length}`);
            funcDef.actions.forEach(action => {
                console.log(`[DEBUG] Processing func action type: ${action.type}`);
                if (action.type === 'ActionBlock') {
                    if (this.executeActionBlock(target, action, functionContext)) anyExecuted = true;
                } else if (action.type === 'GuardedAction') {
                    // Check guard with function context
                    if (this.evaluateCondition(target, action.condition, functionContext)) {
                        const innerAction = action.action;
                        if (innerAction.type === 'ActionBlock') {
                            if (this.executeActionBlock(target, innerAction, functionContext)) anyExecuted = true;
                        } else {
                            if (this.executeAction(target, innerAction, functionContext)) anyExecuted = true;
                        }
                    } else {
                        console.log(`[DEBUG] Guard condition failed`);
                    }
                } else {
                    if (this.executeAction(target, action, functionContext)) anyExecuted = true;
                }
            });
        }
        return anyExecuted;
    }

    // Execute multiple actions sequentially
    executeActionBlock(element, actionBlock, context = {}) {
        let anyExecuted = false;
        for (const action of actionBlock.actions) {
            if (this.executeAction(element, action, context)) anyExecuted = true;
        }
        return anyExecuted;
    }

    // Setup MutationObserver for dynamic content
    setupObserver() {
        if (this.observer) this.observer.disconnect();

        let timeout = null;
        let isFirstRun = true;

        const debouncedExecute = () => {
            // First mutation batch runs immediately
            if (isFirstRun) {
                isFirstRun = false;
                this.executeJSRules();
                return;
            }

            // Subsequent mutations are debounced (16ms = 1 frame)
            clearTimeout(timeout);
            timeout = setTimeout(() => this.executeJSRules(), 16);
        };

        this.observer = new MutationObserver(debouncedExecute);
        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'srcset', 'data-src', 'style', 'class']
        });
    }

    // Stop runtime
    stop() {
        this.removeCSS();
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    // Phase 1: New runtime methods (Removed duplicates)

    // Get stats
    getStats() {
        return {
            removedCount: this.removedCount,
            removedDetails: this.removedDetails,
            cssRulesCount: this.compiledRules?.cssRules?.length || 0,
            jsRulesCount: this.compiledRules?.js?.length || 0
        };
    }
}

// Export for use
if (typeof module !== 'undefined') {
    module.exports = { MaRuntime };
}
if (typeof window !== 'undefined') {
    window.MaRuntime = MaRuntime;
}
