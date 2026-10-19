/**
 * FixIt Report Form Controller
 * Real-time smart analysis, duplicate detection, image uploads, and privacy preservation
 */
const ReportForm = {
  debounceTimer: null,
  selectedPhotoFile: null,
  uploadedPhotoUrl: '',
  selectedVideoFile: null,
  uploadedVideoUrl: '',
  smartAnalysisResult: null,

  init() {
    this.setupEventListeners();
    this.setupPhotoUpload();
  },

  setupEventListeners() {
    const descInput = document.getElementById('reportDescription');
    const locInput = document.getElementById('reportLocation');
    const form = document.getElementById('issueReportForm');

    // Debounced real-time analysis
    const triggerAnalysis = () => {
      clearTimeout(this.debounceTimer);
      const desc = descInput ? descInput.value.trim() : '';
      const loc = locInput ? locInput.value.trim() : '';

      if (desc.length >= 6) {
        this.debounceTimer = setTimeout(() => {
          this.runSmartAnalysis(desc, loc);
        }, 450);
      } else {
        this.hideSmartCards();
      }
    };

    if (descInput) descInput.addEventListener('input', triggerAnalysis);
    if (locInput) locInput.addEventListener('input', triggerAnalysis);

    // Form submit
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitForm();
      });
    }

    // Reset button
    const resetBtn = document.getElementById('resetReportBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetForm();
      });
    }
  },

  setupPhotoUpload() {
    // Photo elements (Required)
    const photoFileInput = document.getElementById('photoFileInput');
    const photoUploadTrigger = document.getElementById('photoUploadTrigger');
    const photoDropzone = document.getElementById('photoDropzone');
    const photoPreviewContainer = document.getElementById('photoPreviewContainer');
    const photoPreviewImg = document.getElementById('photoPreviewImg');
    const photoFileName = document.getElementById('photoFileName');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    const photoValidationError = document.getElementById('photoValidationError');

    // Video elements (Optional)
    const videoFileInput = document.getElementById('videoFileInput');
    const videoUploadTrigger = document.getElementById('videoUploadTrigger');
    const browseVideoBtn = document.getElementById('browseVideoBtn');
    const videoDropzone = document.getElementById('videoDropzone');
    const videoPreviewContainer = document.getElementById('videoPreviewContainer');
    const videoPreviewPlayer = document.getElementById('videoPreviewPlayer');
    const videoFileName = document.getElementById('videoFileName');
    const removeVideoBtn = document.getElementById('removeVideoBtn');

    // Photo triggers
    if (photoUploadTrigger && photoFileInput) {
      photoUploadTrigger.addEventListener('click', () => photoFileInput.click());
    }
    if (photoDropzone && photoFileInput) {
      photoDropzone.addEventListener('click', (e) => {
        if (e.target !== photoUploadTrigger) photoFileInput.click();
      });
      photoDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        photoDropzone.classList.add('border-indigo-500', 'bg-indigo-50/50');
      });
      photoDropzone.addEventListener('dragleave', () => {
        photoDropzone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
      });
      photoDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        photoDropzone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handlePhotoSelected(e.dataTransfer.files[0]);
        }
      });
    }

    if (photoFileInput) {
      photoFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handlePhotoSelected(e.target.files[0]);
        }
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', () => {
        this.selectedPhotoFile = null;
        this.uploadedPhotoUrl = '';
        if (photoFileInput) photoFileInput.value = '';
        if (photoPreviewContainer) photoPreviewContainer.classList.add('hidden');
        if (photoDropzone) {
          photoDropzone.classList.remove('hidden', 'border-rose-500', 'bg-rose-50/40');
        }
        if (photoValidationError) photoValidationError.classList.add('hidden');
      });
    }

    // Video triggers (Optional)
    const openVideoPicker = () => {
      if (videoFileInput) videoFileInput.click();
    };
    if (videoUploadTrigger) videoUploadTrigger.addEventListener('click', openVideoPicker);
    if (browseVideoBtn) browseVideoBtn.addEventListener('click', openVideoPicker);

    if (videoFileInput) {
      videoFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleVideoSelected(e.target.files[0]);
        }
      });
    }

    if (removeVideoBtn) {
      removeVideoBtn.addEventListener('click', () => {
        this.selectedVideoFile = null;
        this.uploadedVideoUrl = '';
        if (videoFileInput) videoFileInput.value = '';
        if (videoPreviewContainer) videoPreviewContainer.classList.add('hidden');
        if (videoDropzone) videoDropzone.classList.remove('hidden');
      });
    }
  },

  handlePhotoSelected(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      App.showToast('Invalid format: Please upload an image file (.jpg, .png, .webp). Photos are required.', 'error');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      App.showToast('Photo is too large: Maximum allowed size is 8 MB.', 'error');
      return;
    }

    this.selectedPhotoFile = file;
    this.uploadedPhotoUrl = ''; // Will upload on submit

    const photoDropzone = document.getElementById('photoDropzone');
    const photoPreviewContainer = document.getElementById('photoPreviewContainer');
    const photoPreviewImg = document.getElementById('photoPreviewImg');
    const photoFileName = document.getElementById('photoFileName');
    const photoValidationError = document.getElementById('photoValidationError');

    if (photoPreviewImg) {
      photoPreviewImg.src = URL.createObjectURL(file);
    }
    if (photoFileName) {
      photoFileName.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    }
    if (photoPreviewContainer) photoPreviewContainer.classList.remove('hidden');
    if (photoDropzone) {
      photoDropzone.classList.add('hidden');
      photoDropzone.classList.remove('border-rose-500', 'bg-rose-50/40');
    }
    if (photoValidationError) photoValidationError.classList.add('hidden');

    App.showToast('Photo selected! It will be verified and uploaded when you submit.', 'info');
  },

  handleVideoSelected(file) {
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      App.showToast('Invalid format: Please choose a valid video file (.mp4, .webm).', 'error');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      App.showToast('Video too large: Maximum size is 25 MB.', 'error');
      return;
    }

    this.selectedVideoFile = file;
    this.uploadedVideoUrl = '';

    const videoDropzone = document.getElementById('videoDropzone');
    const videoPreviewContainer = document.getElementById('videoPreviewContainer');
    const videoPreviewPlayer = document.getElementById('videoPreviewPlayer');
    const videoFileName = document.getElementById('videoFileName');

    if (videoPreviewPlayer) {
      videoPreviewPlayer.src = URL.createObjectURL(file);
    }
    if (videoFileName) {
      videoFileName.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    }
    if (videoPreviewContainer) videoPreviewContainer.classList.remove('hidden');
    if (videoDropzone) videoDropzone.classList.add('hidden');

    App.showToast('Optional video attached.', 'info');
  },

  async runSmartAnalysis(description, location) {
    try {
      const result = await API.analyzeSmart(description, location);
      this.smartAnalysisResult = result;
      this.renderSmartInsights(result);
    } catch (err) {
      console.warn('Smart analysis preview failed:', err);
    }
  },

  renderSmartInsights(data) {
    const smartBox = document.getElementById('smartInsightsBox');
    if (!smartBox) return;

    smartBox.classList.remove('hidden');

    // Category Suggestion
    const categoryBadge = document.getElementById('suggestedCategoryBadge');
    const categoryConfidence = document.getElementById('suggestedCategoryConfidence');
    const applyCategoryBtn = document.getElementById('applySuggestedCategoryBtn');

    if (categoryBadge) {
      categoryBadge.textContent = data.category;
    }
    if (applyCategoryBtn) {
      applyCategoryBtn.onclick = () => {
        const catSelect = document.getElementById('reportCategory');
        if (catSelect) {
          catSelect.value = data.category;
          App.showToast(`Applied category: ${data.category}`, 'info');
        }
      };
    }

    // Auto-select category if user hasn't chosen one
    const catSelect = document.getElementById('reportCategory');
    if (catSelect && (!catSelect.value || catSelect.value === '')) {
      catSelect.value = data.category;
    }

    // Priority label (word-only, no percentage/score)
    const priorityBadge = document.getElementById('suggestedPriorityBadge');
    const priorityRationale = document.getElementById('priorityRationaleText');
    const safetyAlertBanner = document.getElementById('safetyAlertBanner');

    if (priorityBadge) {
      priorityBadge.innerHTML = App.getPriorityBadge(data.priority, false);
    }
    if (priorityRationale) {
      priorityRationale.textContent = data.priority_rationale || data.rationale || 'Classified by safety and service impact rules.';
    }

    // Auto-set the priority dropdown to the classified level
    const prioritySelect = document.getElementById('reportPriority');
    if (prioritySelect && data.priority) {
      prioritySelect.value = data.priority;
    }

    // Safety Hazard Banner
    if (safetyAlertBanner) {
      if (data.is_safety_hazard) {
        safetyAlertBanner.classList.remove('hidden');
      } else {
        safetyAlertBanner.classList.add('hidden');
      }
    }

    // Duplicate detection alert
    this.renderDuplicateAlert(data.potential_duplicates);
  },

  renderDuplicateAlert(duplicates) {
    const alertBox = document.getElementById('duplicateAlertBox');
    const duplicatesList = document.getElementById('potentialDuplicatesList');
    if (!alertBox || !duplicatesList) return;

    if (!duplicates || duplicates.length === 0) {
      alertBox.classList.add('hidden');
      return;
    }

    alertBox.classList.remove('hidden');
    duplicatesList.innerHTML = '';

    duplicates.slice(0, 3).forEach(dup => {
      const card = document.createElement('div');
      card.className = 'bg-white p-3.5 rounded-xl border border-amber-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs';
      card.innerHTML = `
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-bold text-slate-800">${dup.issue_code}</span>
            <span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-medium">${dup.match_score}% match</span>
            <span class="text-slate-500">📍 ${dup.location}</span>
          </div>
          <p class="text-slate-700 line-clamp-1 font-medium">${dup.title || dup.description}</p>
          <p class="text-slate-500 mt-0.5">👥 <strong>${dup.people_affected} people</strong> affected / reported this problem</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg transition" onclick="App.Dashboard?.openIssueModal('${dup.issue_code}')">
            View Issue
          </button>
          <button type="button" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition" onclick="ReportForm.linkToExisting(${dup.id})">
            Link My Report (+1)
          </button>
        </div>
      `;
      duplicatesList.appendChild(card);
    });

    App.refreshIcons();
  },

  async linkToExisting(parentId) {
    try {
      const res = await API.linkReport(parentId, 'Student verified and linked issue');
      App.showToast(`Linked! Total people affected updated to ${res.people_affected}.`, 'success');
      this.resetForm();
      App.switchTab('dashboard');
    } catch (err) {
      App.showToast(err.message || 'Failed to link report', 'error');
    }
  },

  dismissDuplicateAlert() {
    const alertBox = document.getElementById('duplicateAlertBox');
    if (alertBox) alertBox.classList.add('hidden');
    App.showToast('Proceeding with separate complaint report.', 'info');
  },

  hideSmartCards() {
    const smartBox = document.getElementById('smartInsightsBox');
    const duplicateBox = document.getElementById('duplicateAlertBox');
    if (smartBox) smartBox.classList.add('hidden');
    if (duplicateBox) duplicateBox.classList.add('hidden');
  },

  async submitForm() {
    const descInput = document.getElementById('reportDescription');
    const locInput = document.getElementById('reportLocation');
    const areaInput = document.getElementById('reportSpecificArea');
    const catSelect = document.getElementById('reportCategory');
    const prioritySelect = document.getElementById('reportPriority');
    const privacyCheck = document.getElementById('reportPrivacyMode');
    const contactInput = document.getElementById('reportContact');
    const submitBtn = document.getElementById('submitReportBtn');
    const photoValidationError = document.getElementById('photoValidationError');
    const photoDropzone = document.getElementById('photoDropzone');

    const description = descInput ? descInput.value.trim() : '';
    const location = locInput ? locInput.value.trim() : '';
    const specificArea = areaInput ? areaInput.value.trim() : '';
    const category = catSelect ? catSelect.value : '';
    const priority = prioritySelect ? prioritySelect.value : '';
    const isAnonymous = privacyCheck ? privacyCheck.checked : true;
    const contact = contactInput ? contactInput.value.trim() : '';

    // 0. Verify not admin (Admins must not submit complaint reports)
    const isAdmin = await API.isAdmin();
    if (isAdmin) {
      App.showToast('Admins cannot submit complaint reports.', 'error');
      return;
    }

    // 1. Verify student authentication
    const user = await API.getCurrentUser();
    if (!user) {
      App.pendingRedirectTab = 'report';
      App.showToast('Please sign in as a student to submit a maintenance complaint.', 'error');
      App.openModal('studentAuthModal');
      return;
    }

    // 2. Validate form fields
    if (description.length < 5) {
      App.showToast('Please provide a clearer problem description (at least 5 characters).', 'error');
      if (descInput) descInput.focus();
      return;
    }

    if (location.length < 2) {
      App.showToast('Please specify the campus building or area.', 'error');
      if (locInput) locInput.focus();
      return;
    }

    if (!category || category === '') {
      App.showToast('Please select or accept a category for your report.', 'error');
      if (catSelect) catSelect.focus();
      return;
    }

    // 3. MANDATORY PHOTO VALIDATION: Validate before uploading or inserting
    if (!this.selectedPhotoFile && !this.uploadedPhotoUrl) {
      App.showToast('Photo required: At least one photo proof is required to submit a complaint.', 'error');
      if (photoValidationError) photoValidationError.classList.remove('hidden');
      if (photoDropzone) {
        photoDropzone.classList.remove('hidden');
        photoDropzone.classList.add('border-rose-500', 'bg-rose-50/40');
        photoDropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // 4. Begin submission process (Disable button & show progress)
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        Uploading photo proof...
      `;
    }

    // 5. UPLOAD PHOTO TO STORAGE FIRST: Only insert if upload succeeds
    let photoUrl = this.uploadedPhotoUrl;
    if (!photoUrl && this.selectedPhotoFile) {
      try {
        App.showToast('Uploading photo to Supabase Storage...', 'info');
        const uploadRes = await API.uploadPhoto(this.selectedPhotoFile);
        if (!uploadRes || !uploadRes.url) {
          throw new Error('Storage returned an invalid URL for the uploaded photo.');
        }
        photoUrl = uploadRes.url;
        this.uploadedPhotoUrl = photoUrl;
      } catch (uploadErr) {
        console.error('Photo upload failed:', uploadErr);
        App.showToast(`Photo upload failed: ${uploadErr.message || 'Storage error'}. Report was NOT created.`, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4 mr-2"></i> Submit Report`;
          App.refreshIcons();
        }
        // Abort submission immediately — DO NOT INSERT REPORT
        return;
      }
    }

    if (!photoUrl) {
      App.showToast('Photo required: Could not obtain verified photo URL. Report was NOT created.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4 mr-2"></i> Submit Report`;
        App.refreshIcons();
      }
      return;
    }

    // 6. Optional Video Upload
    let videoUrl = this.uploadedVideoUrl;
    if (!videoUrl && this.selectedVideoFile) {
      try {
        if (submitBtn) {
          submitBtn.innerHTML = `
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Uploading optional video...
          `;
        }
        const vidRes = await API.uploadVideo(this.selectedVideoFile);
        videoUrl = vidRes?.url || null;
        this.uploadedVideoUrl = videoUrl;
      } catch (vErr) {
        console.warn('Optional video upload failed:', vErr);
        App.showToast(`Optional video upload warning: ${vErr.message}. Proceeding with photo proof.`, 'warning');
      }
    }

    // 7. INSERT REPORT INTO DATABASE WITH photo_url
    if (submitBtn) {
      submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        Saving complaint to reports...
      `;
    }

    // Determine final priority: use the dropdown selection (which is auto-set by SmartEngine),
    // or fall back to re-classifying from category + description + location.
    let finalPriority = priority; // word label from <select>
    if (!finalPriority) {
      const classified = window.SmartEngine
        ? window.SmartEngine.classifyPriority(category, description, location)
        : { priority: 'Medium', level: 2 };
      finalPriority = classified.priority;
    }

    const payload = {
      description,
      location,
      specific_area: specificArea,
      category,
      priority: finalPriority,
      privacy_mode: isAnonymous ? 'Private' : 'Public',
      is_anonymous: isAnonymous,
      reporter_contact: contact,
      photo_url: photoUrl,
      video_url: videoUrl
    };

    try {
      const created = await API.createIssue(payload);
      App.showToast('Complaint submitted successfully with photo proof!', 'success');
      this.showSuccessConfirmation(created);
      this.resetForm();
    } catch (err) {
      App.showToast(err.message || 'Failed to submit complaint. Please try again.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <i data-lucide="send" class="w-4 h-4 mr-2"></i>
          Submit Report
        `;
        App.refreshIcons();
      }
    }
  },

  showSuccessConfirmation(issue) {
    const modal = document.getElementById('submissionSuccessModal');
    const codeEl = document.getElementById('successIssueCode');
    const catEl = document.getElementById('successCategory');
    const prioEl = document.getElementById('successPriority');
    const locEl = document.getElementById('successLocation');
    const viewBtn = document.getElementById('successViewBtn');

    if (codeEl) codeEl.textContent = issue.issue_code;
    if (catEl) catEl.textContent = issue.category;
    if (prioEl) prioEl.innerHTML = App.getPriorityBadge(issue.priority, false);
    if (locEl) locEl.textContent = `${issue.location} ${issue.specific_area ? '· ' + issue.specific_area : ''}`;

    if (viewBtn) {
      viewBtn.onclick = () => {
        App.closeModals();
        App.switchTab('dashboard');
        setTimeout(() => {
          if (window.Dashboard) window.Dashboard.openIssueModal(issue.issue_code);
        }, 200);
      };
    }

    App.openModal('submissionSuccessModal');
  },

  resetForm() {
    const form = document.getElementById('issueReportForm');
    if (form) form.reset();

    const photoPreviewContainer = document.getElementById('photoPreviewContainer');
    const photoDropzone = document.getElementById('photoDropzone');
    const photoFileInput = document.getElementById('photoFileInput');
    const photoValidationError = document.getElementById('photoValidationError');

    const videoPreviewContainer = document.getElementById('videoPreviewContainer');
    const videoDropzone = document.getElementById('videoDropzone');
    const videoFileInput = document.getElementById('videoFileInput');

    this.selectedPhotoFile = null;
    this.uploadedPhotoUrl = '';
    this.selectedVideoFile = null;
    this.uploadedVideoUrl = '';
    this.smartAnalysisResult = null;

    if (photoFileInput) photoFileInput.value = '';
    if (photoPreviewContainer) photoPreviewContainer.classList.add('hidden');
    if (photoDropzone) {
      photoDropzone.classList.remove('hidden', 'border-rose-500', 'bg-rose-50/40');
    }
    if (photoValidationError) photoValidationError.classList.add('hidden');

    if (videoFileInput) videoFileInput.value = '';
    if (videoPreviewContainer) videoPreviewContainer.classList.add('hidden');
    if (videoDropzone) videoDropzone.classList.remove('hidden');

    this.hideSmartCards();
  }
};

window.ReportForm = ReportForm;
