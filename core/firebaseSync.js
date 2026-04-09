import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC29E8_p5pmtDgvVfjU3fjX8dDqWxhlPYc",
  authDomain: "myworkona-app.firebaseapp.com",
  projectId: "myworkona-app",
  storageBucket: "myworkona-app.firebasestorage.app",
  messagingSenderId: "844390365861",
  appId: "1:844390365861:web:b6f2af07c9cd4e434feb4c",
  measurementId: "G-TH5M527RWE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const tasksCollection = collection(db, 'tasks');

/**
 * Adds a new task to the 'tasks' collection in Firestore.
 * Uses the task ID as the document ID for consistency.
 * @param {Object} taskData - The task object.
 */
export async function addTaskToCloud(taskData) {
    try {
        await setDoc(doc(tasksCollection, taskData.id.toString()), taskData);
    } catch (e) {
        console.error("Error adding task to Firebase:", e);
    }
}

/**
 * Updates an existing task in Firestore.
 * @param {string|number} taskId - The ID of the task to update.
 * @param {Object} updateData - The fields to update.
 */
export async function updateTaskInCloud(taskId, updateData) {
    try {
        await updateDoc(doc(tasksCollection, taskId.toString()), updateData);
    } catch (e) {
        console.error("Error updating task in Firebase:", e);
    }
}

/**
 * Deletes a task from Firestore.
 * @param {string|number} taskId - The ID of the task to delete.
 */
export async function deleteTaskFromCloud(taskId) {
    try {
        await deleteDoc(doc(tasksCollection, taskId.toString()));
    } catch (e) {
        console.error("Error deleting task in Firebase:", e);
    }
}

/**
 * Sets up a real-time listener for the 'tasks' collection.
 * @param {Function} callback - Function called with the array of updated tasks.
 */
export function setupRealtimeListener(callback) {
    return onSnapshot(tasksCollection, (snapshot) => {
        const tasks = snapshot.docs.map(doc => doc.data());
        callback(tasks);
    });
}