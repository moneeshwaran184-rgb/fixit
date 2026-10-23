/**
 * FixIt Core Application Controller
 * Handles tabs, authentication state, role-based navigation, global modals, toasts, and UI helpers
 */
const App = {
  currentTab: 'dashboard',
  pendingRedirectTab: null,
  activeIssueId: null,

  async init() {
    this.setupNavigation();
    this.setupModalListeners();
    this.setupAuthListeners();
    this.refreshIcons();

    // Check existing authentication state on page load
    await this.checkAuthState();

    // Handle initial navigation tab from URL hash
    const hash = window.location.hash.replace('#', '');
    if (['dashboard', 'report', 'admin', 'analytics', 'myreports'].includes(hash)) {
      await this.switchTab(hash);
    } else {
      await this.switchTab('dashboard');
    }

    // Initialize sub-controllers
    if (window.HeroScrollAnimation) window.HeroScrollAnimation.init();
    if (window.Dashboard) window.Dashboard.init();
    if (window.ReportForm) window.ReportForm.init();
    if (window.Admin) window.Admin.init();
    if (window.Analytics) window.Analytics.init();
  },

  refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  setupNavigation() {
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const tab = btn.getAttribute('data-tab-target');
        await this.switchTab(tab);
      });
    });

    // Mobile nav menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileNav = document.getElementById('mobileNav');
    if (mobileMenuBtn && mobileNav) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileNav.classList.toggle('hidden');
      });
    }

    // Handle URL hash changes directly
    window.addEventListener('hashchange', async () => {
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'report', 'admin', 'analytics', 'myreports'].includes(hash) && hash !== this.currentTab) {
        await this.switchTab(hash);
      }
    });
  },

  async switchTab(tabName) {
    // 1. Role-based Route Protection for Admin Tab
    if (tabName === 'admin') {
      const isAdmin = await API.isAdmin();
      if (!isAdmin) {
        this.showToast('Access Denied: Facility Administrator permissions required.', 'error');
        if (this.currentTab !== 'dashboard') {
          await this.switchTab('dashboard');
        }
        return;
      }
    }

    // 2. Role-based Protection for Reporting Tab (Admins cannot report, students can)
    if (tabName === 'report') {
      const isAdmin = await API.isAdmin();
      if (isAdmin) {
        this.showToast('Admins cannot access student issue reporting.', 'info');
        if (this.currentTab === 'report' || !this.currentTab) {
          await this.switchTab('admin');
        }
        return;
      }
      const user = await API.getCurrentUser();
      if (!user) {
        this.pendingRedirectTab = 'report';
        this.showToast('Please sign in as a student to report an issue.', 'info');
        this.openModal('studentAuthModal');
        return;
      }
    }

    // 3. Role-based Route Protection for My Reports Tab (Admins cannot access, return to Campus Feed)
    if (tabName === 'myreports') {
      const isAdmin = await API.isAdmin();
      if (isAdmin) {
        if (this.currentTab !== 'dashboard') {
          await this.switchTab('dashboard');
        }
        return;
      }
    }

    this.currentTab = tabName;
    window.location.hash = tabName;

    // Toggle content visibility
    document.querySelectorAll('.tab-section').forEach(sec => {
      sec.classList.add('hidden');
    });

    const activeSec = document.getElementById(`section-${tabName}`);
    if (activeSec) {
      activeSec.classList.remove('hidden');
      activeSec.classList.add('animate-fade-in');
    }

    // Update active nav button state
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      const target = btn.getAttribute('data-tab-target');
      if (target === tabName) {
        btn.classList.add('bg-indigo-50', 'text-indigo-600', 'font-semibold');
        btn.classList.remove('text-slate-600', 'hover:bg-slate-50');
      } else {
        btn.classList.remove('bg-indigo-50', 'text-indigo-600', 'font-semibold');
        btn.classList.add('text-slate-600', 'hover:bg-slate-50');
      }
    });

    // Close mobile nav if open
    const mobileNav = document.getElementById('mobileNav');
    if (mobileNav && !mobileNav.classList.contains('hidden')) {
      mobileNav.classList.add('hidden');
    }

    // Trigger tab specific refreshes
    if (tabName === 'dashboard') {
      if (window.Dashboard) {
        window.Dashboard.loadIssues();
        window.Dashboard.loadQuickStats();
      }
      if (window.HeroScrollAnimation) {
        window.HeroScrollAnimation.onTabActivated('dashboard');
      }
    } else {
      if (window.HeroScrollAnimation) {
        window.HeroScrollAnimation.onTabDeactivated();
      }
      if (tabName === 'admin' && window.Admin) {
        window.Admin.loadAdminData();
      } else if (tabName === 'analytics' && window.Analytics) {
        window.Analytics.loadAnalytics();
      } else if (tabName === 'myreports' && window.MyReports) {
        window.MyReports.load();
      }
    }

    this.refreshIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  setupModalListeners() {
    // Backdrop close
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
      bd.addEventListener('click', (e) => {
        if (e.target === bd) {
          this.closeModals();
        }
      });
    });

    // Close button triggers
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeModals();
      });
    });

    // Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModals();
      }
    });
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.body.style.overflow = 'hidden';
      if (window.HeroScrollAnimation) {
        window.HeroScrollAnimation.stopRaf();
      }
      this.refreshIcons();
    }
  },

  closeModals() {
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });
    document.body.style.overflow = '';
    if (this.currentTab === 'dashboard' && window.HeroScrollAnimation) {
      window.HeroScrollAnimation.onTabActivated('dashboard');
    }
  },

  setupAuthListeners() {
    const openBtn = document.getElementById('authModalOpenBtn');
    const signOutBtn = document.getElementById('authSignOutBtn');
    const tabSignIn = document.getElementById('authTabSignIn');
    const tabSignUp = document.getElementById('authTabSignUp');
    const form = document.getElementById('studentAuthForm');
    const signUpFields = document.getElementById('authSignUpFields');
    const modalTitle = document.getElementById('authModalTitle');
    const submitBtnText = document.getElementById('authSubmitBtnText');

    let isSignUpMode = false;

    if (openBtn) {
      openBtn.addEventListener('click', async () => {
        const user = await API.getCurrentUser();
        if (!user) {
          this.openModal('studentAuthModal');
        }
      });
    }

    if (tabSignIn && tabSignUp) {
      tabSignIn.addEventListener('click', () => {
        isSignUpMode = false;
        tabSignIn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
        tabSignIn.classList.remove('text-slate-600');
        tabSignUp.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
        tabSignUp.classList.add('text-slate-600');
        if (signUpFields) signUpFields.classList.add('hidden');
        if (modalTitle) modalTitle.textContent = 'Student Portal Sign In';
        if (submitBtnText) submitBtnText.textContent = 'Sign In to FixIt';
      });

      tabSignUp.addEventListener('click', () => {
        isSignUpMode = true;
        tabSignUp.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
        tabSignUp.classList.remove('text-slate-600');
        tabSignIn.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
        tabSignIn.classList.add('text-slate-600');
        if (signUpFields) signUpFields.classList.remove('hidden');
        if (modalTitle) modalTitle.textContent = 'Register Student Account';
        if (submitBtnText) submitBtnText.textContent = 'Create Account';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('authEmail')?.value.trim();
        const password = document.getElementById('authPassword')?.value;
        const fullName = document.getElementById('authFullName')?.value.trim();
        const studentId = document.getElementById('authStudentId')?.value.trim();
        const submitBtn = document.getElementById('authSubmitBtn');

        if (!email || !password) {
          this.showToast('Please enter both email and password.', 'error');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⏳</span> Validating...';
        }

        try {
          if (isSignUpMode) {
            await API.signUp(email, password, fullName, studentId);
            this.showToast('Account registered successfully! You may now sign in.', 'success');
            // Switch to sign in tab
            if (tabSignIn) tabSignIn.click();
          } else {
            await API.signIn(email, password);
            this.showToast('Signed in successfully!', 'success');
            this.closeModals();
            await this.checkAuthState();

            // Continue pending action if any
            if (this.pendingRedirectTab) {
              const target = this.pendingRedirectTab;
              this.pendingRedirectTab = null;
              await this.switchTab(target);
            }
          }
        } catch (err) {
          this.showToast(err.message || 'Authentication error', 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = isSignUpMode ? 'Create Account' : 'Sign In to FixIt';
            this.refreshIcons();
          }
        }
      });
    }

    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        await API.signOut();
        this.showToast('Signed out successfully.', 'info');
        await this.checkAuthState();
        await this.switchTab('dashboard');
      });
    }

    // Subscribe to auth state changes in Supabase JS v2
    if (window.supabaseClient) {
      window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
        await this.checkAuthState();
      });
    }
  },

  getUserDisplayName(user) {
    if (!user) return 'Student';
    let name = '';
    if (user.user_metadata) {
      name = user.user_metadata.full_name || user.user_metadata.name || '';
    }
    if (!name || typeof name !== 'string' || !name.trim() || name === 'undefined' || name === 'null' || name === 'NaN') {
      name = user.email || 'Student';
    }
    return String(name).trim();
  },

  async checkAuthState() {
    const authBtn = document.getElementById('authModalOpenBtn');
    const signedInGroup = document.getElementById('authSignedInGroup');
    const authUserName = document.getElementById('authUserName');
    const roleIndicator = document.getElementById('roleIndicator');
    const roleBadge = document.getElementById('roleIndicatorBadge');

    if (!window.supabaseClient) return;

    try {
      // Supabase session is the single source of truth
      const user = await API.getCurrentUser();
      const isAdmin = user ? await API.isAdmin() : false;

      // Enforce Admin Tab visibility strictly based on authorization
      document.querySelectorAll('[data-tab-target="admin"]').forEach(el => {
        if (isAdmin) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      });

      // Hide student reporting controls from admins; keep available for students & visitors
      document.querySelectorAll('[data-tab-target="report"]').forEach(el => {
        if (isAdmin) {
          el.classList.add('hidden');
        } else {
          el.classList.remove('hidden');
        }
      });

      // Hide My Reports navigation tab whenever an admin is signed in; keep available for signed-in students
      document.querySelectorAll('[data-tab-target="myreports"]').forEach(el => {
        if (isAdmin) {
          el.classList.add('hidden');
        } else {
          el.classList.remove('hidden');
        }
      });

      // If currently on report tab when verified as admin, redirect to admin management
      if (isAdmin && this.currentTab === 'report') {
        await this.switchTab('admin');
      }

      // If currently on myreports tab when verified as admin, return to Campus Feed
      if (isAdmin && (this.currentTab === 'myreports' || window.location.hash === '#myreports')) {
        await this.switchTab('dashboard');
      }

      if (user) {
        // Authenticated Session: Show user profile name & Log Out control; Never open Sign In screen
        const displayName = this.getUserDisplayName(user);

        if (authUserName) {
          authUserName.textContent = isAdmin ? `${displayName} (Admin)` : displayName;
        }

        // Hide Sign In button
        if (authBtn) authBtn.classList.add('hidden');

        // Show Signed In group (User name + Log Out)
        if (signedInGroup) signedInGroup.classList.remove('hidden');

        if (roleIndicator) {
          roleIndicator.textContent = isAdmin ? 'Facility Admin' : 'Campus Student';
        }
        if (roleBadge) roleBadge.classList.remove('hidden');

        // Autofill email in complaint form if empty
        const contactInput = document.getElementById('reportContact');
        if (contactInput && !contactInput.value) {
          contactInput.value = user.email || '';
        }
      } else {
        // Signed out state: Only show Sign In button
        if (authBtn) authBtn.classList.remove('hidden');
        if (signedInGroup) signedInGroup.classList.add('hidden');

        if (roleIndicator) roleIndicator.textContent = 'Public Visitor';
        if (roleBadge) roleBadge.classList.remove('hidden');

        // If on admin tab while signed out, redirect to dashboard
        if (this.currentTab === 'admin') {
          await this.switchTab('dashboard');
        }
      }

      this.refreshIcons();
    } catch (e) {
      console.warn('Auth state check error:', e);
    }
  },

  showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    const colorClasses = {
      success: 'bg-emerald-600 text-white border-emerald-700',
      error: 'bg-rose-600 text-white border-rose-700',
      warning: 'bg-amber-600 text-white border-amber-700',
      info: 'bg-indigo-600 text-white border-indigo-700'
    }[type] || 'bg-slate-800 text-white border-slate-900';

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-fade-in ${colorClasses}`;

    let iconName = 'check-circle-2';
    if (type === 'error') iconName = 'alert-triangle';
    if (type === 'info') iconName = 'info';

    toast.innerHTML = `
      <i data-lucide="${iconName}" class="w-5 h-5 shrink-0"></i>
      <span class="flex-1">${message}</span>
      <button class="text-white/80 hover:text-white p-1" onclick="this.parentElement.remove()">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    `;

    toastContainer.appendChild(toast);
    this.refreshIcons();

    setTimeout(() => {
      if (toast && toast.parentElement) {
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  },

  getPriorityBadge(priority, showIcon = true) {
    const badges = {
      'Critical': {
        class: 'badge-critical',
        label: 'Critical',
        icon: 'alert-octagon'
      },
      'High': {
        class: 'badge-high',
        label: 'High',
        icon: 'alert-triangle'
      },
      'Medium': {
        class: 'badge-medium',
        label: 'Medium',
        icon: 'clock'
      },
      'Low': {
        class: 'badge-low',
        label: 'Low',
        icon: 'info'
      }
    };

    const b = badges[priority] || badges['Medium'];
    const iconHtml = showIcon ? `<i data-lucide="${b.icon}" class="w-3 h-3"></i>` : '';
    return `<span class="badge ${b.class}">${iconHtml} ${b.label}</span>`;
  },

  getStatusBadge(status) {
    const raw = (status || 'Submitted').trim();
    const s = raw.toLowerCase();
    let badgeClass = 'badge-submitted';
    let icon = 'clock';
    let label = 'Submitted';

    if (s.includes('resolved') || s.includes('done') || s.includes('closed')) {
      badgeClass = 'badge-resolved';
      icon = 'check-circle';
      label = 'Resolved';
    } else if (s.includes('progress') || s.includes('working')) {
      badgeClass = 'badge-in-progress';
      icon = 'wrench';
      label = 'In Progress';
    } else if (s.includes('submit') || s.includes('pend') || s.includes('open')) {
      badgeClass = 'badge-submitted';
      icon = 'clock';
      label = 'Submitted';
    } else {
      label = raw;
    }

    return `<span class="badge ${badgeClass}"><i data-lucide="${icon}" class="w-3 h-3"></i> ${label}</span>`;
  },

  formatDate(dateStr) {
    if (!dateStr) return 'Recently';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
};

window.App = App;

// Bootstrap on DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
