/**
 * Token Dashboard - 前端控制器
 * 包含身份验证和仪表盘功能
 */
class TokenDashboard {
    constructor() {
        this.autoRefreshInterval = null;
        this.isAutoRefreshEnabled = false;
        this.apiBaseUrl = '/api';
        this.isAuthenticated = false;

        this.initAuth();
    }

    /**
     * 初始化身份验证流程
     */
    initAuth() {
        const loginBtn = document.getElementById('login-btn');
        const tokenInput = document.getElementById('token-input');

        // 检查 sessionStorage 中是否已存在 token
        const storedToken = sessionStorage.getItem('kiro_client_token');
        if (storedToken) {
            this.verifyToken(storedToken, true); // 静默验证
        }

        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                const token = tokenInput.value.trim();
                if (token) {
                    this.verifyToken(token, false);
                } else {
                    this.showLoginError('请输入访问令牌');
                }
            });
        }

        if (tokenInput) {
            tokenInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    loginBtn.click();
                }
            });
        }
    }

    /**
     * 验证 Token
     * @param {string} token - 要验证的 token
     * @param {boolean} isSilent - 是否是静默验证 (来自 sessionStorage)
     */
    async verifyToken(token, isSilent = false) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/verify-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.valid) {
                    sessionStorage.setItem('kiro_client_token', token);
                    this.isAuthenticated = true;
                    this.showDashboard();
                    this.initDashboard();
                } else {
                    sessionStorage.removeItem('kiro_client_token');
                    if (!isSilent) this.showLoginError('令牌无效或已过期');
                }
            } else {
                sessionStorage.removeItem('kiro_client_token');
                if (!isSilent) this.showLoginError(`验证失败 (HTTP ${response.status})`);
            }
        } catch (error) {
            console.error('验证令牌时出错:', error);
            if (!isSilent) this.showLoginError('验证请求失败，请检查网络连接');
        }
    }

    /**
     * 显示登录错误信息
     * @param {string} message - 错误信息
     */
    showLoginError(message) {
        const errorMessageEl = document.getElementById('error-message');
        if (errorMessageEl) {
            errorMessageEl.textContent = message;
            setTimeout(() => {
                errorMessageEl.textContent = '';
            }, 3000);
        }
    }

    /**
     * 显示仪表盘，隐藏登录界面
     */
    showDashboard() {
        const loginContainer = document.getElementById('login-container');
        const dashboardContainer = document.getElementById('dashboard-container');
        if (loginContainer) loginContainer.style.display = 'none';
        if (dashboardContainer) dashboardContainer.style.display = 'block';
    }

    /**
     * 初始化Dashboard (验证成功后调用)
     */
    initDashboard() {
        this.bindEvents();
        this.refreshTokens();
    }

    /**
     * 绑定事件处理器 (DRY原则)
     */
    bindEvents() {
        const refreshBtn = document.querySelector('.refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshTokens());
        }

        const switchEl = document.querySelector('.switch');
        if (switchEl) {
            switchEl.addEventListener('click', () => this.toggleAutoRefresh());
        }
    }

    /**
     * 获取Token数据 - 简单直接 (KISS原则)
     */
    async refreshTokens() {
        if (!this.isAuthenticated) return;

        const tbody = document.getElementById('tokenTableBody');
        this.showLoading(tbody, '正在刷新Token数据...');
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/tokens`, {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('kiro_client_token')}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    sessionStorage.removeItem('kiro_client_token');
                    window.location.reload();
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.updateTokenTable(data);
            this.updateStatusBar(data);
            this.updateLastUpdateTime();
            
        } catch (error) {
            console.error('刷新Token数据失败:', error);
            this.showError(tbody, `加载失败: ${error.message}`);
        }
    }

    /**
     * 更新Token表格 (OCP原则 - 易于扩展新字段)
     */
    updateTokenTable(data) {
        const tbody = document.getElementById('tokenTableBody');
        
        if (!data.tokens || data.tokens.length === 0) {
            this.showError(tbody, '暂无Token数据');
            return;
        }
        
        const rows = data.tokens.map(token => this.createTokenRow(token)).join('');
        tbody.innerHTML = rows;
    }

    /**
     * 创建单个Token行 (SRP原则)
     */
    createTokenRow(token) {
        const statusClass = this.getStatusClass(token);
        const statusText = this.getStatusText(token);
        
        return `
            <tr>
                <td>${token.user_email || 'unknown'}</td>
                <td><span class="token-preview">${token.token_preview || 'N/A'}</span></td>
                <td>${token.auth_type || 'social'}</td>
                <td>${token.remaining_usage || 0}</td>
                <td>${this.formatDateTime(token.expires_at)}</td>
                <td>${this.formatDateTime(token.last_used)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    }

    /**
     * 更新状态栏 (SRP原则)
     */
    updateStatusBar(data) {
        this.updateElement('totalTokens', data.total_tokens || 0);
        this.updateElement('activeTokens', data.active_tokens || 0);
    }

    /**
     * 更新最后更新时间
     */
    updateLastUpdateTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
        this.updateElement('lastUpdate', timeStr);
    }

    /**
     * 切换自动刷新 (ISP原则 - 接口隔离)
     */
    toggleAutoRefresh() {
        const switchEl = document.querySelector('.switch');
        
        if (this.isAutoRefreshEnabled) {
            this.stopAutoRefresh();
            switchEl.classList.remove('active');
        } else {
            this.startAutoRefresh();
            switchEl.classList.add('active');
        }
    }

    /**
     * 启动自动刷新
     */
    startAutoRefresh() {
        this.autoRefreshInterval = setInterval(() => this.refreshTokens(), 30000);
        this.isAutoRefreshEnabled = true;
    }

    /**
     * 停止自动刷新
     */
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
        this.isAutoRefreshEnabled = false;
    }

    /**
     * 工具方法 - 状态判断 (KISS原则)
     */
    getStatusClass(token) {
        if (new Date(token.expires_at) < new Date()) {
            return 'status-expired';
        }
        const remaining = token.remaining_usage || 0;
        if (remaining === 0) return 'status-exhausted';
        if (remaining <= 5) return 'status-low';
        return 'status-active';
    }

    getStatusText(token) {
        if (new Date(token.expires_at) < new Date()) {
            return '已过期';
        }
        const remaining = token.remaining_usage || 0;
        if (remaining === 0) return '已耗尽';
        if (remaining <= 5) return '即将耗尽';
        return '正常';
    }

    /**
     * 工具方法 - 日期格式化 (DRY原则)
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '-';
            
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } catch (e) {
            return '-';
        }
    }

    /**
     * UI工具方法 (KISS原则)
     */
    updateElement(id, content) {
        const element = document.getElementById(id);
        if (element) element.textContent = content;
    }

    showLoading(container, message) {
        container.innerHTML = `
            <tr>
                <td colspan="7" class="loading">
                    <div class="spinner"></div>
                    ${message}
                </td>
            </tr>
        `;
    }

    showError(container, message) {
        container.innerHTML = `
            <tr>
                <td colspan="7" class="error">
                    ${message}
                </td>
            </tr>
        `;
    }
}

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new TokenDashboard();
});
