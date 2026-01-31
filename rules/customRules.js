// Custom Rules Management for ZenCleaner (Optimized)

const CUSTOM_RULES_KEY = 'customRules';

const getCustomRules = async () => {
    const result = await chrome.storage.local.get([CUSTOM_RULES_KEY]);
    return result[CUSTOM_RULES_KEY] || [];
};

const addCustomRule = async (rule) => {
    const rules = await getCustomRules();
    if (rules.some(r => r.selector === rule.selector)) {
        return { success: false, message: 'Selector already exists' };
    }

    const newRule = {
        id: Date.now().toString(),
        selector: rule.selector,
        reason: rule.reason || '',
        source: rule.source || 'manual',
        domain: rule.domain || '*',
        createdAt: new Date().toISOString(),
        enabled: true
    };

    rules.push(newRule);
    await chrome.storage.local.set({ [CUSTOM_RULES_KEY]: rules });
    return { success: true, rule: newRule };
};

const removeCustomRule = async (ruleId) => {
    const rules = await getCustomRules();
    await chrome.storage.local.set({ [CUSTOM_RULES_KEY]: rules.filter(r => r.id !== ruleId) });
    return { success: true };
};

const toggleCustomRule = async (ruleId, enabled) => {
    const rules = await getCustomRules();
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
        rule.enabled = enabled;
        await chrome.storage.local.set({ [CUSTOM_RULES_KEY]: rules });
    }
    return { success: true };
};

const getEnabledCustomSelectors = async (domain = null) => {
    const rules = await getCustomRules();
    return rules
        .filter(r => r.enabled && (r.domain === '*' || r.domain === domain))
        .map(r => r.selector);
};

const clearAllCustomRules = async () => {
    await chrome.storage.local.set({ [CUSTOM_RULES_KEY]: [] });
    return { success: true };
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.CleanPageCustomRules = {
        getCustomRules,
        addCustomRule,
        removeCustomRule,
        toggleCustomRule,
        getEnabledCustomSelectors,
        clearAllCustomRules
    };
}
