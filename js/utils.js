function xpathLiteral(value) {
    // Builds a valid XPath string literal for any input (including quotes).
    if (value === null || value === undefined) return "''";
    const str = String(value);
    if (!str.includes("'")) return `'${str}'`;
    if (!str.includes('"')) return `"${str}"`;

    // Contains both single and double quotes -> concat('a', "'", 'b', ...)
    const parts = str.split("'");
    return `concat(${parts.map((part) => `'${part}'`).join(", \"'\", ")})`;
}

function getElementXPath(element) {
    if (!element || element.nodeType !== 1) return '';

    const isUniqueXPath = (xpath) => {
        try {
            const snapshot = document.evaluate(
                xpath,
                document,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null,
            );
            return snapshot.snapshotLength === 1;
        } catch {
            return false;
        }
    };

    // 1) If element has an id, prefer id-based XPath when it is unique.
    if (element.id) {
        const elementIdXPath = `//*[@id=${xpathLiteral(element.id)}]`;
        if (isUniqueXPath(elementIdXPath)) return elementIdXPath;
    }

    // 2) Prefer anchoring on the nearest ancestor that has an id.
    //    This typically produces more stable XPath like:
    //    //*[@id="content"]//ul/li[2]/a/span[2]
    let currentNode = element;
    let anchorId = null;
    const relativeSteps = [];

    while (currentNode && currentNode.nodeType === 1 && currentNode !== document.documentElement) {
        if (currentNode.id) {
            anchorId = currentNode.id;
            break;
        }

        const tagName = currentNode.tagName.toLowerCase();
        const parentElement = currentNode.parentElement;
        if (!parentElement) break;

        const sameTagSiblings = Array.from(parentElement.children).filter(
            (sibling) => sibling.tagName.toLowerCase() === tagName,
        );
        const indexInSiblings = sameTagSiblings.indexOf(currentNode) + 1;
        relativeSteps.unshift(`${tagName}[${indexInSiblings}]`);

        currentNode = parentElement;
    }

    if (anchorId) {
        const anchorXPath = `//*[@id=${xpathLiteral(anchorId)}]`;
        const anchoredXPath =
            relativeSteps.length > 0
                ? `${anchorXPath}//${relativeSteps.join('/')}`
                : anchorXPath;
        if (isUniqueXPath(anchoredXPath)) return anchoredXPath;
    }

    // 3) Fallback: absolute XPath from <html> using sibling indexes (1-based).
    const absoluteSteps = [];
    currentNode = element;
    const documentElement = document.documentElement;

    while (currentNode && currentNode.nodeType === 1 && currentNode !== documentElement) {
        const tagName = currentNode.tagName.toLowerCase();
        const parentElement = currentNode.parentElement;
        if (!parentElement) break;

        const sameTagSiblings = Array.from(parentElement.children).filter(
            (sibling) => sibling.tagName.toLowerCase() === tagName,
        );
        const indexInSiblings = sameTagSiblings.indexOf(currentNode) + 1;
        absoluteSteps.unshift(`${tagName}[${indexInSiblings}]`);

        currentNode = parentElement;
    }

    if (currentNode !== documentElement) return '';
    absoluteSteps.unshift(documentElement.tagName.toLowerCase());
    return '/' + absoluteSteps.join('/');
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
                selector += `[${key}="${escapeAttributeValueForDoubleQuotedSelector(element.getAttribute(key))}"]`;
                break;
            }
        }
    }

    return selector;
}

/**
 * Escape attribute value when embedding inside a CSS selector of the form:
 *   [attr="..."]
 *
 * In this context only `\` and `"` need to be escaped.
 */
function escapeAttributeValueForDoubleQuotedSelector(value) {
    const str = String(value ?? '');
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

const STABLE_ATTRIBUTE_NAMES = [
    'data-testid',
    'data-test',
    'data-cy',
    'data-qa',
    'data-id',
    'name',
    'role',
    'type',
    'href',
    'aria-label',
];
const TEXT_PREVIEW_LIMIT = 80;

/**
 * Detect if an id looks stable enough to be reused across renders.
 * Reject obvious framework-generated ids (radix `:r0:`, react `__`, long hashes…).
 */
function isStableId(id) {
    if (!id || typeof id !== 'string') return false;
    if (id.length > 64) return false;
    if (/^:[a-z]\d+:$/i.test(id)) return false;
    if (/^__/.test(id)) return false;
    if (/^[a-f0-9-]{30,}$/i.test(id)) return false;
    // Be conservative when rejecting hex-like ids:
    // reject only if the *whole* (dash-removed) id is mostly hex, to avoid
    // false negatives for legitimate ids that contain a short hex substring.
    const cleaned = id.replace(/-/g, '');
    if (cleaned.length >= 16 && /^[a-f0-9]+$/i.test(cleaned)) return false;
    if (/^\d+$/.test(id)) return false;
    return true;
}

/**
 * Detect if a class name looks like a stable, human-named class
 * (filters out CSS-modules hash and our overlay markers).
 */
function isStableClassName(className) {
    if (!className || typeof className !== 'string') return false;
    if (className.startsWith('testing-')) return false;
    if (className.startsWith('_')) return false;
    if (/__[A-Za-z0-9_-]{4,}$/.test(className)) return false;
    if (/--[a-f0-9]{6,}$/i.test(className)) return false;
    return true;
}

/**
 * Detect if an attribute value looks stable (not auto-generated GUID/hash).
 */
function isStableAttributeValue(name, value) {
    if (!value || typeof value !== 'string') return false;
    if (value.length > 256) return false;
    if (name === 'name' && /^[a-f0-9-]{20,}$/i.test(value)) return false;
    return true;
}

function getStableClassList(element) {
    if (!element.className || typeof element.className !== 'string') return [];
    return element.className
        .split(/\s+/)
        .filter((className) => className && isStableClassName(className));
}

function getStableAttributeMap(element) {
    const result = {};
    for (const name of STABLE_ATTRIBUTE_NAMES) {
        if (element.hasAttribute(name)) {
            const value = element.getAttribute(name);
            if (isStableAttributeValue(name, value)) result[name] = value;
        }
    }
    return result;
}

function getElementTextPreview(element) {
    const text = (element.textContent || '').trim().replace(/\s+/g, ' ');
    return text.substring(0, TEXT_PREVIEW_LIMIT);
}

/**
 * Capture short ancestor chain so we can re-anchor by stable ancestor id later.
 */
function getAncestorChain(element, maxDepth = 5) {
    const chain = [];
    let node = element.parentElement;
    let depth = 0;
    while (node && node !== document.documentElement && depth < maxDepth) {
        chain.push({
            tag: node.tagName.toLowerCase(),
            stableId: isStableId(node.id) ? node.id : null,
            classes: getStableClassList(node).slice(0, 3),
            role: node.getAttribute('role') || null,
        });
        node = node.parentElement;
        depth++;
    }
    return chain;
}

function getElementBoundingRect(element) {
    const rect = element.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    return {
        left: rect.left + scrollX,
        top: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
    };
}

function getUniqueXPathNode(xpath) {
    try {
        const snapshot = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
        );
        return snapshot.snapshotLength === 1 ? snapshot.snapshotItem(0) : null;
    } catch {
        return null;
    }
}

/**
 * Build a multi-layered identifier for `element`. Designed so that
 * `findElementByFingerprint` can recover the same element after the DOM
 * mutates (sibling re-order, wrapper added, classes change, etc.).
 *
 * Stored layers (priority high → low when looking up):
 * 1. stableId
 * 2. stable attributes (data-testid, name, role, href, aria-label, …)
 * 3. id-based xpath / anchored xpath / absolute xpath
 * 4. css selector
 * 5. fuzzy: tag + text + class overlap + ancestor with stable id
 * 6. bounding rect (last-known visual position)
 */
function getElementFingerprint(element) {
    if (!element || element.nodeType !== 1) return null;

    const tag = element.tagName.toLowerCase();
    const stableId = isStableId(element.id) ? element.id : null;
    const attributes = getStableAttributeMap(element);
    const classes = getStableClassList(element);
    const text = getElementTextPreview(element);
    const ancestors = getAncestorChain(element);
    const cssSelector = getElementCSSSelector(element);
    const absoluteXPath = getElementXPath(element);

    const xpaths = { absolute: absoluteXPath };
    if (stableId) xpaths.byId = `//*[@id=${xpathLiteral(stableId)}]`;

    return {
        version: 1,
        tag,
        stableId,
        attributes,
        classes,
        text,
        ancestors,
        cssSelector,
        xpaths,
        rect: getElementBoundingRect(element),
    };
}

/**
 * Try to recover the original element using a fingerprint. Returns
 * the element or `null` if no candidate looks safe enough.
 */
function findElementByFingerprint(fingerprint) {
    if (!fingerprint || typeof fingerprint !== 'object') return null;

    const tag = (fingerprint.tag || '').toLowerCase();
    const matchesTag = (element) => !tag || (element && element.tagName && element.tagName.toLowerCase() === tag);

    if (fingerprint.stableId) {
        try {
            const element = document.getElementById(fingerprint.stableId);
            if (element && matchesTag(element)) return element;
        } catch {}
    }

    if (fingerprint.attributes) {
        const attributeEntries = Object.entries(fingerprint.attributes);

        for (const [name, value] of attributeEntries) {
            try {
                const selector = `${tag || '*'}[${name}="${escapeAttributeValueForDoubleQuotedSelector(value)}"]`;
                const matches = document.querySelectorAll(selector);
                if (matches.length === 1 && matchesTag(matches[0])) return matches[0];
            } catch {}
        }

        if (attributeEntries.length > 1) {
            try {
                const selector =
                    (tag || '*') +
                    attributeEntries
                        .map(([name, value]) => `[${name}="${escapeAttributeValueForDoubleQuotedSelector(value)}"]`)
                        .join('');
                const matches = document.querySelectorAll(selector);
                if (matches.length === 1 && matchesTag(matches[0])) return matches[0];
            } catch {}
        }
    }

    if (fingerprint.xpaths?.byId) {
        const node = getUniqueXPathNode(fingerprint.xpaths.byId);
        if (node && matchesTag(node)) return node;
    }

    if (fingerprint.xpaths?.absolute) {
        try {
            const result = document.evaluate(
                fingerprint.xpaths.absolute,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
            );
            if (result.singleNodeValue && matchesTag(result.singleNodeValue)) return result.singleNodeValue;
        } catch {}
    }

    if (fingerprint.cssSelector) {
        try {
            const matches = document.querySelectorAll(fingerprint.cssSelector);
            if (matches.length === 1 && matchesTag(matches[0])) return matches[0];
        } catch {}
    }

    const candidates = tag
        ? Array.from(document.getElementsByTagName(tag))
        : Array.from(document.body ? document.body.querySelectorAll('*') : []);

    const targetText = (fingerprint.text || '').trim();
    const targetClassSet = new Set(fingerprint.classes || []);
    const targetAncestor = (fingerprint.ancestors || []).find((ancestor) => ancestor.stableId);

    let bestFuzzyMatch = null;
    let bestFuzzyScore = 0;
    let bestFuzzyRectDistance = Infinity;
    const FUZZY_SCORE_THRESHOLD = 8;

    const hasStableRect =
        !!(fingerprint.rect && fingerprint.rect.width && fingerprint.rect.height && fingerprint.rect.left != null && fingerprint.rect.top != null);
    const targetRect =
        hasStableRect && fingerprint.rect ? fingerprint.rect : null;
    const targetCenterX = hasStableRect ? targetRect.left + targetRect.width / 2 : null;
    const targetCenterY = hasStableRect ? targetRect.top + targetRect.height / 2 : null;
    const scrollX = hasStableRect ? window.pageXOffset || document.documentElement.scrollLeft : null;
    const scrollY = hasStableRect ? window.pageYOffset || document.documentElement.scrollTop : null;

    const computeRectDistance = (candidate) => {
        if (!hasStableRect) return Infinity;
        const rect = candidate.getBoundingClientRect();
        if (!rect.width || !rect.height) return Infinity;

        const widthRatio =
            Math.max(rect.width, targetRect.width) / Math.max(1, Math.min(rect.width, targetRect.width));
        const heightRatio =
            Math.max(rect.height, targetRect.height) / Math.max(1, Math.min(rect.height, targetRect.height));
        if (widthRatio > 2 || heightRatio > 2) return Infinity;

        const candidateCenterX = rect.left + rect.width / 2 + scrollX;
        const candidateCenterY = rect.top + rect.height / 2 + scrollY;
        return Math.hypot(candidateCenterX - targetCenterX, candidateCenterY - targetCenterY);
    };

    for (const candidate of candidates) {
        let score = 0;

        const candidateClasses = getStableClassList(candidate);
        const overlappingClasses = candidateClasses.filter((className) => targetClassSet.has(className)).length;
        score += overlappingClasses * 3;

        for (const [name, value] of Object.entries(fingerprint.attributes || {})) {
            if (candidate.getAttribute(name) === value) score += name === 'href' ? 4 : 3;
        }

        const candidateText = (candidate.textContent || '')
            .trim()
            .replace(/\s+/g, ' ')
            .substring(0, TEXT_PREVIEW_LIMIT);
        if (targetText && candidateText) {
            if (candidateText === targetText) score += 6;
            else if (candidateText.includes(targetText) || targetText.includes(candidateText)) score += 2;
        }

        if (targetAncestor && targetAncestor.stableId) {
            try {
                const ancestorMatch = candidate.closest(`#${CSS.escape(targetAncestor.stableId)}`);
                if (ancestorMatch) score += 4;
            } catch {}
        }

        if (score < FUZZY_SCORE_THRESHOLD) continue;

        if (score > bestFuzzyScore) {
            bestFuzzyScore = score;
            bestFuzzyMatch = candidate;
            bestFuzzyRectDistance = computeRectDistance(candidate);
            continue;
        }

        // Tie-break: if another candidate has identical fuzzy score,
        // use the stored rect proximity to reduce false positives.
        if (score === bestFuzzyScore && hasStableRect) {
            const distance = computeRectDistance(candidate);
            if (distance < bestFuzzyRectDistance) {
                bestFuzzyRectDistance = distance;
                bestFuzzyMatch = candidate;
            }
        }
    }

    if (bestFuzzyMatch) return bestFuzzyMatch;

    if (fingerprint.rect && fingerprint.rect.width && fingerprint.rect.height) {
        const target = fingerprint.rect;
        const targetCenterX = target.left + target.width / 2;
        const targetCenterY = target.top + target.height / 2;
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        let closestCandidate = null;
        let closestDistance = Infinity;

        for (const candidate of candidates) {
            const rect = candidate.getBoundingClientRect();
            if (!rect.width || !rect.height) continue;

            const widthRatio =
                Math.max(rect.width, target.width) / Math.max(1, Math.min(rect.width, target.width));
            const heightRatio =
                Math.max(rect.height, target.height) /
                Math.max(1, Math.min(rect.height, target.height));
            if (widthRatio > 2 || heightRatio > 2) continue;

            const candidateCenterX = rect.left + rect.width / 2 + scrollX;
            const candidateCenterY = rect.top + rect.height / 2 + scrollY;
            const distance = Math.hypot(candidateCenterX - targetCenterX, candidateCenterY - targetCenterY);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestCandidate = candidate;
            }
        }

        if (closestCandidate && closestDistance < 150) return closestCandidate;
    }

    return null;
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
window.getElementFingerprint = getElementFingerprint;
window.findElementByFingerprint = findElementByFingerprint;
window.getCurrentBreakpoint = getCurrentBreakpoint;
window.formatTime = formatTime;
window.getStatusText = getStatusText;
window.generateUUID = generateUUID;
