/**
 * FixIt Analytics & Resolution Statistics Controller
 * Visualizes resolution rate, category breakdowns, and priority distributions via Chart.js
 */
const Analytics = {
  categoryChart: null,
  priorityChart: null,
  latestStats: null,

  isDark() {
    return document.documentElement.classList.contains('dark') ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  },

  updateTheme() {
    if (this.latestStats) {
      this.renderCategoryChart(this.latestStats.category_breakdown || []);
      this.renderPriorityChart(this.latestStats.priority_breakdown || []);
    }
  },

  init() {
    this.setupResetButton();
    this.loadAnalytics();
  },

  async setupResetButton() {
    const resetBtn = document.getElementById('resetDemoDataBtn');
    if (!resetBtn) return;

    // Always hide first; only reveal after admin verification
    resetBtn.classList.add('hidden');

    const isAdmin = await API.isAdmin();
    if (!isAdmin) {
      // Not admin — leave button hidden, nothing else to do
      return;
    }

    // Verified admin: make button visible
    resetBtn.classList.remove('hidden');

    resetBtn.addEventListener('click', async () => {
      // Re-verify admin in the click handler — hiding the button alone is not security
      const stillAdmin = await API.isAdmin();
      if (!stillAdmin) {
        App.showToast('Access Denied: You must be signed in as an administrator.', 'error');
        resetBtn.classList.add('hidden');
        return;
      }

      if (confirm('Reset database to clean realistic campus demo state?\n\nNote: Only demo/seed data will be affected — real student complaints are not deleted.')) {
        try {
          resetBtn.disabled = true;
          resetBtn.textContent = 'Resetting…';
          await API.resetDemo();
          App.showToast('Demo data re-seeded successfully!', 'success');
          this.loadAnalytics();
          if (window.Dashboard) window.Dashboard.loadIssues();
          if (window.Admin) window.Admin.loadAdminData();
        } catch (err) {
          App.showToast(err.message, 'error');
        } finally {
          resetBtn.disabled = false;
          resetBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-slate-500"></i> Reset Demo Data';
          App.refreshIcons();
        }
      }
    });
  },

  async loadAnalytics() {
    try {
      const stats = await API.getStats();

      // Update KPI widgets
      const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setEl('analyticsTotalIssues', stats.total_issues);
      setEl('analyticsPending', stats.submitted_count || stats.pending_count || 0);
      setEl('analyticsSubmitted', stats.submitted_count || stats.pending_count || 0);
      setEl('analyticsInProgress', stats.in_progress_count || 0);
      setEl('analyticsResolved', stats.resolved_count || 0);
      setEl('analyticsResolutionRate', `${stats.resolution_rate}%`);
      this.latestStats = stats;

      // Resolution rate progress bar
      const bar = document.getElementById('analyticsProgressBar');
      if (bar) {
        bar.style.width = `${stats.resolution_rate}%`;
      }

      // Render Charts
      this.renderCategoryChart(stats.category_breakdown || []);
      this.renderPriorityChart(stats.priority_breakdown || []);
      this.renderLocationTable(stats.location_breakdown || []);

      App.refreshIcons();
    } catch (err) {
      console.error('Analytics load error:', err);
    }
  },

  renderCategoryChart(data) {
    const canvas = document.getElementById('categoryChartCanvas');
    if (!canvas || !window.Chart) return;

    const labels = data.map(d => d.category);
    const resolvedCounts = data.map(d => d.resolved || 0);
    const openCounts = data.map(d => (d.submitted || d.pending || 0) + (d.in_progress || 0));

    if (this.categoryChart) {
      this.categoryChart.destroy();
    }

    const isDark = this.isDark();
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';

    const ctx = canvas.getContext('2d');
    this.categoryChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Resolved',
            data: resolvedCounts,
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Submitted / In Progress',
            data: openCounts,
            backgroundColor: '#6366f1',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              color: textColor,
              font: { family: 'Inter', size: 12 }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { family: 'Inter', size: 11 }
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              stepSize: 1,
              color: textColor,
              font: { family: 'Inter', size: 11 }
            }
          }
        }
      }
    });
  },

  renderPriorityChart(data) {
    const canvas = document.getElementById('priorityChartCanvas');
    if (!canvas || !window.Chart) return;

    const labels = data.map(d => d.priority);
    const counts = data.map(d => d.count);
    const colors = data.map(d => d.color);

    if (this.priorityChart) {
      this.priorityChart.destroy();
    }

    const isDark = this.isDark();
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const borderColor = isDark ? '#1e293b' : '#ffffff';

    const ctx = canvas.getContext('2d');
    this.priorityChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: counts,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: borderColor
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 16,
              color: textColor,
              font: { family: 'Inter', size: 12 }
            }
          }
        }
      }
    });
  },

  renderLocationTable(locations) {
    const list = document.getElementById('analyticsLocationsList');
    if (!list) return;

    if (locations.length === 0) {
      list.innerHTML = '<p class="text-xs text-slate-400">No location data available.</p>';
      return;
    }

    list.innerHTML = '';
    locations.forEach(loc => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between py-2 border-b border-slate-100 text-xs';
      row.innerHTML = `
        <span class="font-medium text-slate-700 flex items-center gap-1.5 truncate">
          <i data-lucide="building" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
          <span class="truncate">${loc.location}</span>
        </span>
        <span class="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
          ${loc.count} issue${loc.count === 1 ? '' : 's'}
        </span>
      `;
      list.appendChild(row);
    });

    App.refreshIcons();
  }
};

window.Analytics = Analytics;
