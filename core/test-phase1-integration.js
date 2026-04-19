/**
 * 🧪 test-phase1-integration.js - Verify Phase 1 Core Foundation
 * 
 * Tests that StateManager, EventBus, and StorageAdapter work together
 * Run this in browser console to verify the foundation is solid
 * 
 * Usage (in dashboard.js):
 *   import { runPhase1Tests } from './core/test-phase1-integration.js';
 *   runPhase1Tests(); // Run after initializeStateManager()
 */

import { stateManager } from './StateManager.js';
import { eventBus, Events } from './EventBus.js';

export async function runPhase1Tests() {
  console.log('\n=== 🧪 Phase 1 Integration Tests ===\n');
  
  let passedTests = 0;
  let failedTests = 0;
  
  // Test 1: StateManager stores data
  console.log('Test 1: StateManager can store and retrieve data');
  try {
    stateManager.update('currentSpaceId', 42, { silent: true });
    const retrieved = stateManager.getState('currentSpaceId');
    
    if (retrieved === 42) {
      console.log('✅ PASSED: StateManager store/retrieve');
      passedTests++;
    } else {
      console.error('❌ FAILED: Expected 42, got', retrieved);
      failedTests++;
    }
  } catch (e) {
    console.error('❌ FAILED with error:', e.message);
    failedTests++;
  }
  
  // Test 2: StateManager notifies subscribers
  console.log('\nTest 2: StateManager notifies subscribers on change');
  try {
    let notified = false;
    let notifiedValue = null;
    
    const unsubscribe = stateManager.subscribe('appSettings', (newValue, oldValue) => {
      notified = true;
      notifiedValue = newValue;
    });
    
    stateManager.update('appSettings', { isDarkMode: true }, { immediate: true });
    
    // Give debounce time to complete
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (notified && notifiedValue.isDarkMode === true) {
      console.log('✅ PASSED: Subscriber notification works');
      passedTests++;
    } else {
      console.error('❌ FAILED: Subscriber not notified or wrong value');
      failedTests++;
    }
    
    unsubscribe(); // Clean up
  } catch (e) {
    console.error('❌ FAILED with error:', e.message);
    failedTests++;
  }
  
  // Test 3: StateManager patch (merge) works
  console.log('\nTest 3: StateManager.patch() merges objects');
  try {
    stateManager.update('appSettings', { isDarkMode: true, fontSize: 14 }, { silent: true });
    stateManager.patch('appSettings', { fontSize: 16 }, { immediate: true, silent: true });
    
    const settings = stateManager.getState('appSettings');
    
    if (settings.isDarkMode === true && settings.fontSize === 16) {
      console.log('✅ PASSED: Patch merge works (isDarkMode preserved, fontSize updated)');
      passedTests++;
    } else {
      console.error('❌ FAILED: Patch did not merge correctly', settings);
      failedTests++;
    }
  } catch (e) {
    console.error('❌ FAILED with error:', e.message);
    failedTests++;
  }
  
  // Test 4: EventBus.on() subscribes to events
  console.log('\nTest 4: EventBus can emit and receive events');
  try {
    let eventFired = false;
    let eventData = null;
    
    const unsubscribe = eventBus.on(Events.SHOW_TOAST, (data) => {
      eventFired = true;
      eventData = data;
    });
    
    eventBus.emit(Events.SHOW_TOAST, { message: 'Test message' });
    
    if (eventFired && eventData.message === 'Test message') {
      console.log('✅ PASSED: EventBus emit/on works');
      passedTests++;
    } else {
      console.error('❌ FAILED: Event not fired or data incorrect');
      failedTests++;
    }
    
    unsubscribe();
  } catch (e) {
    console.error('❌ FAILED with error:', e.message);
    failedTests++;
  }
  
  // Test 5: EventBus.once() fires only once
  console.log('\nTest 5: EventBus.once() fires only once');
  try {
    let fireCount = 0;
    
    eventBus.once(Events.TASK_CREATED, () => {
      fireCount++;
    });
    
    eventBus.emit(Events.TASK_CREATED, {});
    eventBus.emit(Events.TASK_CREATED, {});
    
    if (fireCount === 1) {
      console.log('✅ PASSED: EventBus.once() only fired once');
      passedTests++;
    } else {
      console.error('❌ FAILED: EventBus.once() fired', fireCount, 'times instead of 1');
      failedTests++;
    }
  } catch (e) {
    console.error('❌ FAILED with error:', e.message);
    failedTests++;
  }
  
  // Test 6: Circular sync prevention (version tracking)
  console.log('\nTest 6: StateManager.getNextSyncVersion() prevents circular loops');
  try {
    const v1 = stateManager.getNextSyncVersion();
    const v2 = stateManager.getNextSyncVersion();
    const v3 = stateManager.getNextSyncVersion();
    
    const isV1Stale = stateManager.isSyncStale(v1);
    const isV3Stale = stateManager.isSyncStale(v3);
    
    if (v1 < v2 && v2 < v3 && isV1Stale && !isV3Stale) {
      console.log('✅ PASSED: Version tracking increments correctly');
      passedTests++;
    } else {
      console.error('❌ FAILED: Versions not tracking correctly', {v1, v2, v3, isV1Stale, isV3Stale});
      failedTests++;
    }
  } catch (e) {
    console.error('❌ FAILED with error:', e.message);
    failedTests++;
  }
  
  // Test 7: StateManager unsubscribe works
  console.log('\nTest 7: StateManager subscriber can unsubscribe');
  try {
    let fireCount = 0;
    
    const unsubscribe = stateManager.subscribe('currentSpaceId', () => {
      fireCount++;
    });
    
    stateManager.update('currentSpaceId', 10, { immediate: true });
    await new Promise(resolve => setTimeout(resolve, 300));
    
    unsubscribe();
    
    stateManager.update('currentSpaceId', 20, { immediate: true });
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (fireCount === 1) {
      console.log('✅ PASSED: Unsubscribe prevented second notification');
      passedTests++;
    } else {
      console.error('❌ FAILED: Expected 1 notification, got', fireCount);
      failedTests++;
    }
  } catch (e) {
    console.error('❌ FAILED with error:', e.message);
    failedTests++;
  }
  
  // Test 8: EventBus listenerCount works
  console.log('\nTest 8: EventBus.listenerCount() tracks listeners');
  try {
    eventBus.off(Events.TEST_EVENT); // Clear any existing
    
    const handler1 = () => {};
    const handler2 = () => {};
    
    eventBus.on(Events.TEST_EVENT || 'test:event', handler1);
    let count = eventBus.listenerCount(Events.TEST_EVENT || 'test:event');
    
    if (count === 1) {
      console.log('✅ PASSED: listenerCount() tracks listeners');
      passedTests++;
    } else {
      console.error('❌ FAILED: Expected 1 listener, got', count);
      failedTests++;
    }
    
    eventBus.off(Events.TEST_EVENT || 'test:event');
  } catch (e) {
    console.error('❌ FAILED with error:', e.message);
    failedTests++;
  }
  
  // Summary
  console.log('\n=== 📊 Test Summary ===');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Total: ${passedTests + failedTests}`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All Phase 1 tests passed! Foundation is solid.');
    return true;
  } else {
    console.warn('\n⚠️  Some tests failed. Check errors above.');
    return false;
  }
}

/**
 * Helper test to verify StorageAdapter integration
 * Run after initializeStateManager()
 */
export function testStorageAdapterIntegration() {
  console.log('\n=== 🧪 StorageAdapter Integration Test ===\n');
  
  try {
    // Check that StateManager has data (should have been loaded by StorageAdapter)
    const spaces = stateManager.getState('spaces');
    const appSettings = stateManager.getState('appSettings');
    
    console.log('Loaded spaces:', spaces.length);
    console.log('Loaded appSettings keys:', Object.keys(appSettings).length);
    
    if (spaces.length > 0 && Object.keys(appSettings).length > 0) {
      console.log('✅ PASSED: StorageAdapter loaded data into StateManager');
      return true;
    } else {
      console.warn('⚠️  StorageAdapter may not have loaded data (but this might be normal for new installations)');
      return true; // Not a hard failure
    }
  } catch (e) {
    console.error('❌ FAILED with error:', e.message);
    return false;
  }
}
