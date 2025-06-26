$(document).ready(function() {
    let isActive = false;
    let errorsVisible = true; // Add state for errors visibility
    let selectedBreakpoint = 'all'; // Default to show all breakpoints
    
    console.log('Popup loaded');
    
    // Check authentication first
    checkAuthentication();
    
    // Chrome/Edge API (cả hai đều dùng chrome namespace)
    const browserAPI = chrome;
    
    if (!browserAPI || !browserAPI.tabs) {
        $('#errorsList').html('<div class="no-errors">❌ Extension chỉ hỗ trợ Chrome/Edge</div>');
        return;
    }
    
    console.log('Using Chrome/Edge API');
    
    // Load saved visibility state from localStorage
    const savedVisibility = localStorage.getItem('errorsVisible');
    if (savedVisibility !== null) {
        errorsVisible = savedVisibility === 'true';
        $('#toggleErrors').prop('checked', errorsVisible);
        
        // Apply initial state to the page
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                browserAPI.tabs.sendMessage(tabs[0].id, {
                    action: errorsVisible ? 'showAllErrors' : 'hideAllErrors'
                });
            }
        });
    }
    
    // Load initial state
    loadExtensionState();
    loadErrorsList();
    
    // Auto-refresh when popup is focused/shown
    window.addEventListener('focus', function() {
        loadErrorsList();
    });
    
    // Also refresh when popup becomes visible
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            loadErrorsList();
        }
    });
    
    // Toggle selection mode
    $('#toggleMode').click(function() {
        isActive = !isActive;
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            browserAPI.tabs.sendMessage(tabs[0].id, {
                action: isActive ? 'activate' : 'deactivate'
            });
        });
        updateUI();
    });
    
    // Toggle errors visibility with switch
    $('#toggleErrors').change(function() {
        errorsVisible = $(this).prop('checked');
        console.log('Toggle switch changed:', errorsVisible);
        
        // Save to localStorage
        localStorage.setItem('errorsVisible', errorsVisible);
        
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                browserAPI.tabs.sendMessage(tabs[0].id, {
                    action: errorsVisible ? 'showAllErrors' : 'hideAllErrors'
                });
            }
        });
    });
    
    // Clear all errors
    $('#clearAll').click(function() {
        if (confirm('Bạn có chắc muốn xóa tất cả lỗi không?')) {
            browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const url = tabs[0].url;
                browserAPI.storage.local.set({[url]: []}, function() {
                    browserAPI.tabs.sendMessage(tabs[0].id, {
                        action: 'clearAllErrors'
                    });
                });
            });
        }
        loadErrorsList();
    });
    
    
    
    // Search functionality
    $('#searchBox').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        filterErrors(searchTerm);
    });
    
    // Listen for messages from content script
    browserAPI.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'errorAdded') {
            loadErrorsList();
        }
    });
    
    // Authentication functions
    async function checkAuthentication() {
        try {
            const isAuth = await AuthManager.isAuthenticated();
            
            if (!isAuth) {
                // Not authenticated, redirect to login
                window.location.href = 'login.html';
                return;
            }
            
            // User is authenticated, show user info
            const userInfo = await AuthManager.getUserInfo();
            if (userInfo) {
                displayUserInfo(userInfo);
            }
        } catch (error) {
            console.error('Error checking authentication:', error);
            window.location.href = 'login.html';
        }
    }
    
    function displayUserInfo(userInfo) {
        // Add user info to header
        const header = $('.header');
        header.append(`
            <div class="user-info">
                <span class="user-id">ID: ${userInfo.id}</span>
                <span class="user-name">Tên: ${userInfo.name}</span>
                <button id="logoutBtn" class="logout-btn">Đăng xuất</button>
            </div>
        `);

        // Logout functionality
        $('#logoutBtn').click(function() {
            if (confirm('Bạn có chắc muốn đăng xuất không?')) {
                logout();
            }
        });
    }
    
    async function logout() {
        try {
            const success = await AuthManager.logout();
            if (success) {
                window.location.href = 'login.html';
            }
        } catch (error) {
            console.error('Error during logout:', error);
        }
    }
    
    function updateUI() {
        const btn = $('#toggleMode');
        const status = $('#status');
        
        if (isActive) {
            btn.text('🛑 Dừng chọn lỗi').removeClass('btn-primary').addClass('active');
            status.text('Chế độ: Đang hoạt động - Click vào vùng lỗi').removeClass('inactive').addClass('active');
        } else {
            btn.text('🎯 Bắt đầu chọn lỗi').removeClass('active').addClass('btn-primary');
            status.text('Chế độ: Không hoạt động').removeClass('active').addClass('inactive');
        }
    }
    
    function loadExtensionState() {
        console.log('Loading extension state...');
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            console.log('Active tab:', tabs[0]);
            browserAPI.tabs.sendMessage(tabs[0].id, {
                action: 'getState'
            }, function(response) {
                console.log('getState response:', response);
                if (browserAPI.runtime.lastError) {
                    console.error('Error getting state:', browserAPI.runtime.lastError);
                }
                if (response) {
                    isActive = response.isActive;
                    updateUI();
                }
            });
        });
    }
    
    function loadErrorsList() {
        console.log('=== loadErrorsList (NEW STRUCTURE) START ===');
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (browserAPI.runtime.lastError) {
                console.error('Error querying tabs:', browserAPI.runtime.lastError);
                return;
            }
            if (!tabs || !tabs[0]) {
                console.error('No active tab found');
                return;
            }
            const url = tabs[0].url;
            console.log('Loading errors for URL:', url);

            // Load from new structure: feedback.path[].data
            browserAPI.storage.local.get(['feedback'], function(result) {
                if (browserAPI.runtime.lastError) {
                    console.error('Error accessing storage:', browserAPI.runtime.lastError);
                    return;
                }
                let errors = [];
                if (result && result.feedback && Array.isArray(result.feedback.path)) {
                    const pathItem = result.feedback.path.find(p => p.full_url === url);
                    if (pathItem && Array.isArray(pathItem.data)) {
                        errors = pathItem.data;
                    }
                }
                // Fallback to old format if needed
                if ((!errors || errors.length === 0) && result && result[url]) {
                    errors = result[url];
                }
                console.log('Found errors (new structure):', errors);
                displayErrors(errors);
                updateErrorCount(errors.length);
            });
        });
    }
    
    // Add breakpoint filter buttons to HTML
    $('#controls').append(`
        <div class="breakpoint-filters">
            <button class="filter-btn active" data-breakpoint="all">Tất cả</button>
            <button class="filter-btn" data-breakpoint="desktop">Desktop</button>
            <button class="filter-btn" data-breakpoint="tablet">Tablet</button>
            <button class="filter-btn" data-breakpoint="mobile">Mobile</button>
        </div>
    `);

    // Handle breakpoint filter clicks
    $('.filter-btn').click(function() {
        $('.filter-btn').removeClass('active');
        $(this).addClass('active');
        selectedBreakpoint = $(this).data('breakpoint');
        loadErrorsList();
    });
    
    function displayErrors(errors) {
        console.log('=== displayErrors START ===');
        console.log('Total errors:', errors.length);
        
        const container = $('#errorsList');
        container.empty();
        
        if (!errors || errors.length === 0) {
            container.html('<div class="no-errors">Chưa có lỗi nào được ghi nhận</div>');
            return;
        }

        // Filter errors based on selected breakpoint
        const filteredErrors = errors.filter(error => {
            if (selectedBreakpoint === 'all') return true;
            if (!error.breakpoint) return selectedBreakpoint === 'all';
            return error.breakpoint.type === selectedBreakpoint;
        });

        if (filteredErrors.length === 0) {
            container.html(`<div class="no-errors">Không có lỗi nào ${selectedBreakpoint !== 'all' ? `trong breakpoint ${selectedBreakpoint}` : ''}</div>`);
            return;
        }

        // Add error count
        container.append(`
            <div class="error-count">
                <span>Tổng số lỗi: ${filteredErrors.length}</span>
                <span class="breakpoint-label">${selectedBreakpoint === 'all' ? 'Tất cả breakpoint' : `Breakpoint ${selectedBreakpoint}`}</span>
            </div>
        `);

        filteredErrors.forEach((error, index) => {
            const errorItem = $('<div>').addClass('error-item');
            
            // Format timestamp
            const date = new Date(error.timestamp);
            const timeString = date.toLocaleString('vi-VN');
            
            // Get latest comment
            const latestComment = error.comments[error.comments.length - 1];
            
            // Create status badge
            const statusBadge = $('<span>').addClass('status-badge');
            if (error.status === 'resolved') {
                statusBadge.addClass('resolved').text('Đã giải quyết');
            } else if (error.status === 'closed') {
                statusBadge.addClass('closed').text('Đã đóng');
            } else {
                statusBadge.addClass('open').text('Đang mở');
            }
            
            errorItem.html(`
                <div class="error-header">
                    <span class="error-number">#${index + 1}</span>
                    ${statusBadge.prop('outerHTML')}
                    <span class="error-time">${timeString}</span>
                </div>
                <div class="error-comment">${latestComment.text}</div>
                <div class="error-breakpoint">
                    <span class="breakpoint-type">${error.breakpoint ? error.breakpoint.type : 'all'}</span>
                    <span class="breakpoint-width">${error.breakpoint ? error.breakpoint.width + 'px' : ''}</span>
                </div>
            `);
            
            errorItem.click(function() {
                highlightError(error.id);
            });
            
            container.append(errorItem);
        });
        
        console.log('=== displayErrors END ===');
    }
    
    function highlightError(errorId) {
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            browserAPI.tabs.sendMessage(tabs[0].id, {
                action: 'highlightError',
                errorId: errorId
            });
        });
    }
    
    function filterErrors(searchTerm) {
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const url = tabs[0].url;
            browserAPI.storage.local.get([url], function(result) {
                const errors = result[url] || [];
                const filtered = errors.filter(error => {
                    // Search in comments
                    const hasCommentMatch = error.comments ? 
                        error.comments.some(comment => comment.text.toLowerCase().includes(searchTerm)) :
                        (error.comment && error.comment.toLowerCase().includes(searchTerm));
                    
                    // Search in selector/identifiers
                    let hasSelectorMatch = false;
                    if (error.elementIdentifiers) {
                        const identifiers = error.elementIdentifiers;
                        hasSelectorMatch = 
                            (identifiers.tagName && identifiers.tagName.includes(searchTerm)) ||
                            (identifiers.textContent && identifiers.textContent.toLowerCase().includes(searchTerm)) ||
                            (identifiers.cssSelector && identifiers.cssSelector.toLowerCase().includes(searchTerm)) ||
                            (identifiers.attributes && Object.values(identifiers.attributes).some(attr => 
                                attr && attr.toLowerCase().includes(searchTerm)
                            ));
                    } else {
                        hasSelectorMatch = error.selector && error.selector.toLowerCase().includes(searchTerm);
                    }
                    
                    // Search in status
                    const statusText = error.status === 'resolved' ? 'đã giải quyết' : 
                                     error.status === 'closed' ? 'đã đóng' : 'đang mở';
                    const hasStatusMatch = statusText.includes(searchTerm);
                    
                    return hasCommentMatch || hasSelectorMatch || hasStatusMatch;
                });
                displayErrors(filtered);
            });
        });
    }
    
    function updateErrorCount(count) {
        $('#errorCount').text(count);
    }
    
    function getDisplaySelector(error) {
        if (error.elementIdentifiers) {
            const identifiers = error.elementIdentifiers;
            
            // Prefer ID
            if (identifiers.attributes && identifiers.attributes.id) {
                return `#${identifiers.attributes.id}`;
            }
            
            // Show tag name with class or other attributes
            let display = identifiers.tagName || 'element';
            
            if (identifiers.attributes) {
                if (identifiers.attributes.class) {
                    const classes = identifiers.attributes.class.split(' ').filter(c => c.trim()).slice(0, 2);
                    if (classes.length > 0) {
                        display += '.' + classes.join('.');
                    }
                }
                
                // Show data attributes
                const dataAttrs = Object.keys(identifiers.attributes).filter(attr => attr.startsWith('data-'));
                if (dataAttrs.length > 0) {
                    display += `[${dataAttrs[0]}]`;
                }
            }
            
            // Show text content preview if available
            if (identifiers.textContent) {
                const text = identifiers.textContent.length > 20 ? 
                    identifiers.textContent.substring(0, 20) + '...' : 
                    identifiers.textContent;
                display += ` "${text}"`;
            }
            
            return display;
        }
        
        // Fallback to legacy selector
        return error.selector || 'Không xác định';
    }

    function formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
        return `${Math.floor(diff / 86400000)} ngày trước`;
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}); 