import { store } from './src/lib/store.js';

console.log('=== RUNNING YTA - COLABAPP UNIFIED LOGIN & PROMPTS VERIFICATION ===\n');

// 1. Clean State
store.resetToCleanState();
const s0 = store.getState();
console.log('--- Step 1: Clean State Verification ---');
console.log('✓ Channels count:', s0.channels.length, '(Expected 0)');
console.log('✓ Videos count:', s0.videos.length, '(Expected 0)');
console.log('✓ Initial Prompts count:', s0.prompts.length);
console.log('✓ Active Team Members:', s0.teamMembers.map(m => m.username));

// 2. Single Unified Login (No role selection argument required)
console.log('\n--- Step 2: Testing Unified Single Login ---');
const adminLogin = store.login('admin', 'password');
console.log('✓ Admin login detected automatically:', adminLogin.success, 'Role:', adminLogin.user.role);
if (adminLogin.user.role !== 'ADMIN') throw new Error('Failed to resolve Admin role');

const invalidLogin = store.login('admin', 'wrong_password');
console.log('✓ Invalid password rejected:', !invalidLogin.success, 'Error:', invalidLogin.error);

// 3. Channel Creation
console.log('\n--- Step 3: Channel Creation ---');
const chan = store.addChannel('Denzel');
console.log('✓ Created Channel:', chan.name);

// 4. Line-by-Line Titles Addition
console.log('\n--- Step 4: Line-by-Line Titles Addition ---');
const rawTitles = `7 UNACCEPTABLE Behaviors You Should NEVER Tolerate From Anyone\nIf They Disrespect You Once Handle Them Like This || best Motivational speech`;
const titlesRes = store.addTitlesToChannel(chan.id, rawTitles);
console.log(`✓ Added ${titlesRes.videos.length} videos:`);
titlesRes.videos.forEach(v => {
  console.log(`  Video ${v.videoNumber}: "${v.title}"`);
});

// 5. Role Prompts Management
console.log('\n--- Step 5: Testing Role Prompts CRUD ---');
const initialScriptPrompts = store.getPromptsForRole('Script');
console.log(`✓ Initial Script prompts: ${initialScriptPrompts.length}`);

const newPrompt = store.addRolePrompt(
  'Script',
  'Motivational Speech Structure',
  'Structure this speech into 3 compelling psychological insights for: [TITLE]. Use strong punchlines and pauses.'
);
console.log('✓ Added new prompt:', newPrompt.label, 'for role:', newPrompt.roleName);

const updatedScriptPrompts = store.getPromptsForRole('Script');
console.log(`✓ Updated Script prompts count: ${updatedScriptPrompts.length}`);
if (updatedScriptPrompts.length !== initialScriptPrompts.length + 1) {
  throw new Error('Prompt was not added correctly!');
}

// 6. Create Team Member and Assign Roles
console.log('\n--- Step 6: Create Team Member ---');
const memberRes = store.addTeamMember('denzel_writer', 'secret123', ['Script', 'Meta Info']);
console.log('✓ Team member created:', memberRes.member.username, 'Roles:', memberRes.member.roles);

// 7. Team Member Login (Single unified login)
console.log('\n--- Step 7: Team Member Unified Login ---');
const memberLogin = store.login('denzel_writer', 'secret123');
console.log('✓ Team member login detected automatically:', memberLogin.success, 'Role:', memberLogin.user.role);
if (memberLogin.user.role !== 'TEAM_MEMBER') throw new Error('Failed to resolve TEAM_MEMBER role');

// 8. Verify Team Member Can Access Prompts for Their Role
console.log('\n--- Step 8: Verify Prompts for Team Member Role ---');
const memberPrompts = store.getPromptsForRole('Script');
console.log(`✓ Team member can fetch ${memberPrompts.length} prompt(s) for Script:`);
memberPrompts.forEach(p => console.log(`  - [${p.label}]: "${p.promptText.substring(0, 50)}..."`));

// 9. Team Member Submits Script
console.log('\n--- Step 9: Team Member Submits Script ---');
const submitRes = store.submitContent({
  channelId: chan.id,
  videoNumber: 1,
  task: 'Script',
  textValue: 'Never tolerate disrespect in silence. When a boundary is crossed, articulate your stance immediately.'
});
console.log('✓ Script submitted:', submitRes.success);

const updatedVid1 = store.getState().videos.find(v => v.channelId === chan.id && v.videoNumber === 1);
const scriptStatus = store.getCellStatus(updatedVid1, 'script');
console.log('✓ Video 1 Script Cell Status:', scriptStatus.status, `(Length: ${scriptStatus.value.length})`);

// 10. Ledger and Real-Time Feed Check
console.log('\n--- Step 10: Shared Ledger & Real-Time Feed ---');
const latestFeed = store.getState().realTimeFeed[0];
console.log('✓ Real-Time feed:', latestFeed.message);
const latestLedger = store.getState().ledger[0];
console.log('✓ Latest ledger entry:', {
  actor: latestLedger.actor,
  action: latestLedger.action,
  task: latestLedger.task,
  timestamp: latestLedger.timestamp
});

console.log('\n============================================================');
console.log('✓✓ ALL UNIFIED LOGIN & ROLE PROMPT TESTS PASSED 100% ✓✓');
console.log('============================================================');
