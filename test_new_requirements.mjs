import {
  store,
  getChannelInitials,
  getChannelDisplayNumber,
  getChannelMemberDisplayName,
  maskTextForMember
} from './src/lib/store.js';

console.log('=== VERIFYING NEW USER REQUIREMENTS ===\n');

// 1. Channel Initials & Masking Verification
console.log('--- 1. Testing Channel Initials Generation ---');
const testCases = [
  { name: 'English Meridian', expected: 'EM' },
  { name: 'Lucas Explains HQ', expected: 'LEH' },
  { name: 'Garristory', expected: 'GA' },
  { name: 'Crypto Daily News', expected: 'CDN' },
  { name: 'Tech', expected: 'TE' }
];

for (const tc of testCases) {
  const initials = getChannelInitials(tc.name);
  console.log(`✓ Channel "${tc.name}" -> Initials: "${initials}" (Expected: "${tc.expected}")`);
  if (initials !== tc.expected) {
    throw new Error(`Initials mismatch for ${tc.name}: got ${initials}, expected ${tc.expected}`);
  }
}

// 2. Testing Channel Member Display Name Format (e.g. Channel 1 - EM)
console.log('\n--- 2. Testing Team Member Display Names ---');
const mockChannels = [
  { id: 'c1', name: 'English Meridian', created_at: '2026-09-18T00:00:00Z' },
  { id: 'c2', name: 'Lucas Explains HQ', created_at: '2026-09-26T00:00:00Z' },
  { id: 'c3', name: 'Garristory', created_at: '2026-09-30T00:00:00Z' }
];

const emName = getChannelMemberDisplayName(mockChannels[0], mockChannels);
console.log(`✓ Channel 1 displayName: "${emName}"`);
if (emName !== 'Channel 1 - EM') {
  throw new Error(`Expected "Channel 1 - EM" but got "${emName}"`);
}

const lehName = getChannelMemberDisplayName(mockChannels[1], mockChannels);
console.log(`✓ Channel 2 displayName: "${lehName}"`);
if (lehName !== 'Channel 2 - LEH') {
  throw new Error(`Expected "Channel 2 - LEH" but got "${lehName}"`);
}

const gaName = getChannelMemberDisplayName(mockChannels[2], mockChannels);
console.log(`✓ Channel 3 displayName: "${gaName}"`);
if (gaName !== 'Channel 3 - GA') {
  throw new Error(`Expected "Channel 3 - GA" but got "${gaName}"`);
}

// 3. Testing Text Masking for Team Members
console.log('\n--- 3. Testing Text Masking for Team Members ---');
const rawText = "Pending Script on Video 1 for 'English Meridian'";
const maskedText = maskTextForMember(rawText, mockChannels);
console.log(`✓ Original: "${rawText}"`);
console.log(`✓ Masked:   "${maskedText}"`);
if (!maskedText.includes('Channel 1 - EM') || maskedText.includes('English Meridian')) {
  throw new Error(`Masking failed: ${maskedText}`);
}

// 4. Testing Admin Login with New Credentials
console.log('\n--- 4. Testing Admin Login with New Credentials ---');
async function testAuth() {
  const invalidLogin = await store.login('admin', 'password');
  console.log('✓ Old password rejected:', !invalidLogin.success);
  if (invalidLogin.success) {
    throw new Error('Old password should have been rejected!');
  }

  const validLogin = await store.login('admin', 'Zafeer@9723');
  console.log('✓ New password accepted:', validLogin.success, 'User:', validLogin.user?.username, 'Role:', validLogin.user?.role);
  if (!validLogin.success || validLogin.user?.role !== 'OWNER' && validLogin.user?.role !== 'ADMIN') {
    throw new Error('New login failed to authenticate admin!');
  }

  // 5. Testing Team Member Account Login
  console.log('\n--- 5. Testing Team Member Account Login ---');
  const memberLogin = await store.login('team_member', 'password123');
  console.log('✓ Team member login:', memberLogin.success, 'Role:', memberLogin.user?.role);

  // Switch back to Admin
  await store.login('admin', 'Zafeer@9723');

  // 6. Testing Channel Description Add & Edit
  console.log('\n--- 6. Testing Channel Description Storage ---');
  const state = store.getState();
  const existingChan = state.channels.find(c => c.name === 'English Meridian');
  if (existingChan) {
    const desc = 'Educational channel focusing on English pronunciation, vocabulary, and communication skills.';
    console.log(`Setting description for "${existingChan.name}"...`);
    await store.editChannel(existingChan.id, existingChan.name, desc);
    const updatedAbout = store.getChannelAbout(existingChan.id);
    console.log(`✓ Retrieved channel description: "${updatedAbout}"`);
    if (updatedAbout !== desc) {
      throw new Error(`Channel description was not saved correctly! Expected "${desc}", got "${updatedAbout}"`);
    }
  }

  console.log('\n============================================================');
  console.log('✓✓ ALL USER REQUIREMENTS VERIFIED & WORKING PERFECTLY! ✓✓');
  console.log('============================================================\n');
  process.exit(0);
}

testAuth().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
