function getElementXPath(element) {
    if (!element || element.nodeType !== 1) return '';
    if (element.id) return `//*[@id="${CSS.escape(element.id)}"]`;

    const segments = [];
    let currentNode = element;

    while (currentNode && currentNode !== document.documentElement) {
        const tagName = currentNode.tagName.toLowerCase();
        if (currentNode.id) {
            segments.unshift(`*[@id="${CSS.escape(currentNode.id)}"]`);
            break;
        }

        const sameTagSiblings = Array.from(currentNode.parentElement?.children || []).filter(
                (sibling) => sibling.tagName.toLowerCase() === tagName,
            ),
            indexInSiblings = sameTagSiblings.indexOf(currentNode) + 1,
            segment = sameTagSiblings.length > 1 ? `${tagName}[${indexInSiblings}]` : tagName;

        segments.unshift(segment);
        currentNode = currentNode.parentElement;
    }

    return segments.length > 0 ? '//' + segments.join('/') : '/';
}

function getElementCSSSelector(element) {
    if (!element || element.nodeType !== 1) return '';
    if (element.id) return `#${CSS.escape(element.id)}`;

    let selector = '';
    if (element.className) {
        const classNames = element.className
            .split(' ')
            .filter((className) => className.trim() && !className.startsWith('testing-'));
        if (classNames.length > 0) selector = `.${classNames.map((className) => CSS.escape(className)).join('.')}`;
    }

    if (!selector) selector = element.tagName.toLowerCase();

    try {
        const parentElement = element.parentElement;
        if (parentElement && document.querySelectorAll(selector).length > 1) {
            const siblingsOfSameTag = Array.from(parentElement.children).filter(
                    (child) => child.tagName.toLowerCase() === element.tagName.toLowerCase(),
                ),
                siblingIndex = siblingsOfSameTag.indexOf(element) + 1;

            if (siblingsOfSameTag.length > 1) selector += `:nth-child(${siblingIndex})`;
        }
    } catch (error) {
        console.warn('Error checking :nth-child:', error);
    }

    try {
        if (document.querySelectorAll(selector).length > 1 && element.parentElement) {
            const parentSelector = getElementCSSSelector(element.parentElement);
            if (parentSelector) selector = `${parentSelector} > ${selector}`;
        }
    } catch (error) {
        console.warn('Error checking selector uniqueness:', error);
    }

    if (document.querySelectorAll(selector).length > 1) {
        const attributeKeys = ['data-testid', 'data-id', 'name', 'type', 'role'];
        for (const key of attributeKeys) {
            if (element.hasAttribute(key)) {
                selector += `[${key}="${CSS.escape(element.getAttribute(key))}"]`;
                break;
            }
        }
    }

    return selector;
}

function getJsPath(element) {
    if (!element || element.nodeType !== 1) return '';
    if (element.id) return `document.getElementById('${CSS.escape(element.id)}')`;

    let selector = '';
    if (element.className) {
        const classNames = element.className
            .split(' ')
            .filter((className) => className.trim() && !className.startsWith('testing-'));
        if (classNames.length > 0) selector = `.${classNames.map((className) => CSS.escape(className)).join('.')}`;
    }

    if (!selector) selector = element.tagName.toLowerCase();

    try {
        const parentElement = element.parentElement;
        if (parentElement) {
            const siblings = Array.from(parentElement.children);
            const indexInSiblings = siblings.indexOf(element) + 1;
            if (document.querySelectorAll(selector).length > 1 && siblings.length > 1) {
                selector += `:nth-child(${indexInSiblings})`;
            }
        }
    } catch (error) {
        console.warn('Error checking :nth-child:', error);
    }

    try {
        if (document.querySelectorAll(selector).length > 1 && element.parentElement) {
            const parentSelector = getElementCSSSelector(element.parentElement);
            if (parentSelector) selector = `${parentSelector} > ${selector}`;
        }
    } catch (error) {
        console.warn('Error checking selector uniqueness:', error);
    }

    return `document.querySelector('${selector}')`;
}

function getElementAttributes(element) {
    const attributes = {};
    ['id', 'class', 'data-testid', 'data-id', 'name', 'type', 'role', 'href'].forEach((attribute) => {
        if (element.hasAttribute(attribute)) attributes[attribute] = element.getAttribute(attribute);
    });
    return attributes;
}

function findElementByIdentifiers(identifiers) {
    try {
        const matches = document.querySelectorAll(identifiers.cssSelector);
        if (matches.length === 1) return matches[0];
        if (matches.length > 1) {
            console.warn('CSS selector matches multiple elements:', identifiers.cssSelector);
        }
    } catch {}

    try {
        const result = document.evaluate(
            identifiers.xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
        );
        if (result.singleNodeValue) return result.singleNodeValue;
    } catch (error) {
        console.warn('XPath failed:', error);
    }

    if (identifiers.attributes?.id) {
        const byId = document.getElementById(identifiers.attributes.id);
        if (byId) return byId;
    }

    console.warn('No unique element found for identifiers:', identifiers);
    return null;
}

function findElementByAttributes(targetInfo) {
    const candidates = document.getElementsByTagName(targetInfo.tagName);
    let bestMatch = null;
    let highestScore = 0;

    for (const candidate of candidates) {
        let score = 0;

        for (const [attributeName, attributeValue] of Object.entries(targetInfo.attributes || {})) {
            if (candidate.getAttribute(attributeName) === attributeValue) {
                score += attributeName === 'id' ? 10 : attributeName === 'class' ? 5 : 3;
            }
        }

        if (targetInfo.textContent && candidate.textContent) {
            const preview = candidate.textContent.trim().substring(0, 50);
            const targetPreview = targetInfo.textContent.trim().substring(0, 50);
            if (preview === targetPreview) {
                score += 5;
            } else if (preview.includes(targetInfo.textContent) || targetInfo.textContent.includes(preview)) {
                score += 2;
            }
        }

        if (score >= 8 && score > highestScore) {
            bestMatch = candidate;
            highestScore = score;
        }
    }

    if (!bestMatch) console.warn('No element found with sufficient score for:', targetInfo);
    return bestMatch;
}

function getCurrentBreakpoint(width) {
    return width >= 1024 ? 'desktop' : width >= 768 && width < 1024 ? 'tablet' : 'mobile';
}

function formatTime(timestamp) {
    const elapsedMs = Date.now() - timestamp;
    return elapsedMs < 60000
        ? 'Vừa xong'
        : elapsedMs < 3600000
          ? `${Math.floor(elapsedMs / 60000)} phút trước`
          : elapsedMs < 86400000
            ? `${Math.floor(elapsedMs / 3600000)} giờ trước`
            : `${Math.floor(elapsedMs / 86400000)} ngày trước`;
}

function getStatusText(status) {
    return { open: 'Mở', resolved: 'Đã giải quyết', closed: 'Đã đóng' }[status] || 'Mở';
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const randomValue = (16 * Math.random()) | 0;
        return (char === 'x' ? randomValue : (randomValue & 3) | 8).toString(16);
    });
}

window.getElementXPath = getElementXPath;
window.getElementCSSSelector = getElementCSSSelector;
window.getJsPath = getJsPath;
window.getElementAttributes = getElementAttributes;
window.findElementByIdentifiers = findElementByIdentifiers;
window.findElementByAttributes = findElementByAttributes;
window.getCurrentBreakpoint = getCurrentBreakpoint;
window.formatTime = formatTime;
window.getStatusText = getStatusText;
window.generateUUID = generateUUID;
