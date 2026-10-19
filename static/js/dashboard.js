/**
 * FixIt User Dashboard Controller
 * Displays campus issue feed, multi-filter search, stats cards, and detail modal
 */
const Dashboard = {
  currentFilters: {
    q: '',
    status: '',
    priority: '',
    category: '',
    location: ''
  },
  searchDebounce: null,

  init() {
    this.setupFilters();
    this.loadQuickStats();
    this.loadIssues();
  },

  setupFilters() {
    const searchInput = document.getElementById('dashboardSearch');
    const categorySelect = document.getElementById('filterCategory');
    const clearBtn = document.getElementById('clearFiltersBtn');

    // Debounced search
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(this.searchDebounce);
        this.searchDebounce = setTimeout(() => {
          this.currentFilters.q = e.target.value.trim();
          this.loadIssues();
        }, 300);
      });
    }

    // Category filter
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        this.currentFilters.category = e.target.value;
        this.loadIssues();
      });
    }

    // Status filter buttons
    document.querySelectorAll('[data-filter-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-filter-status');
        this.currentFilters.status = val;
        this.updateFilterButtonStyles('data-filter-status', val);
        this.loadIssues();
      });
    });

    // Priority filter buttons
    document.querySelectorAll('[data-filter-priority]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-filter-priority');
        this.currentFilters.priority = val;
        this.updateFilterButtonStyles('data-filter-priority', val);
        this.loadIssues();
      });
    });

    // Clear filters
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.resetFilters();
      });
    }
  },

  updateFilterButtonStyles(attr, activeVal) {
    document.querySelectorAll(`[${attr}]`).forEach(btn => {
      const val = btn.getAttribute(attr);
      if (val === activeVal) {
        btn.classList.add('bg-slate-900', 'text-white', 'shadow-sm');
        btn.classList.remove('bg-white', 'text-slate-600', 'hover:bg-slate-100');
      } else {
        btn.classList.remove('bg-slate-900', 'text-white', 'shadow-sm');
        btn.classList.add('bg-white', 'text-slate-600', 'hover:bg-slate-100');
      }
    });
  },

  resetFilters() {
    this.currentFilters = { q: '', status: '', priority: '', category: '', location: '' };
    const searchInput = document.getElementById('dashboardSearch');
    const categorySelect = document.getElementById('filterCategory');

    if (searchInput) searchInput.value = '';
    if (categorySelect) categorySelect.value = '';

    this.updateFilterButtonStyles('data-filter-status', '');
    this.updateFilterButtonStyles('data-filter-priority', '');
    this.loadIssues();
  },

  async loadQuickStats() {
    try {
      const stats = await API.getStats();
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      const openCount = (stats.submitted_count || stats.pending_count || 0) + (stats.in_progress_count || 0);
      setVal('statTotalOpen', openCount);
      setVal('statPending', stats.submitted_count || stats.pending_count || 0);
      setVal('statSubmitted', stats.submitted_count || stats.pending_count || 0);
      setVal('statInProgress', stats.in_progress_count || 0);
      setVal('statResolved', stats.resolved_count || 0);
    } catch (err) {
      console.warn('Quick stats load error:', err);
    }
  },

  async loadIssues() {
    const container = document.getElementById('issuesGridContainer');
    const countLabel = document.getElementById('resultsCountLabel');
    if (!container) return;

    container.innerHTML = `
      <div class="col-span-full py-16 text-center text-slate-400">
        <svg class="animate-spin h-8 w-8 text-indigo-600 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <p class="text-sm font-medium">Searching campus maintenance records...</p>
      </div>
    `;

    try {
      const res = await API.getIssues(this.currentFilters);
      const issues = res.issues || [];

      if (countLabel) {
        countLabel.textContent = `Showing ${issues.length} of ${res.total} reported issue${res.total === 1 ? '' : 's'}`;
      }

      if (issues.length === 0) {
        container.innerHTML = `
          <div class="col-span-full py-16 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <div class="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <i data-lucide="check-circle" class="w-7 h-7"></i>
            </div>
            <h3 class="text-base font-semibold text-slate-800">No matching issues found</h3>
            <p class="text-sm text-slate-500 mt-1 max-w-sm mx-auto">There are no maintenance complaints matching your current filter criteria.</p>
            <button class="mt-4 px-4 py-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 rounded-xl" onclick="Dashboard.resetFilters()">
              Clear Active Filters
            </button>
          </div>
        `;
        App.refreshIcons();
        return;
      }

      container.innerHTML = '';
      issues.forEach(issue => {
        container.appendChild(this.createIssueCard(issue));
      });

      App.refreshIcons();
    } catch (err) {
      container.innerHTML = `
        <div class="col-span-full py-12 text-center text-rose-500">
          <p class="font-medium">Error loading complaints: ${err.message}</p>
        </div>
      `;
    }
  },

  createIssueCard(issue) {
    const card = document.createElement('div');
    const borderClass = {
      'Critical': 'critical-border',
      'High': 'high-border',
      'Medium': 'medium-border',
      'Low': 'low-border'
    }[issue.priority] || 'medium-border';

    card.className = `issue-card bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between cursor-pointer hover:border-slate-300 ${borderClass}`;
    card.onclick = () => this.openIssueModal(issue.issue_code);

    const hasPhoto = Boolean(issue.photo_url);

    card.innerHTML = `
      <div>
        <!-- Card Header: Badges & ID -->
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-bold font-mono px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
              ${issue.issue_code}
            </span>
            ${App.getPriorityBadge(issue.priority)}
            ${App.getStatusBadge(issue.status)}
          </div>
          ${hasPhoto ? '<span class="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1 border border-indigo-100"><i data-lucide="camera" class="w-3.5 h-3.5"></i> Photo</span>' : ''}
        </div>

        ${hasPhoto ? `
          <!-- Photo Proof Preview in Public Feed Card -->
          <div class="mb-3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 relative group">
            <img 
              src="${issue.photo_url}" 
              alt="Photo proof for ${issue.issue_code}" 
              class="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              onerror="this.parentElement.style.display='none'"
            >
            <div class="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] rounded font-medium flex items-center gap-1">
              <i data-lucide="camera" class="w-3 h-3"></i> Photo Proof
            </div>
          </div>
        ` : ''}

        <!-- Issue Title & Description -->
        <h4 class="text-sm font-semibold text-slate-900 line-clamp-1 mb-1.5">${issue.title || issue.description}</h4>
        <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-4">${issue.description}</p>
      </div>

      <!-- Card Footer -->
      <div class="pt-3 border-t border-slate-100 flex flex-col gap-2 text-xs text-slate-500">
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1 font-medium text-slate-700 truncate">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-indigo-500 shrink-0"></i>
            <span class="truncate">${issue.location} ${issue.specific_area ? '· ' + issue.specific_area : ''}</span>
          </span>
          <span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-medium shrink-0">
            ${issue.category}
          </span>
        </div>

        <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1">
          <span class="flex items-center gap-1 font-medium ${issue.people_affected > 1 ? 'text-indigo-600 font-semibold' : ''}">
            <i data-lucide="users" class="w-3 h-3"></i>
            ${issue.people_affected} affected/reported
          </span>
          <span>${App.formatDate(issue.created_at)}</span>
        </div>
      </div>
    `;

    return card;
  },

  async openIssueModal(issueIdOrCode) {
    try {
      const issue = await API.getIssue(issueIdOrCode);
      App.activeIssueId = issue.id;

      // Populate Modal Fields
      const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setEl('modalIssueCode', issue.issue_code);
      setEl('modalTitle', issue.title || issue.description);
      setEl('modalDescription', issue.description);
      setEl('modalLocation', `${issue.location} ${issue.specific_area ? '· ' + issue.specific_area : ''}`);
      setEl('modalCategory', issue.category);
      setEl('modalCreatedAt', App.formatDate(issue.created_at));
      setEl('modalAssignedTo', issue.assigned_to || 'Campus Facilities Unit');
      setEl('modalPeopleCount', `${issue.people_affected} ${issue.people_affected === 1 ? 'person' : 'people'} affected`);

      // Priority & Status Badges
      const pBadge = document.getElementById('modalPriorityBadge');
      if (pBadge) pBadge.innerHTML = App.getPriorityBadge(issue.priority);

      const sBadge = document.getElementById('modalStatusBadge');
      if (sBadge) sBadge.innerHTML = App.getStatusBadge(issue.status);

      // Score rationale
      const scoreBox = document.getElementById('modalScoreRationale');
      if (scoreBox) {
        const pLabel = issue.priority || 'Medium';
        scoreBox.textContent = `Assigned Priority: ${pLabel} — ${issue.priority_rationale || 'Classified by safety and service impact rules.'}`;
      }

      // Photo and Video Media handling in Modal
      const photoContainer = document.getElementById('modalPhotoContainer');
      const photoImg = document.getElementById('modalPhotoImg');
      if (photoContainer) {
        let videoEl = document.getElementById('modalVideoPlayer');
        if (issue.video_url) {
          if (!videoEl) {
            videoEl = document.createElement('video');
            videoEl.id = 'modalVideoPlayer';
            videoEl.className = 'w-full max-h-72 object-cover rounded-xl mt-3';
            videoEl.controls = true;
            photoContainer.appendChild(videoEl);
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
          photoContainer.classList.remove('hidden');
        } else {
          photoContainer.classList.add('hidden');
        }
      }

      // Render Timeline
      const timelineContainer = document.getElementById('modalTimelineContainer');
      if (timelineContainer) {
        timelineContainer.innerHTML = '';
        (issue.timeline || []).forEach(t => {
          const item = document.createElement('div');
          item.className = 'flex items-start gap-3 relative pb-4 text-xs';
          item.innerHTML = `
            <div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0 z-10">
              <i data-lucide="check" class="w-3.5 h-3.5"></i>
            </div>
            <div class="flex-1 pt-0.5">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-800">${t.stage}</span>
                <span class="text-slate-400 text-[11px]">${App.formatDate(t.created_at)}</span>
              </div>
              <p class="text-slate-600 mt-0.5">${t.action}</p>
              ${t.notes ? `<p class="text-slate-500 italic mt-0.5">"${t.notes}"</p>` : ''}
              <span class="text-[10px] text-slate-400 font-medium">— by ${t.actor}</span>
            </div>
          `;
          timelineContainer.appendChild(item);
        });
      }

      // Linked Reports List
      const linkedBox = document.getElementById('modalLinkedReportsBox');
      const linkedList = document.getElementById('modalLinkedList');
      if (linkedBox && linkedList) {
        if (issue.linked_reports && issue.linked_reports.length > 0) {
          linkedBox.classList.remove('hidden');
          linkedList.innerHTML = '';
          issue.linked_reports.forEach((lr, idx) => {
            const li = document.createElement('li');
            li.className = 'text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200';
            li.innerHTML = `
              <div class="flex justify-between items-center text-[10px] text-slate-400 mb-0.5">
                <span>Linked Report #${idx + 1}</span>
                <span>${App.formatDate(lr.created_at)}</span>
              </div>
              <p>${lr.reporter_note || 'Duplicate report linked to this issue'}</p>
            `;
            linkedList.appendChild(li);
          });
        } else {
          linkedBox.classList.add('hidden');
        }
      }

      // Action button: Link My Report
      const linkReportBtn = document.getElementById('modalLinkMyReportBtn');
      if (linkReportBtn) {
        linkReportBtn.onclick = async () => {
          try {
            await API.linkReport(issue.id, 'Confirmed by campus user from issue details');
            App.showToast('Your report was linked! Affected count updated.', 'success');
            Dashboard.openIssueModal(issue.id);
            Dashboard.loadIssues();
            Dashboard.loadQuickStats();
          } catch (err) {
            App.showToast(err.message, 'error');
          }
        };
      }

      App.openModal('issueDetailModal');
      App.refreshIcons();
    } catch (err) {
      App.showToast(err.message || 'Could not load issue details', 'error');
    }
  }
};

window.Dashboard = Dashboard;
