import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env?.VITE_SUPABASE_URL || 'https://tandgmuuixassiflkcgb.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhbmRnbXV1aXhhc3NpZmxrY2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NjM2MjMsImV4cCI6MjEwNTAzOTYyM30.byGuw3S6E5JyJU3WbLy_BiGwaLr0Yz8ZGsbnzaLgWAo';

// Main client: handles active logged-in user session, postgres queries, realtime, and storage
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Auxiliary client: used exclusively for user registration without overriding the admin's current session
export const supabaseAuthHelper = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'sb-aux-auth-token',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Storage upload helper
export async function uploadStorageFile(bucket, path, file) {
  const fileExt = file.name ? file.name.split('.').pop() : 'dat';
  const cleanPath = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${fileExt}`;
  const fullPath = path ? `${path}/${cleanPath}` : cleanPath;

  try {
    const { data, error } = await supabase.storage.from(bucket).upload(fullPath, file, {
      upsert: true,
      contentType: file.type || undefined
    });

    if (error) {
      console.error(`Storage upload error to ${bucket}:`, error);
      return {
        error: error.message || 'Storage upload failed',
        filePath: null,
        publicUrl: null,
        fileName: file.name
      };
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fullPath);

    return {
      filePath: data.path,
      publicUrl: urlData?.publicUrl || '',
      fileName: file.name
    };
  } catch (err) {
    console.error('Storage helper exception:', err);
    return {
      error: err.message || 'Storage exception occurred',
      filePath: null,
      publicUrl: null,
      fileName: file.name
    };
  }
}
