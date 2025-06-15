'use strict';

const BLOCKED_DOMAINS_STORAGE_KEY = 'blockedDomains';
const RULESET_ID = 'ruleset1'
const TIME_CHECK_ALARM_NAME = 'timeBasedRuleCheck';

async function fetchBlockedDomains() {
    const result = await chrome.storage.sync.get(BLOCKED_DOMAINS_STORAGE_KEY);
    return result[BLOCKED_DOMAINS_STORAGE_KEY] || [];
}

function simpleStringHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function isTimeActive(startTime, endTime) {
    if (!startTime || !endTime) return true;

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;
    
    if (startTimeInMinutes < endTimeInMinutes) {
        return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
    } else {
        return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
    }
}

function generateRules(items) {
    const rules = [];
    items.forEach(item => {
        if (isTimeActive(item.startTime, item.endTime)) {
            rules.push(
                {
                    "id": simpleStringHash(item.domain),
                    "priority": 1,
                    "action": {
                        "type": "redirect",
                        "redirect": {
                        "url": "https://developer.chrome.com/docs/extensions/mv3/intro/"
                    }
                    },
                    "condition": {
                        "urlFilter": `*://*.${item.domain}/*`,
                        "resourceTypes": ["main_frame"]
                    }
                }
            )
        }
    });
    return rules
}

async function updateDynamicRules(domains) {
    try {
        const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
        const newRules = generateRules(domains);
        
        const oldRulesIds = oldRules.map(rule => rule.id);
        const newRulesIds = newRules.map(rule => rule.id);

        const rulesToRemove = oldRulesIds.filter(id => !newRulesIds.includes(id));
        const rulesToAdd = newRules.filter(newRule => !oldRulesIds.includes(newRule.id));

        if (rulesToRemove.length > 0 || rulesToAdd.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: rulesToRemove,
                addRules: rulesToAdd
            });
            console.log('Declarative Net Request rules updated successfully. Active rules for:', newRules.map(r => r.id));
        } else {
            console.log('No changes to declarative Net Request rules needed.');
        }

        return { success: true };
    }
    catch (error) {
        console.error('Failed to update declarative Net Request rules:', error);
        return { success: false, error: error.message };
    }
}

async function applyTimeBasedRules() {
    console.log('Running time-based rule check...');
    const result = await chrome.storage.sync.get(BLOCKED_DOMAINS_STORAGE_KEY);
    const storedItems = result[BLOCKED_DOMAINS_STORAGE_KEY] || [];
    await updateDynamicRules(storedItems);
    return storedItems;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateRules') {
        console.log(request.domains, "new domains");
        updateDynamicRules(request.domains).then(sendResponse);
        return true;
    }
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((e) => {
    const msg = `URL blocked by rule ID ${e.rule.ruleId}: ${e.request.url}`;
    console.log(msg);
});

console.log('Service worker started.');

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('Extension installed or updated. Setting up alarms and initial rules.');
    chrome.alarms.create(TIME_CHECK_ALARM_NAME, {
        delayInMinutes: 0.001,
        periodInMinutes: 1
    });
    const storedItems = await applyTimeBasedRules();
    console.log('Initial blocked domains loaded and rules applied:', storedItems);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === TIME_CHECK_ALARM_NAME) {
        await applyTimeBasedRules();
    }
});

(async () => {
    const storedItems = await applyTimeBasedRules();
    console.log('Initial blocked domains loaded:', storedItems);
});