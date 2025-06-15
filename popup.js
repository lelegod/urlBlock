
const domainInput = document.getElementById('domainInput');
const addDomainButton = document.getElementById('addDomainButton');
const messageDiv = document.getElementById('message');
const errorDiv = document.getElementById('error');
const blockedDomainList = document.getElementById('blockedDomainList');
const startTimeInput = document.getElementById('startTimeInput');
const endTimeInput = document.getElementById('endTimeInput');

const BLOCKED_DOMAINS_STORAGE_KEY = 'blockedDomains';

async function fetchBlockedDomains() {
    const result = await chrome.storage.sync.get(BLOCKED_DOMAINS_STORAGE_KEY);
    return result[BLOCKED_DOMAINS_STORAGE_KEY] || [];
}

function showMessage(msg, type = 'success') {
    if (type === 'success') {
        messageDiv.textContent = msg;
        errorDiv.textContent = '';
    }
    else {
        messageDiv.textContent = '';
        errorDiv.textContent = msg;
    }
    setTimeout(() => {
        messageDiv.textContent = '';
        errorDiv.textContent = '';
    }, 3000);
}

function isValidDomain(domain){
    const urlParts = domain.split('/');

    const domainRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63}(?<!-))*(\.[A-Za-z]{2,63})$/;
    for (const part of urlParts) {
        if (domainRegex.test(part)) {
            return true;
        }
    }
    return false;
}

function renderBlockedDomains(items) {
    blockedDomainList.innerHTML = '';
    if (items.length == 0) {
        const li = document.createElement('li');
        li.textContent = 'No blocked domains found.';
        blockedDomainList.appendChild(li);
    }
    else {
        items.forEach(item => {
            const li  = document.createElement('li');
            li.textContent = item.domain;
            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.className = 'remove-btn';
            removeButton.dataset.domain = item.domain;
            removeButton.addEventListener('click', removeDomain);
            li.appendChild(removeButton);
            blockedDomainList.appendChild(li);
        })
    }
}

async function addDomain() {
    const domain = domainInput.value.trim().toLowerCase();
    const startTime = startTimeInput.value;
    const endTime = endTimeInput.value;
    const currentBlockedDomains = await fetchBlockedDomains();

    if (!domain) {
        showMessage('Domain cannot be empty.', 'error');
        return;
    }
    if (!isValidDomain(domain)) {
        showMessage('Please enter a valid domain (e.g., example.com).', 'error');
        return;
    }

    if ((startTime && !endTime) || (!startTime && endTime)) {
        showMessage('Please provide both Start and End times, or neither.', 'error');
        return;
    }
    
    if (currentBlockedDomains.some(item => item.domain === domain)) {
        showMessage('This domain is already in the block list.', 'error');
        return;
    }

    item = {
        domain: domain,
        startTime: startTime,
        endTime: endTime
    };

    currentBlockedDomains.push(item);
    await chrome.storage.sync.set({ [BLOCKED_DOMAINS_STORAGE_KEY]: currentBlockedDomains });

    chrome.runtime.sendMessage({ action: 'updateRules', domains: currentBlockedDomains }, (response) => {
        if (response && response.success) {
            showMessage(`'${domain}' has been added.`);
            renderBlockedDomains(currentBlockedDomains);
            domainInput.value = '';
            startTimeInput.value = '';
            endTimeInput.value = '';
        }
        else {
            showMessage(`Error '${response.error}`);
        }
    })
}

async function removeDomain(event) {
    const domainToRemove = event.target.dataset.domain;
    const currentBlockedDomains = (await fetchBlockedDomains()).filter((item) => item.domain !== domainToRemove);
    
    await chrome.storage.sync.set({ [BLOCKED_DOMAINS_STORAGE_KEY]: currentBlockedDomains });
    chrome.runtime.sendMessage({ action: 'updateRules', domains: currentBlockedDomains }, (response) => {
        if (response && response.success) {
            showMessage(`'${domainToRemove}' has been removed.`);
            renderBlockedDomains(currentBlockedDomains);
        }
        else {
            showMessage(`Error '${response.error}`);
        }
    })

}

addDomainButton.addEventListener('click', addDomain);
domainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addDomain();
    }
});
document.addEventListener('DOMContentLoaded', async () => {
    await fetchBlockedDomains().then(domains => {
        renderBlockedDomains(domains);
    })
    const openDashboardButton = document.getElementById('openDashboardButton');
    if (openDashboardButton) {
        openDashboardButton.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            }
            else {
                chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
            }
        });
    }
});