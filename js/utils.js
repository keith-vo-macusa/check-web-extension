function getElementXPath(element) {
    // Kiểm tra phần tử hợp lệ
    if (!element || element.nodeType !== 1) return '';

    // Trả về XPath dựa trên ID nếu có
    if (element.id) {
        return `//*[@id="${CSS.escape(element.id)}"]`;
    }

    const parts = [];
    let current = element;

    while (current && current !== document.documentElement) {
        const tagName = current.tagName.toLowerCase();

        // Nếu phần tử hiện tại hoặc cha có ID, sử dụng nó và dừng
        if (current.id) {
            parts.unshift(`*[@id="${CSS.escape(current.id)}"]`);
            break;
        }

        // Lấy tất cả anh em cùng tên thẻ
        const siblings = Array.from(current.parentElement?.children || [])
            .filter(sibling => sibling.tagName.toLowerCase() === tagName);
        const index = siblings.indexOf(current) + 1;

        // Chỉ thêm chỉ số nếu có nhiều anh em cùng tên thẻ
        const selector = siblings.length > 1 ? `${tagName}[${index}]` : tagName;
        parts.unshift(selector);

        current = current.parentElement;
    }

    return parts.length > 0 ? '//' + parts.join('/') : '/';
}

function getElementCSSSelector(element) {
    // Kiểm tra phần tử hợp lệ
    if (!element || element.nodeType !== 1) return '';

    // Trả về bộ chọn ID nếu có
    if (element.id) {
        return `#${CSS.escape(element.id)}`;
    }

    let selector = '';

    // Thêm các lớp hợp lệ
    if (element.className) {
        const classes = element.className.split(' ')
            .filter(c => c.trim() && !c.startsWith('testing-'));
        if (classes.length > 0) {
            selector = '.' + classes.map(c => CSS.escape(c)).join('.');
        }
    }

    // Nếu không có lớp, sử dụng tên thẻ
    if (!selector) {
        selector = element.tagName.toLowerCase();
    }

    // Thêm :nth-child nếu cần
    try {
        const parent = element.parentElement;
        if (parent && document.querySelectorAll(selector).length > 1) {
            const siblings = Array.from(parent.children)
                .filter(child => child.tagName.toLowerCase() === element.tagName.toLowerCase());
            const index = siblings.indexOf(element) + 1;
            if (siblings.length > 1) {
                selector += `:nth-child(${index})`;
            }
        }
    } catch (e) {
        console.warn('Error checking :nth-child:', e);
    }

    // Kiểm tra tính duy nhất và thêm ngữ cảnh cha
    try {
        if (document.querySelectorAll(selector).length > 1 && element.parentElement) {
            const parentSelector = getElementCSSSelector(element.parentElement);
            if (parentSelector) {
                selector = `${parentSelector} > ${selector}`;
            }
        }
    } catch (e) {
        console.warn('Error checking selector uniqueness:', e);
    }

    // Thêm thuộc tính nếu vẫn không duy nhất
    if (document.querySelectorAll(selector).length > 1) {
        const importantAttrs = ['data-testid', 'data-id', 'name', 'type', 'role'];
        for (const attr of importantAttrs) {
            if (element.hasAttribute(attr)) {
                selector += `[${attr}="${CSS.escape(element.getAttribute(attr))}"]`;
                break;
            }
        }
    }

    return selector;
}

function getJsPath(element) {
    // Kiểm tra phần tử hợp lệ
    if (!element || element.nodeType !== 1) return '';

    // Trả về document.getElementById nếu có ID
    if (element.id) {
        return `document.getElementById('${CSS.escape(element.id)}')`;
    }

    let selector = '';

    // Thêm lớp nếu có
    if (element.className) {
        const classes = element.className.split(' ')
            .filter(c => c.trim() && !c.startsWith('testing-'));
        if (classes.length > 0) {
            selector = '.' + classes.map(c => CSS.escape(c)).join('.');
        }
    }

    // Nếu không có lớp, sử dụng tên thẻ
    if (!selector) {
        selector = element.tagName.toLowerCase();
    }

    // Thêm :nth-child nếu cần
    try {
        const parent = element.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(element) + 1;
            if (document.querySelectorAll(selector).length > 1 && siblings.length > 1) {
                selector += `:nth-child(${index})`;
            }
        }
    } catch (e) {
        console.warn('Error checking :nth-child:', e);
    }

    // Kiểm tra tính duy nhất và thêm ngữ cảnh cha
    try {
        if (document.querySelectorAll(selector).length > 1 && element.parentElement) {
            const parentSelector = getElementCSSSelector(element.parentElement);
            if (parentSelector) {
                selector = `${parentSelector} > ${selector}`;
            }
        }
    } catch (e) {
        console.warn('Error checking selector uniqueness:', e);
    }

    return `document.querySelector('${selector}')`;
}

function getElementAttributes(element) {
    const attrs = {};
    const importantAttrs = ['id', 'class', 'data-testid', 'data-id', 'name', 'type', 'role', 'href'];
    
    importantAttrs.forEach(attr => {
        if (element.hasAttribute(attr)) {
            attrs[attr] = element.getAttribute(attr);
        }
    });
    
    return attrs;
}

function findElementByIdentifiers(identifiers) {
    // Thử CSS selector
    try {
        const elements = document.querySelectorAll(identifiers.cssSelector);
        if (elements.length === 1) return elements[0];
        if (elements.length > 1) {
            console.warn('CSS selector matches multiple elements:', identifiers.cssSelector);
        }
    } catch (e) {
        console.warn('CSS selector failed:', e);
    }

    // Thử XPath
    try {
        const xpathResult = document.evaluate(
            identifiers.xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        );
        if (xpathResult.singleNodeValue) return xpathResult.singleNodeValue;
    } catch (e) {
        console.warn('XPath failed:', e);
    }

    // Thử thuộc tính ID
    if (identifiers.attributes?.id) {
        const element = document.getElementById(identifiers.attributes.id);
        if (element) return element;
    }

    // Cảnh báo nếu không tìm thấy
    console.warn('No unique element found for identifiers:', identifiers);
    return null;
}

function findElementByAttributes(identifiers) {
    const elements = document.getElementsByTagName(identifiers.tagName);
    let bestElement = null;
    let highestScore = 0;

    for (let element of elements) {
        let score = 0;
        for (const [attr, value] of Object.entries(identifiers.attributes || {})) {
            if (element.getAttribute(attr) === value) {
                score += attr === 'id' ? 10 : (attr === 'class' ? 5 : 3);
            }
        }

        if (identifiers.textContent && element.textContent) {
            const elementText = element.textContent.trim().substring(0, 50);
            if (elementText === identifiers.textContent.trim().substring(0, 50)) {
                score += 5;
            } else if (
                elementText.includes(identifiers.textContent) ||
                identifiers.textContent.includes(elementText)
            ) {
                score += 2;
            }
        }

        if (score >= 8 && score > highestScore) {
            bestElement = element;
            highestScore = score;
        }
    }

    if (!bestElement) {
        console.warn('No element found with sufficient score for:', identifiers);
    }

    return bestElement;
}

function getCurrentBreakpoint(width) {
    if (width >= 1024) {
        return 'desktop';
    } else if (width >= 768 && width < 1024) {
        return 'tablet';
    } else {
        return 'mobile';
    }
}

function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
    return `${Math.floor(diff / 86400000)} ngày trước`;
}

function getStatusText(status) {
    const statusMap = {
        'open': 'Mở',
        'resolved': 'Đã giải quyết',
        'closed': 'Đã đóng'
    };
    return statusMap[status] || 'Mở';
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







