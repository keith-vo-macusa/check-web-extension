// Login.js - Xử lý authentication cho Testing Assistant
class LoginManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthStatus();
    }

    bindEvents() {
        $('#loginForm').on('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Auto-focus email field
        $('#email').focus();

        // Handle Enter key
        $('#password').on('keypress', (e) => {
            if (e.which === 13) {
                this.handleLogin();
            }
        });

        // Password visibility toggle
        const togglePassword = $('#togglePassword');
        const passwordInput = $('#password');
        const eyeIcon = togglePassword.find('.eye-icon i');

        togglePassword.click(function() {
            // Toggle password visibility
            const type = passwordInput.attr('type') === 'password' ? 'text' : 'password';
            passwordInput.attr('type', type);
            
            // Toggle eye icon
            if (type === 'password') {
                eyeIcon.removeClass('fa-eye').addClass('fa-eye-slash');
            } else {
                eyeIcon.removeClass('fa-eye-slash').addClass('fa-eye');
            }
        });
    }

    async checkAuthStatus() {
        try {
            const isAuth = await AuthManager.isAuthenticated();
            
            if (isAuth) {
                // User is already authenticated, redirect to main popup
                this.redirectToMain();
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
        }
    }

    async handleLogin() {
        const email = $('#email').val().trim();
        const password = $('#password').val().trim();

        // Validate input
        if (!email || !password) {
            this.showError('Vui lòng nhập đầy đủ thông tin đăng nhập');
            return;
        }

        // Show loading state
        this.showLoading(true);
        this.hideMessages();

        try {
            // // Simulate API call delay
            // await this.delay(1000);

            // // Demo authentication (in real app, this would be API call)
            // const isAuthenticated = this.authenticateUser(username, password);

            // if (isAuthenticated) {
            //     // Save authentication state
            //     await this.saveAuthState(username);
                
            //     // Show success message
            //     this.showSuccess('Đăng nhập thành công! Đang chuyển hướng...');
                
            //     // Redirect after delay
            //     setTimeout(() => {
            //         this.redirectToMain();
            //     }, 1500);
            // } else {
            //     this.showError('Tên đăng nhập hoặc mật khẩu không đúng');
            // }

            const self = this;
            $.ajax({
                type: "POST",
                url: "https://wpm.macusaone.com/api/loginForExt",
                data: {
                    email: email,
                    password: password
                },
                dataType: "json",
                beforeSend: function () {
                    self.showLoading(true);
                },
                success: function (response) {
                    if (response.success) {
                        self.showSuccess(response.message);
                        const userInfo = response.data;
                        self.saveAuthState(userInfo);
                        self.redirectToMain();
                        chrome.tabs.query({}, function(tabs) {
                            tabs.forEach(function(tab) {
                                chrome.tabs.reload(tab.id);
                            });
                        });
                        window.close();
                    } else {
                        self.showError(response.message);
                    }
                },
                error: function (response, xhr, status, error) {
                    self.showError(response.responseJSON.message);
                },
                complete: function (response) {
                    self.showLoading(false);
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Có lỗi xảy ra, vui lòng thử lại');
        } finally {
            this.showLoading(false);
        }
    }

    async saveAuthState(data) {
        try {
            const userInfo = {
                id: data.id,
                name: data.name,
                loginTime: new Date().toISOString(),
            };

            await chrome.storage.local.set({
                isAuthenticated: true,
                userInfo: userInfo
            });
        } catch (error) {
            console.error('Error saving auth state:', error);
        }
    }

    redirectToMain() {
        // Change popup to main interface
        window.location.href = 'popup.html';
    }

    showLoading(show) {
        if (show) {
            $('#loading').show();
            $('#loginBtn').prop('disabled', true).text('Đang xác thực...');
        } else {
            $('#loading').hide();
            $('#loginBtn').prop('disabled', false).text('Đang đăng nhập...');
        }
    }

    showError(message) {
        $('#errorMessage').text(message).show();
        $('#successMessage').hide();
    }

    showSuccess(message) {
        $('#successMessage').text(message).show();
        $('#errorMessage').hide();
    }

    hideMessages() {
        $('#errorMessage').hide();
        $('#successMessage').hide();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize login manager when DOM is ready
$(document).ready(() => {
    new LoginManager();
});

