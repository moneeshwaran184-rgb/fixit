/**
 * FixIt – My Reports Controller
 * Displays only the signed-in student's own reports by querying
 * the Supabase `reports` table via API.getMyIssues(), which keeps
 * RLS active so the server enforces reporter_id = auth.uid().
 *
 * No FastAPI endpoint is used. The Supabase JS client automatically
 * attaches the stored JWT when the query is made.
 */
const MyReports = {

  /** Called by App.switchTab('myreports') every time the tab is opened. */
  async load() {
    const isAdmin = await API.isAdmin();
    if (isAdmin) {
      if (window.App) {
        await App.switchTab('dashboard');
      }
      return;
    }

    const user = await API.getCurrentUser();

    if (!user) {
      this._showSigninPrompt();
      return;
    }

    this._showContent();
    await this._fetchAndRender();
  },

  // ── Private helpers ──────────────────────────────────────────────────────

  _showSigninPrompt() {
    const prompt  = document.getElementById('myreportsSigninPrompt');
    const content = document.getElementById('myreportsContent');
    if (prompt)  prompt.classList.remove('hidden');
    if (content) content.classList.add('hidden');

    // Wire up the "Sign In" button inside the prompt (idempotent)
    const btn = document.getElementById('myreportsSigninBtn');
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener('click', () => {
        App.openModal('studentAuthModal');
      });
    }

    if (window.App) App.refreshIcons();
  },

  _showContent() {
    const prompt  = document.getElementById('myreportsSigninPrompt');
    const content = document.getElementById('myreportsContent');
    if (prompt)  prompt.classList.add('hidden');
    if (content) content.classList.remove('hidden');
  },

  async _fetchAndRender() {
    const container = document.getElementById('myReportsGridContainer');
    if (!container) return;

    // Loading state
    container.innerHTML = `
      <div class="col-span-full py-16 text-center text-slate-400">
        <svg class="animate-spin h-8 w-8 text-indigo-600 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <p class="text-sm font-medium">Loading your reports…</p>
      </div>
    `;

    try {
      const { issues } = await API.getMyIssues();

      if (issues.length === 0) {
        container.innerHTML = `
          <div class="col-span-full py-16 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <div class="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <i data-lucide="inbox" class="w-7 h-7"></i>
            </div>
            <h3 class="text-base font-semibold text-slate-800">No reports yet</h3>
            <p class="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              You haven't submitted any maintenance reports. Use the <strong>Report an Issue</strong> tab to get started.
            </p>
            <button data-tab-target="report"
              class="mt-5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl transition">
              Report an Issue
            </button>
          </div>
        `;
        App.refreshIcons();
        // Re-wire the "Report an Issue" button inside the empty state
        container.querySelector('[data-tab-target="report"]')?.addEventListener('click', () => {
          App.switchTab('report');
        });
        return;
      }

      container.innerHTML = '';
      issues.forEach(issue => {
        // Reuse Dashboard.createIssueCard so cards look identical to the campus feed
        const card = Dashboard.createIssueCard(issue);

        // Add Delete button only to report cards inside the student's My Reports tab
        const actionRow = document.createElement('div');
        actionRow.className = 'pt-3 mt-2 border-t border-slate-100 flex items-center justify-end';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-report-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition focus:outline-none focus:ring-2 focus:ring-rose-400';
        deleteBtn.setAttribute('title', 'Delete this report');
        deleteBtn.innerHTML = `
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          <span>Delete</span>
        `;

        deleteBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();

          // Ask for confirmation
          const confirmed = window.confirm("Delete this report? This cannot be undone.");
          if (!confirmed) {
            return;
          }

          // Disable the button while deleting
          deleteBtn.disabled = true;
          deleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
          const originalHtml = deleteBtn.innerHTML;
          deleteBtn.innerHTML = `
            <span class="animate-spin inline-block mr-1">⏳</span>
            <span>Deleting...</span>
          `;

          try {
            await API.deleteIssue(issue.id);

            // Confirmed success: remove the card and refresh existing feed/counts as needed
            App.showToast('Report deleted successfully.', 'success');
            card.remove();

            // If no more cards in container, render empty state
            if (!container.querySelector('.issue-card')) {
              MyReports._fetchAndRender();
            }

            if (window.Dashboard) {
              window.Dashboard.loadIssues();
              window.Dashboard.loadQuickStats();
            }
            if (window.Admin && typeof window.Admin.loadAdminData === 'function') {
              window.Admin.loadAdminData();
            }
            if (window.Analytics && typeof window.Analytics.loadAnalytics === 'function') {
              window.Analytics.loadAnalytics();
            }
          } catch (err) {
            // On failure, keep the card and show a clear error. Never show success unless deletion actually succeeded.
            deleteBtn.disabled = false;
            deleteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            deleteBtn.innerHTML = originalHtml;
            if (window.App) App.refreshIcons();

            console.error('Failed to delete report:', err);
            const errMsg = err?.message || 'Failed to delete report';
            App.showToast(errMsg, 'error');
          }
        });

        actionRow.appendChild(deleteBtn);
        card.appendChild(actionRow);
        container.appendChild(card);
      });

      App.refreshIcons();

    } catch (err) {
      if (err.message === 'not_authenticated') {
        // Session expired mid-session — show sign-in prompt
        this._showSigninPrompt();
        return;
      }

      container.innerHTML = `
        <div class="col-span-full py-12 text-center text-rose-500 bg-rose-50 rounded-2xl border border-rose-100 px-4">
          <i data-lucide="alert-triangle" class="w-8 h-8 mx-auto mb-3 text-rose-400"></i>
          <p class="font-semibold text-rose-700">Could not load your reports</p>
          <p class="text-sm text-rose-500 mt-1">${err.message}</p>
          <button onclick="MyReports._fetchAndRender()"
            class="mt-4 px-4 py-2 text-xs font-semibold bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl transition">
            Retry
          </button>
        </div>
      `;
      App.refreshIcons();
    }
  }
};

window.MyReports = MyReports;
