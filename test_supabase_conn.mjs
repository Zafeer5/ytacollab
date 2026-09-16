import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tandgmuuixassiflkcgb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhbmRnbXV1aXhhc3NpZmxrY2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NjM2MjMsImV4cCI6MjEwNTAzOTYyM30.byGuw3S6E5JyJU3WbLy_BiGwaLr0Yz8ZGsbnzaLgWAo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing connection to Supabase...');
  const { data, error } = await supabase.from('roles').select('*');
  if (error) {
    console.log('Query result error:', error.message, error.code, error.details);
  } else {
    console.log('Connected! Data in roles table:', data);
  }
}

test();
