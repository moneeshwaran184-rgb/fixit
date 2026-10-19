/**
 * FixIt Admin Issue Management Controller
 * Handles status workflows, priority overrides, admin filters, and timeline auditing
 */
const Admin = {
  currentFilters: {
    q: '',
    status: '',
    priority: '',
    category: ''
  },
  searchDebounce: null,
  activeAdminIssue: null,

  init() {
    this.setupAdminFilters();
    this.loadAdminData();
  },

  setupAdminFilters() {
    const searchInput = document.getElementById('adminSearch');
    const statusSelect = document.getElementById('adminFilterStatus');
    const prioritySelect = document.getElementById('adminFilterPriority');
    const categorySelect = document.getElementById('adminFilterCategory');
    const resetFiltersBtn = document.getElementById('adminResetFiltersBtn');
    const criticalPresetBtn = document.getElementById('adminPresetCriticalBtn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(this.searchDebounce);
        this.searchDebounce = setTimeout(() => {
          this.currentFilters.q = e.target.value.trim();
          this.loadAdminIssues();
        }, 300);
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.currentFilters.status = e.target.value;
        this.loadAdminIssues();
      });
    }

    if (prioritySelect) {
      prioritySelect.addEventListener('change', (e) => {
        this.currentFilters.priority = e.target.value;
        this.loadAdminIssues();
      });
    }

    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        this.currentFilters.category = e.target.value;
        this.loadAdminIssues();
      });
    }

    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', () => {
        this.resetFilters();
      });
    }

    // Preset: Critical Submitted Issues
    if (criticalPresetBtn) {
      criticalPresetBtn.addEventListener('click', () => {
        this.currentFilters.priority = 'Critical';
        this.currentFilters.status = 'Submitted';
        this.currentFilters.category = '';
        this.currentFilters.q = '';

        if (statusSelect) statusSelect.value = 'Submitted';
        if (prioritySelect) prioritySelect.value = 'Critical';
        if (categorySelect) categorySelect.value = '';
        if (searchInput) searchInput.value = '';

        App.showToast('Showing all Critical Submitted complaints', 'info');
        this.loadAdminIssues();
      });
    }
  },

  resetFilters() {
    this.currentFilters = { q: '', status: '', priority: '', category: '' };
    const searchInput = document.getElementById('adminSearch');
    const statusSelect = document.getElementById('adminFilterStatus');
    const prioritySelect = document.getElementById('adminFilterPriority');
    const categorySelect = document.getElementById('adminFilterCategory');

    if (searchInput) searchInput.value = '';
    if (statusSelect) statusSelect.value = '';
    if (prioritySelect) prioritySelect.value = '';
    if (categorySelect) categorySelect.value = '';

    this.loadAdminIssues();
  },

  async loadAdminData() {
    const isAdmin = await API.isAdmin();
    if (!isAdmin) {
      const tableBody = document.getElementById('adminIssuesTableBody');
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="py-12 text-center text-rose-500 font-semibold">
              🔒 Access Denied: Administrator authentication required (UID: 9d8e6490-d441-4099-b0ae-e7b11e0c8a95).
            </td>
          </tr>
        `;
      }
      return;
    }

    await Promise.all([
      this.loadAdminStats(),
      this.loadAdminIssues()
    ]);
  },

  async loadAdminStats() {
    try {
      const stats = await API.getStats();
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setVal('adminTotalCount', stats.total_issues);
      setVal('adminPendingCount', stats.submitted_count || stats.pending_count);
      setVal('adminSubmittedCount', stats.submitted_count || stats.pending_count);
      setVal('adminInProgressCount', stats.in_progress_count);
      setVal('adminResolvedCount', stats.resolved_count);

      setVal('adminCriticalCount', stats.critical_count);
      setVal('adminHighCount', stats.high_count);
      setVal('adminMediumCount', stats.medium_count);
      setVal('adminLowCount', stats.low_count);

      const rateEl = document.getElementById('adminResolutionRateBar');
      const rateText = document.getElementById('adminResolutionRateText');
      if (rateEl) rateEl.style.width = `${stats.resolution_rate}%`;
      if (rateText) rateText.textContent = `${stats.resolution_rate}% Resolved`;
    } catch (err) {
      console.warn('Admin stats error:', err);
    }
  },

  async loadAdminIssues() {
    const tableBody = document.getElementById('adminIssuesTableBody');
    const countBadge = document.getElementById('adminResultsBadge');
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-slate-400">
          <svg class="animate-spin h-6 w-6 text-indigo-600 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <p class="text-xs">Loading maintenance tickets...</p>
        </td>
      </tr>
    `;

    try {
      const res = await API.getIssues(this.currentFilters);
      const issues = res.issues || [];

      if (countBadge) {
        countBadge.textContent = `${issues.length} records`;
      }

      if (issues.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="py-12 text-center text-slate-500 bg-white">
              <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
              <p class="font-medium text-sm">No complaints found</p>
              <p class="text-xs text-slate-400 mt-1">Try resetting the search filters</p>
            </td>
          </tr>
        `;
        App.refreshIcons();
        return;
      }

      tableBody.innerHTML = '';
      issues.forEach(issue => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition-colors border-b border-slate-100 text-xs';

        // Action quick button
        let quickAction = '';
        const currentStatus = (issue.status || '').toLowerCase().trim();
        if (currentStatus === 'submitted' || currentStatus === 'pending') {
          quickAction = `
            <button class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg border border-indigo-200 transition" onclick="Admin.advanceStatus(${issue.id}, 'In Progress')">
              Start Work
            </button>
          `;
        } else if (currentStatus === 'in progress' || currentStatus === 'in_progress') {
          quickAction = `
            <button class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-lg border border-emerald-200 transition" onclick="Admin.advanceStatus(${issue.id}, 'Resolved')">
              Mark as Resolved
            </button>
          `;
        } else {
          quickAction = `
            <span class="text-emerald-600 font-medium flex items-center gap-1">
              <i data-lucide="check-check" class="w-3.5 h-3.5"></i> Closed
            </span>
          `;
        }

        tr.innerHTML = `
          <td class="py-3.5 px-4 font-mono font-bold text-slate-800">
            ${issue.issue_code}
          </td>
          <td class="py-3.5 px-4">
            <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
              ${issue.category}
            </span>
          </td>
          <td class="py-3.5 px-4 max-w-xs">
            <div class="font-medium text-slate-900 truncate">${issue.title || issue.description}</div>
            <div class="text-[11px] text-slate-500 truncate mt-0.5">📍 ${issue.location} ${issue.specific_area ? '· ' + issue.specific_area : ''}</div>
          </td>
          <td class="py-3.5 px-4">
            ${App.getPriorityBadge(issue.priority)}
          </td>
          <td class="py-3.5 px-4">
            ${App.getStatusBadge(issue.status)}
          </td>
          <td class="py-3.5 px-4 font-medium text-slate-700">
            👥 ${issue.people_affected}
          </td>
          <td class="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
            ${quickAction}
            <button class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition" onclick="Admin.openAdminModal(${issue.id})">
              Manage
            </button>
          </td>
        `;

        tableBody.appendChild(tr);
      });

      App.refreshIcons();
    } catch (err) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-rose-500 font-medium">
            Failed to load admin records: ${err.message}
          </td>
        </tr>
      `;
    }
  },

  async advanceStatus(issueId, newStatus) {
    try {
      await API.updateStatus(issueId, newStatus, `Quick advance to ${newStatus} by admin`);
      App.showToast(`Issue status updated to ${newStatus}`, 'success');
      this.loadAdminData();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async openAdminModal(issueId) {
    try {
      const issue = await API.getIssue(issueId);
      this.activeAdminIssue = issue;

      const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setEl('adminModalIssueCode', issue.issue_code);
      setEl('adminModalTitle', issue.title || issue.description);
      setEl('adminModalDescription', issue.description);
      setEl('adminModalLocation', `${issue.location} ${issue.specific_area ? '· ' + issue.specific_area : ''}`);
      setEl('adminModalCategory', issue.category);
      setEl('adminModalPeopleCount', `${issue.people_affected} affected`);

      // Priority and Status selectors
      const statusSelect = document.getElementById('adminModalStatusSelect');
      const prioritySelect = document.getElementById('adminModalPrioritySelect');
      if (statusSelect) {
        const st = (issue.status || 'Submitted').trim();
        statusSelect.value = (st.toLowerCase() === 'pending') ? 'Submitted' : st;
      }
      if (prioritySelect) prioritySelect.value = issue.priority;

      // Status badge & priority badge
      const pBadge = document.getElementById('adminModalPriorityBadge');
      if (pBadge) pBadge.innerHTML = App.getPriorityBadge(issue.priority);

      const sBadge = document.getElementById('adminModalStatusBadge');
      if (sBadge) sBadge.innerHTML = App.getStatusBadge(issue.status);

      // Photo
      const photoBox = document.getElementById('adminModalPhotoBox');
      const photoImg = document.getElementById('adminModalPhotoImg');
      if (photoBox) {
        let videoEl = document.getElementById('adminModalVideo');
        if (issue.video_url) {
          if (!videoEl) {
            videoEl = document.createElement('video');
            videoEl.id = 'adminModalVideo';
            videoEl.className = 'w-full max-h-60 object-cover rounded-xl mt-3';
            videoEl.controls = true;
            photoBox.appendChild(videoEl);
          }
          videoEl.src = issue.video_url;
          videoEl.classList.remove('hidden');
        } else if (videoEl) {
          videoEl.classList.add('hidden');
        }

        if (issue.photo_url) {
          if (photoImg) {
            photoImg.src = issue.photo_url;
            photoImg.classList.remove('hidden');
          }
        } else if (photoImg) {
          photoImg.classList.add('hidden');
        }

        if (issue.photo_url || issue.video_url) {
          photoBox.classList.remove('hidden');
        } else {
          photoBox.classList.add('hidden');
        }
      }

      // Timeline render
      const timelineContainer = document.getElementById('adminModalTimeline');
      if (timelineContainer) {
        timelineContainer.innerHTML = '';
        (issue.timeline || []).forEach(t => {
          const div = document.createElement('div');
          div.className = 'flex items-start gap-3 relative pb-4 text-xs';
          div.innerHTML = `
            <div class="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold shrink-0 z-10 border border-slate-200">
              <i data-lucide="check" class="w-3.5 h-3.5"></i>
            </div>
            <div class="flex-1">
              <div class="flex justify-between items-center">
                <span class="font-semibold text-slate-800">${t.stage}</span>
                <span class="text-slate-400 text-[11px]">${App.formatDate(t.created_at)}</span>
              </div>
              <p class="text-slate-600 mt-0.5">${t.action}</p>
              ${t.notes ? `<p class="text-slate-500 italic mt-0.5">"${t.notes}"</p>` : ''}
              <span class="text-[10px] text-slate-400">— ${t.actor}</span>
            </div>
          `;
          timelineContainer.appendChild(div);
        });
      }

      // Linked Reports
      const linkedContainer = document.getElementById('adminModalLinkedContainer');
      const linkedList = document.getElementById('adminModalLinkedList');
      if (linkedContainer && linkedList) {
        if (issue.linked_reports && issue.linked_reports.length > 0) {
          linkedContainer.classList.remove('hidden');
          linkedList.innerHTML = '';
          issue.linked_reports.forEach((lr, i) => {
            const li = document.createElement('li');
            li.className = 'bg-slate-50 p-2 rounded-lg text-xs text-slate-600 border border-slate-200';
            li.innerHTML = `
              <div class="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>Linked Incident #${i + 1}</span>
                <span>${App.formatDate(lr.created_at)}</span>
              </div>
              <p>${lr.reporter_note || 'Reported separately and merged'}</p>
            `;
            linkedList.appendChild(li);
          });
        } else {
          linkedContainer.classList.add('hidden');
        }
      }

      // Save changes button
      const saveBtn = document.getElementById('adminModalSaveBtn');
      if (saveBtn) {
        saveBtn.onclick = () => this.saveAdminChanges(issue.id);
      }

      App.openModal('adminManageModal');
      App.refreshIcons();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async saveAdminChanges(issueId) {
    const statusSelect = document.getElementById('adminModalStatusSelect');
    const prioritySelect = document.getElementById('adminModalPrioritySelect');
    const notesInput = document.getElementById('adminModalStatusNotes');

    const newStatus = statusSelect ? statusSelect.value : null;
    const newPriority = prioritySelect ? prioritySelect.value : null;
    const notes = notesInput ? notesInput.value.trim() : '';

    try {
      if (newStatus && this.activeAdminIssue && newStatus !== this.activeAdminIssue.status) {
        await API.updateStatus(issueId, newStatus, notes || `Status changed by Admin`);
      }

      if (newPriority && this.activeAdminIssue && newPriority !== this.activeAdminIssue.priority) {
        await API.updatePriority(issueId, newPriority, 'Admin reassessed priority level');
      }

      App.showToast('Ticket updated successfully', 'success');
      App.closeModals();
      this.loadAdminData();
    } catch (err) {
      App.showToast(err.message || 'Failed to save changes', 'error');
    }
  }
};

window.Admin = Admin;
