/**
 * Supabase Client Configuration
 * Uses Project URL and publishable (anon) key only. Never includes secret keys.
 * Configured with session persistence, auto-refresh, and URL callback detection.
 */
const SUPABASE_URL = 'https://utxasuzwdmdelknbozkl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DDRf7MD5l8kZimRq44VDAQ_KvJ9XG3k';

// Explicitly authorized Administrator Supabase Auth UID
const AUTHORIZED_ADMIN_UID = '9d8e6490-d441-4099-b0ae-e7b11e0c8a95';

// Single Supabase JS v2 instance configured for robust auth & session persistence
if (window.supabase) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: 'fixit_supabase_auth_token'
    }
  });
  window.AUTHORIZED_ADMIN_UID = AUTHORIZED_ADMIN_UID;
  console.log('✅ Supabase client initialized with session persistence');
} else {
  console.error('❌ Supabase library not loaded. Make sure the Supabase CDN script is included before this file.');
}
