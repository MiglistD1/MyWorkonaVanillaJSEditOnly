import { initializeApp } from "./lib/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "./lib/firebase-firestore.js";
import { getCurrentSpace, saveData } from "./storage.js";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCVX63Zj9RIJmHEfVCN5g3uP8dojeXniPg",
    authDomain: "myworkona-realtime.firebaseapp.com",
    projectId: "myworkona-realtime",
    storageBucket: "myworkona-realtime.firebasestorage.app",
    messagingSenderId: "659357151725",
    appId: "1:659357151725:web:024039ffc44a290f98b7e4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const docRef = doc(db, "data", "mynotes");

/**
 * 🚀 เริ่มต้นระบบ Real-time Sync สำหรับ Note
 */
export function initFirebaseSync() {
    const workspaceNote = document.getElementById('workspace-note');
    if (!workspaceNote) return;

    // 1. Listen: รับข้อมูลจาก Firebase มาอัปเดตหน้าจอ
    onSnapshot(docRef, (snapshot) => {
        const data = snapshot.data();
        if (data && data.content !== undefined) {
            // ตรวจสอบเพื่อป้องกัน Infinite Loop และ Cursor กระโดด
            if (workspaceNote.innerHTML !== data.content) {
                workspaceNote.innerHTML = data.content;
                const space = getCurrentSpace();
                if (space) space.note = data.content;
            }
        }
    });

    // 2. Push: เมื่อเราพิมพ์ ให้ส่งขึ้น Firebase ทันที
    workspaceNote.addEventListener('input', (e) => {
        const content = e.target.innerHTML;
        // Only sync to cloud if the content has actually changed to avoid unnecessary writes
        if (getCurrentSpace()?.note !== content) {
            getCurrentSpace().note = content;
            saveData(); // Save Local Storage
            setDoc(docRef, { content: content }, { merge: true }); // Sync to Cloud
        }
    });
}