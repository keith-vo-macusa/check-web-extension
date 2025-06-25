$(document).ready(function() {
    let isActive = false;
    
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
    
    // Show all errors
    $('#showAllErrors').click(function() {
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            browserAPI.tabs.sendMessage(tabs[0].id, {
                action: 'showAllErrors'
            });
        });
    });
    
    // Hide all errors
    $('#hideAllErrors').click(function() {
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            browserAPI.tabs.sendMessage(tabs[0].id, {
                action: 'hideAllErrors'
            });
        });
    });
    
    // Clear all errors
    $('#clearAll').click(function() {
        if (confirm('Bạn có chắc muốn xóa tất cả lỗi không?')) {
            browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const url = tabs[0].url;
                browserAPI.storage.local.set({[url]: []}, function() {
                    loadErrorsList();
                    browserAPI.tabs.sendMessage(tabs[0].id, {
                        action: 'clearAllErrors'
                    });
                });
            });
        }
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
                <span class="user-id">${userInfo.id}</span>
                <span class="user-name">${userInfo.name}</span>
                <button id="logoutBtn" class="logout-btn">🚪 Đăng xuất</button>
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
        console.log('=== loadErrorsList START ===');
        console.log('loadErrorsList called');
        browserAPI.tabs.query({active: true, currentWindow: true}, function(tabs) {
            console.log('tabs.query callback triggered');
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
            
            browserAPI.storage.local.get([url], function(result) {
                console.log('storage.get callback triggered');
                if (browserAPI.runtime.lastError) {
                    console.error('Error accessing storage:', browserAPI.runtime.lastError);
                    return;
                }
                
                console.log('Storage result:', result);
                console.log('Storage result keys:', Object.keys(result));
                console.log('URL being searched:', url);
                const errors = result[url] || [];
                console.log('Found errors:', errors);
                console.log('errors type:', typeof errors, 'Array?', Array.isArray(errors));
                
                displayErrors(errors);
                updateErrorCount(errors.length);
                
                // // DEBUG: Force show test error to verify popup works
                // if (errors.length === 0) {
                //     console.log('No real errors, showing test UI');
                //     $('#errorsList').html(`
                //         <div class="error-item open" style="margin-bottom: 8px;">
                //             <div class="error-header">
                //                 <span class="error-number">#1</span>
                //                 <span class="error-status">
                //                     <span class="status-icon">🔴</span>
                //                     <span class="status-text">Đang mở</span>
                //                 </span>
                //                 <span class="comment-count">1 comment</span>
                //             </div>
                //             <div class="comment">Test error - Popup đang hoạt động bình thường!</div>
                //             <div class="meta">
                //                 <span class="selector">body</span>
                //                 <span class="timestamp">Vừa xong</span>
                //             </div>
                //         </div>
                //         <div style="text-align: center; padding: 10px; color: #6c757d; font-size: 12px;">
                //             ☝️ Đây là test error để kiểm tra popup<br>
                //             Hãy tạo lỗi thật bằng cách activate extension
                //         </div>
                //     `);
                //     $('#errorCount').text('1');
                // }
            });
        });
    }
    
    function displayErrors(errors) {
        console.log('=== displayErrors START ===');
        console.log('displayErrors called with:', errors);
        console.log('errors.length:', errors ? errors.length : 'undefined');
        
        const container = $('#errorsList');
        console.log('Container found:', container.length > 0);
        console.log('Container HTML before:', container.html().substring(0, 100));
        
        if (!errors || errors.length === 0) {
            console.log('No errors, showing empty message');
            container.html('<div class="no-errors">Chưa có lỗi nào được ghi nhận</div>');
            console.log('Empty message set, container HTML now:', container.html().substring(0, 100));
            return;
        }
        
        console.log('Clearing container and adding', errors.length, 'errors');
        container.empty();
        
        errors.forEach((error, index) => {
            console.log(`Processing error ${index + 1}:`, error);
            
            // Get latest comment and comment count
            const comments = error.comments || [{text: error.comment || 'Không có comment'}];
            const latestComment = comments[comments.length - 1];
            const commentCount = comments.length;
            
            console.log(`Error ${index + 1} - Comments:`, commentCount, 'Latest:', latestComment);
            
            // Get status info
            const statusIcon = error.status === 'resolved' ? '✅' : 
                              error.status === 'closed' ? '🔒' : '🔴';
            const statusText = error.status === 'resolved' ? 'Đã giải quyết' : 
                              error.status === 'closed' ? 'Đã đóng' : 'Đang mở';
            
            const errorItem = $(`
                <div class="error-item ${error.status || 'open'}" data-id="${error.id}">
                    <div class="error-header">
                        <span class="error-number">#${index + 1}</span>
                        <span class="error-status">
                            <span class="status-icon">${statusIcon}</span>
                            <span class="status-text">${statusText}</span>
                        </span>
                        <span class="comment-count">${commentCount} comment${commentCount > 1 ? 's' : ''}</span>
                    </div>
                    <div class="comment">${latestComment.text.length > 80 ? 
                        latestComment.text.substring(0, 80) + '...' : 
                        latestComment.text}</div>
                    <div class="meta">
                        <span class="selector">${getDisplaySelector(error)}</span>
                        <span class="timestamp">${formatTime(error.timestamp)}</span>
                    </div>
                </div>
            `);
            
            errorItem.click(function() {
                highlightError(error.id);
            });
            
            container.append(errorItem);
            console.log(`Error ${index + 1} appended to container`);
        });
        
        console.log('Final container HTML:', container.html().substring(0, 200));
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