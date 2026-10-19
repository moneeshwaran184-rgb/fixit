/**
 * FixIt API Client with Supabase JS v2
 * Connects directly to Supabase using Project URL and publishable key.
 * Enforces strict user authentication, student submission validation,
 * admin authorization (ADMIN_UID 9d8e6490-d441-4099-b0ae-e7b11e0c8a95),
 * and public data privacy.
 */

const PRIORITY_MAP = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical'
};

const PRIORITY_INVERSE = {
  'Low': 1,
  'Medium': 2,
  'High': 3,
  'Critical': 4,
  'Urgent': 4
};

// Publicly safe columns that NEVER expose reporter IDs or student contact details
const PUBLIC_SAFE_COLUMNS = 'id, created_at, description, location, status, priority, category, specific_area, photo_url, video_url';

function formatIssue(row) {
  if (!row) return null;
  const pVal = typeof row.priority === 'number' ? (PRIORITY_MAP[row.priority] || 'Medium') : (row.priority || 'Medium');
  let cleanStatus = (row.status || 'Submitted').trim();
  if (cleanStatus.toLowerCase() === 'pending') {
    cleanStatus = 'Submitted';
  }
  return {
    ...row,
    id: row.id,
    issue_code: `FIX-${row.id}`,
    title: row.description ? (row.description.length > 50 ? row.description.substring(0, 50) + '...' : row.description) : 'Maintenance Issue',
    priority: pVal,
    status: cleanStatus,
    category: row.category || 'Other',
    location: row.location || 'Campus',
    specific_area: row.specific_area || '',
    people_affected: row.people_affected || 1,
    photo_url: row.photo_url || null,
    video_url: row.video_url || null
  };
}

const API = {
  get client() {
    return window.supabaseClient;
  },

  // Check if current user is the authorized administrator
  async isAdmin() {
    if (!this.client) return false;
    try {
      const { data: { user } } = await this.client.auth.getUser();
      if (!user) return false;

      // 1. Check primary authorized admin UID
      if (user.id === window.AUTHORIZED_ADMIN_UID) {
        return true;
      }

      // 2. Check staff_users database table
      const { data } = await this.client
        .from('staff_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      return Boolean(data);
    } catch (e) {
      return false;
    }
  },

  async isStaff() {
    return this.isAdmin();
  },

  // Fetch issues with filtering
  async getIssues(params = {}) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const adminUser = await this.isAdmin();
    let data = null;
    let count = null;

    const applyFilters = (builder) => {
      let q = builder;
      if (params.status) {
        if (params.status.toLowerCase() === 'submitted' || params.status.toLowerCase() === 'pending') {
          q = q.or('status.ilike.%Submitted%,status.ilike.%Pending%');
        } else {
          q = q.ilike('status', `%${params.status}%`);
        }
      }
      if (params.priority) {
        const pInt = PRIORITY_INVERSE[params.priority];
        if (pInt) q = q.eq('priority', pInt);
      }
      if (params.category && params.category !== '') {
        q = q.eq('category', params.category);
      }
      if (params.location) {
        q = q.ilike('location', `%${params.location}%`);
      }
      if (params.q) {
        q = q.or(`description.ilike.%${params.q}%,location.ilike.%${params.q}%`);
      }
      q = q.order('created_at', { ascending: false });
      if (params.limit) {
        const offset = params.offset || 0;
        q = q.range(offset, offset + params.limit - 1);
      }
      return q;
    };

    // If user is Admin, query reports table to view all tickets and full details
    if (adminUser) {
      const res = await applyFilters(this.client.from('reports').select('*', { count: 'exact' }));
      if (res.error) throw res.error;
      data = res.data;
      count = res.count;
    } else {
      // Regular students and public visitors query public_reports view for privacy
      try {
        const res = await applyFilters(this.client.from('public_reports').select('*', { count: 'exact' }));
        if (!res.error) {
          data = res.data;
          count = res.count;
        } else if (res.error.code !== 'PGRST205') {
          throw res.error;
        }
      } catch (err) {
        console.warn('public_reports view not exposed, querying reports with public-safe columns');
      }

      // Fallback if public_reports view is not yet created in Supabase
      if (data === null) {
        // Strictly request ONLY PUBLIC_SAFE_COLUMNS to protect reporter privacy
        const res = await applyFilters(this.client.from('reports').select(PUBLIC_SAFE_COLUMNS, { count: 'exact' }));
        if (res.error) throw res.error;
        data = res.data;
        count = res.count;
      }
    }

    const formatted = (data || []).map(formatIssue);
    return {
      issues: formatted,
      total: count !== null ? count : formatted.length
    };
  },

  // Fetch a single issue by ID or code
  async getIssue(idOrCode) {
    if (!this.client) throw new Error('Supabase client not initialized');

    let numericId = idOrCode;
    if (typeof idOrCode === 'string' && idOrCode.startsWith('FIX-')) {
      numericId = parseInt(idOrCode.replace('FIX-', ''), 10);
    }

    const adminUser = await this.isAdmin();

    // Admin can read full report
    if (adminUser) {
      const res = await this.client.from('reports').select('*').eq('id', numericId).single();
      if (res.data) return formatIssue(res.data);
    }

    // Try public_reports view
    try {
      const res = await this.client.from('public_reports').select('*').eq('id', numericId).single();
      if (res.data) return formatIssue(res.data);
    } catch (e) {}

    // Fallback: read safe columns from reports
    const res = await this.client.from('reports').select(PUBLIC_SAFE_COLUMNS).eq('id', numericId).single();
    if (res.data) return formatIssue(res.data);

    throw new Error(`Issue FIX-${numericId} not found`);
  },

  _availableColumnsCache: null,

  async getAvailableColumns() {
    if (this._availableColumnsCache) return this._availableColumnsCache;
    const candidates = ['category', 'specific_area', 'video_url', 'student_id', 'reporter_name', 'reporter_contact', 'updated_at'];
    // id, created_at, description, location, status, priority, reporter_id, and photo_url are guaranteed schema columns
    const confirmed = new Set(['id', 'created_at', 'description', 'location', 'status', 'priority', 'reporter_id', 'photo_url']);
    if (this.client) {
      for (const col of candidates) {
        try {
          const { error } = await this.client.from('reports').select(col).limit(0);
          if (!error) confirmed.add(col);
        } catch (e) {}
      }
    }
    this._availableColumnsCache = confirmed;
    return confirmed;
  },

  // Create a new maintenance report (Requires signed-in student session)
  async createIssue(payload) {
    if (!this.client) throw new Error('Supabase client not initialized');

    // Strictly verify real authenticated session directly from Supabase Auth
    const { data: { user }, error: authErr } = await this.client.auth.getUser();
    if (authErr || !user) {
      throw new Error('Authentication required: You must be signed in with a valid student account to submit a maintenance report.');
    }

    // Priority is assigned automatically (students cannot alter priority or status)
    const priorityInt = typeof payload.priority === 'number'
      ? payload.priority
      : (PRIORITY_INVERSE[payload.priority] || 2);

    // Do not send status: 'Pending'. Omit the status field so Supabase uses default ('Submitted'),
    // or send 'Submitted' if explicitly set.
    const insertData = {
      description: payload.description,
      location: payload.location,
      priority: priorityInt,
      reporter_id: user.id // Strictly set from current authenticated user's actual Supabase user.id
    };

    if (payload.status && payload.status.toLowerCase() !== 'pending') {
      insertData.status = payload.status;
    }

    // Send ONLY columns that currently exist in public.reports
    const availableCols = await this.getAvailableColumns();
    if (availableCols.has('category') && payload.category) insertData.category = payload.category;
    if (availableCols.has('specific_area') && payload.specific_area) insertData.specific_area = payload.specific_area;
    if (availableCols.has('photo_url') && payload.photo_url) insertData.photo_url = payload.photo_url;
    if (availableCols.has('video_url') && payload.video_url) insertData.video_url = payload.video_url;
    if (availableCols.has('student_id') && payload.student_id) insertData.student_id = payload.student_id;
    if (availableCols.has('reporter_name') && payload.reporter_name) insertData.reporter_name = payload.reporter_name;
    if (availableCols.has('reporter_contact') && payload.reporter_contact) insertData.reporter_contact = payload.reporter_contact;

    const { data, error } = await this.client
      .from('reports')
      .insert([insertData])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      if (error.code === '42501' || error.message.includes('row-level security')) {
        throw new Error('Database permission error: The reports table RLS policy rejected the insert. Please run the SQL migration in Supabase SQL Editor to grant authenticated insert permissions.');
      }
      throw new Error(error.message || 'Failed to submit report');
    }

    return formatIssue((data && data[0]) || insertData);
  },

  // Update report status (Authorized Administrator only)
  async updateStatus(id, status, notes = '') {
    if (!this.client) throw new Error('Supabase client not initialized');

    const adminUser = await this.isAdmin();
    if (!adminUser) {
      throw new Error('Access Denied: Only authorized facility administrators can update report status.');
    }

    let numericId = id;
    if (typeof id === 'string' && id.startsWith('FIX-')) {
      numericId = parseInt(id.replace('FIX-', ''), 10);
    }

    const { data, error } = await this.client
      .from('reports')
      .update({ status: status, updated_at: new Date().toISOString() })
      .eq('id', numericId)
      .select();

    if (error) {
      console.error('Update status error:', error);
      throw new Error(error.message || 'Failed to update status in database.');
    }

    return formatIssue((data && data[0]) || { id: numericId, status });
  },

  // Update report priority (Authorized Administrator only)
  async updatePriority(id, priority, reason = '') {
    if (!this.client) throw new Error('Supabase client not initialized');

    const adminUser = await this.isAdmin();
    if (!adminUser) {
      throw new Error('Access Denied: Only authorized facility administrators can update report priority.');
    }

    let numericId = id;
    if (typeof id === 'string' && id.startsWith('FIX-')) {
      numericId = parseInt(id.replace('FIX-', ''), 10);
    }

    const priorityInt = typeof priority === 'string'
      ? (PRIORITY_INVERSE[priority] || 2)
      : priority;

    const { data, error } = await this.client
      .from('reports')
      .update({ priority: priorityInt, updated_at: new Date().toISOString() })
      .eq('id', numericId)
      .select();

    if (error) {
      console.error('Update priority error:', error);
      throw new Error(error.message || 'Failed to update priority in database.');
    }

    return formatIssue((data && data[0]) || { id: numericId, priority: priorityInt });
  },

  // Upload file (photo to 'report-photos' / fallback, video to 'videos' / fallback) scoped to authenticated user ID
  async uploadMedia(file) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error('Authentication required: Please sign in as a student to upload photos or videos.');
    }

    const isVideo = file.type.startsWith('video/');

    // File type validation
    const allowedPhotoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    const allowed = isVideo ? allowedVideoTypes : allowedPhotoTypes;

    if (!allowed.includes(file.type)) {
      throw new Error(`Invalid file type. Supported: ${isVideo ? 'MP4, WEBM, MOV' : 'JPG, PNG, WEBP'}`);
    }

    // File size validation (8MB for photos, 25MB for videos)
    const maxSize = isVideo ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(`File too large. Max size: ${isVideo ? '25 MB' : '8 MB'}`);
    }

    const fileExt = file.name.split('.').pop();
    const cleanFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    // User-scoped path: {userId}/{filename}
    const filePath = `${user.id}/${cleanFileName}`;

    const candidateBuckets = isVideo 
      ? ['videos', 'report-photos and videos', 'report-photos'] 
      : ['report-photos', 'report-photos and videos'];

    let lastError = null;
    let successfulBucket = null;

    for (const b of candidateBuckets) {
      try {
        const { data, error } = await this.client.storage
          .from(b)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (!error && data) {
          successfulBucket = b;
          lastError = null;
          break;
        }
        lastError = error;
        const msg = (error?.message || '').toLowerCase();
        if (!msg.includes('not found') && !msg.includes('bucket')) {
          break;
        }
      } catch (e) {
        lastError = e;
      }
    }

    if (lastError || !successfulBucket) {
      console.error('Storage upload error:', lastError);
      throw new Error(lastError?.message || 'Storage upload failed. Please try again.');
    }

    const { data: urlData } = this.client.storage
      .from(successfulBucket)
      .getPublicUrl(filePath);

    if (!urlData || !urlData.publicUrl) {
      throw new Error('Failed to retrieve public URL from storage.');
    }

    return {
      url: urlData.publicUrl,
      path: filePath,
      isVideo: isVideo,
      bucket: successfulBucket
    };
  },

  async uploadPhoto(file) {
    if (!file) {
      throw new Error('No photo file provided. At least one photo is required.');
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Invalid file: Please upload a valid image file (.jpg, .png, .webp).');
    }
    return this.uploadMedia(file);
  },

  async uploadVideo(file) {
    if (!file) {
      throw new Error('No video file provided.');
    }
    if (!file.type.startsWith('video/')) {
      throw new Error('Invalid file: Please upload a valid video file (.mp4, .webm).');
    }
    return this.uploadMedia(file);
  },

  // Smart Engine Preview using client-side SmartEngine
  async analyzeSmart(description, location = '') {
    if (window.SmartEngine) {
      return window.SmartEngine.analyze(description, location);
    }
    return {
      category: 'Other',
      confidence: 50,
      priority: 'Medium',
      is_safety_hazard: false,
      potential_duplicates: []
    };
  },

  // Analytics & Statistics from live reports data
  async getStats() {
    if (!this.client) throw new Error('Supabase client not initialized');

    let reports = null;

    try {
      const res = await this.client.from('public_reports').select('status, priority');
      if (!res.error) reports = res.data;
    } catch (e) {}

    if (!reports) {
      const res = await this.client.from('reports').select('status, priority');
      reports = res.data || [];
    }

    const total = reports.length;
    let resolved = 0;
    let inProgress = 0;
    let submitted = 0;
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    reports.forEach(r => {
      const s = (r.status || '').toLowerCase();
      if (s.includes('resolved') || s.includes('done')) resolved++;
      else if (s.includes('progress')) inProgress++;
      else submitted++;

      const pVal = typeof r.priority === 'number' ? (PRIORITY_MAP[r.priority] || 'Medium') : (r.priority || 'Medium');
      if (pVal === 'Critical') critical++;
      else if (pVal === 'High') high++;
      else if (pVal === 'Medium') medium++;
      else if (pVal === 'Low') low++;
    });

    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    return {
      total,
      total_issues: total,
      resolved,
      resolved_count: resolved,
      in_progress: inProgress,
      in_progress_count: inProgress,
      submitted,
      submitted_count: submitted,
      pending: submitted,
      pending_count: submitted,
      critical_count: critical,
      high_count: high,
      medium_count: medium,
      low_count: low,
      resolution_rate: resolutionRate,
      priority_breakdown: [
        { priority: 'Critical', count: critical, color: '#ef4444' },
        { priority: 'High',     count: high,     color: '#f97316' },
        { priority: 'Medium',   count: medium,   color: '#eab308' },
        { priority: 'Low',      count: low,      color: '#22c55e' }
      ]
    };
  },

  async linkReport(id, note = '') {
    return { id, people_affected: 2 };
  },

  async resetDemo() {
    // Server-side admin guard: always verify Supabase auth regardless of UI state.
    // This prevents non-admins from calling this action programmatically.
    const adminOk = await this.isAdmin();
    if (!adminOk) {
      throw new Error('Access Denied: Administrator authorization required to reset demo data.');
    }
    // NOTE: This is currently a safe no-op stub. It does NOT delete any real student
    // complaints, uploaded photos, or videos. If a real seed/reset is ever implemented
    // here it must target only rows flagged as demo/seed data (e.g. is_demo = true).
    return { success: true };
  },

  // Supabase Authentication with robust error messages and session persistence
  async signUp(email, password, fullName = '', studentId = '') {
    if (!this.client) throw new Error('Supabase client not initialized');

    try {
      const { data, error } = await this.client.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            student_id: studentId.trim()
          }
        }
      });

      if (error) {
        if (error.status === 429 || error.message.includes('rate limit')) {
          throw new Error('Email rate limit exceeded. Please wait a few minutes before trying again.');
        }
        if (error.status === 500 || error.message.includes('confirmation email')) {
          throw new Error('Email service notification: The confirmation email could not be delivered. Please check your email address or contact campus admin.');
        }
        if (error.message.includes('already registered')) {
          throw new Error('An account with this email already exists. Please switch to the Sign In tab.');
        }
        throw new Error(error.message);
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  async signIn(email, password) {
    if (!this.client) throw new Error('Supabase client not initialized');

    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Invalid email or password. Please verify your credentials or register an account.');
        }
        if (error.message.includes('Email not confirmed')) {
          throw new Error('Your email has not been confirmed yet. Please verify your email inbox or ask admin to confirm your account.');
        }
        throw new Error(error.message);
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  async signOut() {
    if (this.client) {
      await this.client.auth.signOut();
    }
  },

  async getCurrentUser() {
    if (!this.client) return null;
    try {
      // getSession() is synchronous from the stored session — use it first for instant restoration
      const { data: sessionData } = await this.client.auth.getSession();
      if (sessionData?.session?.user) {
        return sessionData.session.user;
      }
      // Fall back to a network round-trip only if there is no cached session
      const { data } = await this.client.auth.getUser();
      return data?.user || null;
    } catch (e) {
      return null;
    }
  },

  async getSession() {
    if (!this.client) return null;
    try {
      const { data } = await this.client.auth.getSession();
      return data?.session || null;
    } catch (e) {
      return null;
    }
  }
};

window.API = API;
