/**
 * Trading Mastery - Real-Time Notifications & Status Indicators
 * Improves user feedback for async operations and page visibility
 */

// Enhanced notification utility with task status tracking
window.TaskNotifier = class TaskNotifier {
  constructor() {
    this.activeNotifications = new Map();
  }

  /**
   * Show a loading notification with task tracking
   * @param {string} taskId - Unique identifier for the task
   * @param {string} message - Initial message to display
   * @returns {Object} - Object with methods to update/complete the task
   */
  createTask(taskId, message) {
    const notif = document.createElement('div');
    notif.className = 'notification notification-loading';
    notif.id = `task-${taskId}`;
    
    notif.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">⟳</span>
        <div class="notification-message-wrapper">
          <span class="notification-message">${message}</span>
          <span class="notification-spinner"></span>
        </div>
        <span class="task-status">Processing...</span>
      </div>
    `;
    
    notif.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      min-width: 320px;
      max-width: 500px;
      padding: 16px 20px;
      border-radius: 8px;
      backdrop-filter: blur(10px);
      animation: slideInFromTop 0.4s ease-out;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    `;
    
    document.body.appendChild(notif);
    this.activeNotifications.set(taskId, notif);
    
    return {
      complete: (successMessage) => this.completeTask(taskId, successMessage, 'success'),
      fail: (errorMessage) => this.completeTask(taskId, errorMessage, 'error'),
      update: (newMessage) => this.updateTask(taskId, newMessage),
      setProgress: (percent) => this.setTaskProgress(taskId, percent)
    };
  }

  updateTask(taskId, message) {
    const notif = this.activeNotifications.get(taskId);
    if (notif) {
      const msgEl = notif.querySelector('.notification-message');
      if (msgEl) msgEl.textContent = message;
    }
  }

  setTaskProgress(taskId, percent) {
    const notif = this.activeNotifications.get(taskId);
    if (notif) {
      const progressEl = notif.querySelector('.task-status');
      if (progressEl) progressEl.textContent = `${Math.round(percent)}%`;
    }
  }

  completeTask(taskId, message, status) {
    const notif = this.activeNotifications.get(taskId);
    if (!notif) return;
    
    const statusColors = {
      success: { bg: 'rgba(40, 200, 120, 0.15)', border: '#28c878', icon: '✓', color: '#28c878' },
      error: { bg: 'rgba(220, 53, 69, 0.15)', border: '#dc3545', icon: '✕', color: '#ff6b6b' }
    };
    
    const config = statusColors[status];
    
    notif.className = `notification notification-${status}`;
    notif.style.backgroundColor = config.bg;
    notif.style.borderLeft = `4px solid ${config.border}`;
    notif.style.color = config.color;
    
    const iconEl = notif.querySelector('.notification-icon');
    if (iconEl) {
      iconEl.textContent = config.icon;
      iconEl.style.animation = 'none';
    }
    
    const spinnerEl = notif.querySelector('.notification-spinner');
    if (spinnerEl) spinnerEl.remove();
    
    const msgEl = notif.querySelector('.notification-message');
    if (msgEl) msgEl.textContent = message;
    
    const statusEl = notif.querySelector('.task-status');
    if (statusEl) statusEl.textContent = status === 'success' ? 'Complete' : 'Failed';
    
    setTimeout(() => {
      notif.style.opacity = '0';
      setTimeout(() => {
        notif.remove();
        this.activeNotifications.delete(taskId);
      }, 300);
    }, 3000);
  }
};

// Page visibility tracker
window.PageManager = class PageManager {
  constructor() {
    this.pages = new Map();
    this.currentPage = null;
    this.init();
  }

  init() {
    // Register all available pages
    this.registerPage('dashboard', 'Dashboard', 'Trading Dashboard', true);
    this.registerPage('trading', 'Trading', 'Live Trading Interface', true);
    this.registerPage('analysis', 'Analysis', 'Technical Analysis Tools', true);
    this.registerPage('signals', 'Signals', 'Trading Signals & Alerts', true);
    this.registerPage('bot', 'Bot', 'Automated Trading Bot', true);
    this.registerPage('education', 'Education', 'Trading Education & Resources', true);
    this.registerPage('portfolio', 'Portfolio', 'Portfolio Management', true);
    this.registerPage('settings', 'Settings', 'Account Settings', false); // Under development
  }

  registerPage(id, name, description, isComplete) {
    this.pages.set(id, {
      id,
      name,
      description,
      isComplete,
      element: document.getElementById(`page-${id}`) || 
               document.querySelector(`[data-page="${id}"]`) ||
               document.querySelector(`[data-tab="${id}"]`)
    });
  }

  showPage(pageId) {
    const page = this.pages.get(pageId);
    
    if (!page) {
      console.warn(`Page ${pageId} not found`);
      this.notifyPageError(pageId);
      return false;
    }
    
    if (!page.isComplete) {
      this.notifyPageUnderDevelopment(page);
      return false;
    }
    
    // Hide all pages
    this.pages.forEach((p) => {
      if (p.element) {
        p.element.style.display = 'none';
        p.element.style.visibility = 'hidden';
        p.element.style.zIndex = '0';
      }
    });
    
    // Show selected page
    if (page.element) {
      page.element.style.display = 'block';
      page.element.style.visibility = 'visible';
      page.element.style.zIndex = '1';
      page.element.style.position = 'relative';
      page.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    this.currentPage = pageId;
    return true;
  }

  notifyPageError(pageId) {
    const notif = document.createElement('div');
    notif.className = 'notification notification-error';
    notif.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">✕</span>
        <div class="notification-message-wrapper">
          <span class="notification-message">Page "${pageId}" not found</span>
        </div>
        <button class="notification-close">×</button>
      </div>
    `;
    this.attachNotification(notif);
  }

  notifyPageUnderDevelopment(page) {
    const notif = document.createElement('div');
    notif.className = 'notification notification-warning';
    notif.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">⚠</span>
        <div class="notification-message-wrapper">
          <span class="notification-message">"${page.name}" is still under development</span>
        </div>
        <button class="notification-close">×</button>
      </div>
    `;
    this.attachNotification(notif);
  }

  attachNotification(notif) {
    notif.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      min-width: 320px;
      max-width: 500px;
      padding: 16px 20px;
      border-radius: 8px;
      backdrop-filter: blur(10px);
      animation: slideInFromTop 0.4s ease-out;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    `;
    
    const closeBtn = notif.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.style.cssText = `
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: -4px -4px -4px 8px;
        opacity: 0.7;
      `;
      
      closeBtn.addEventListener('click', () => {
        notif.style.opacity = '0';
        setTimeout(() => notif.remove(), 300);
      });
    }
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
      notif.style.opacity = '0';
      setTimeout(() => notif.remove(), 300);
    }, 5000);
  }

  getPageStatus() {
    const status = {};
    this.pages.forEach((page, id) => {
      status[id] = {
        name: page.name,
        complete: page.isComplete,
        description: page.description
      };
    });
    return status;
  }

  logPageStatus() {
    console.log('=== PAGE STATUS ===');
    this.pages.forEach((page, id) => {
      const status = page.isComplete ? '✓ READY' : '⏳ UNDER DEVELOPMENT';
      console.log(`${status}: ${page.name} - ${page.description}`);
    });
  }
};

// Initialize globally
window.taskNotifier = new window.TaskNotifier();
window.pageManager = new window.PageManager();

// Auto-log page status on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    window.pageManager.logPageStatus();
  }, 1000);
});

// Example usage:
// window.taskNotifier.createTask('trade-001', 'Executing trade...').complete('Trade #001 executed successfully');
// window.pageManager.showPage('trading');
