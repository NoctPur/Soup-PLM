/* =====================================================
   FIREBASE CONFIGURATION
   
   Pour configurer Firebase :
   1. Crée un projet sur https://console.firebase.google.com
   2. Ajoute une app Web
   3. Copie ta configuration ci-dessous
   4. Active Authentication > Sign-in method :
      - Email/Password
      - Google
      - Facebook (optionnel)
   5. Active Firestore Database
   ===================================================== */

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyAF8SpSv3ZE-qDKyniMLK5f52q6iPvWrZg",
    authDomain: "noct-plm.firebaseapp.com",
    projectId: "noct-plm",
    storageBucket: "noct-plm.firebasestorage.app",
    messagingSenderId: "250737789465",
    appId: "1:250737789465:web:a8265fc70e456a47e7b888",
    measurementId: "G-473PWQED58"
};

// Initialize Firebase
let app, auth, db;

async function initFirebase() {
    try {
        // Import Firebase modules dynamically
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getAuth, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        console.log('🔥 Firebase initialized successfully');

        // Listen to auth state changes
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log('👤 User logged in:', user.email);
                onUserLoggedIn(user);
            } else {
                console.log('👤 User logged out');
                onUserLoggedOut();
            }
        });

        return { app, auth, db };
    } catch (error) {
        console.error('Firebase init error:', error);
        return null;
    }
}

// Export for other modules
window.firebaseConfig = firebaseConfig;
window.initFirebase = initFirebase;
window.getFirebaseAuth = () => auth;
window.getFirebaseDb = () => db;
