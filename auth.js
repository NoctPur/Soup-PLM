/* =====================================================
   AUTHENTICATION MODULE
   Handles login, signup, social auth, and session management
   ===================================================== */

// Auth state
let currentUser = null;

// ===== EMAIL/PASSWORD AUTH =====

async function signUpWithEmail(email, password, displayName) {
    try {
        const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const auth = window.getFirebaseAuth();

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        // Update display name
        await updateProfile(userCredential.user, {
            displayName: displayName
        });

        // Create user profile in Firestore
        await createUserProfile(userCredential.user, { displayName });

        showToast('Compte créé avec succès ! 🎉', 'success');
        closeAuthModal();
        return userCredential.user;
    } catch (error) {
        handleAuthError(error);
        return null;
    }
}

async function signInWithEmail(email, password) {
    try {
        const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const auth = window.getFirebaseAuth();

        if (!auth) {
            showToast('Firebase non initialisé, patiente...', 'warning');
            console.error('Auth not initialized yet');
            return null;
        }

        console.log('Attempting login with:', email);
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('Login successful:', userCredential.user.email);
        showToast('Connexion réussie ! 👋', 'success');
        closeAuthModal();
        return userCredential.user;
    } catch (error) {
        console.error('Login error details:', error.code, error.message);
        handleAuthError(error);
        return null;
    }
}

// ===== SOCIAL AUTH =====

async function signInWithGoogle() {
    try {
        const { signInWithPopup, GoogleAuthProvider } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const auth = window.getFirebaseAuth();

        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);

        // Check if new user
        const isNewUser = result._tokenResponse?.isNewUser;
        if (isNewUser) {
            await createUserProfile(result.user);
        }

        showToast('Connexion Google réussie ! 🎉', 'success');
        closeAuthModal();
        return result.user;
    } catch (error) {
        handleAuthError(error);
        return null;
    }
}

async function signInWithFacebook() {
    try {
        const { signInWithPopup, FacebookAuthProvider } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const auth = window.getFirebaseAuth();

        const provider = new FacebookAuthProvider();
        const result = await signInWithPopup(auth, provider);

        const isNewUser = result._tokenResponse?.isNewUser;
        if (isNewUser) {
            await createUserProfile(result.user);
        }

        showToast('Connexion Facebook réussie ! 🎉', 'success');
        closeAuthModal();
        return result.user;
    } catch (error) {
        handleAuthError(error);
        return null;
    }
}

// ===== SIGN OUT =====

async function signOutUser() {
    try {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const auth = window.getFirebaseAuth();

        await signOut(auth);
        showToast('Déconnexion réussie', 'info');
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

// ===== PASSWORD RESET =====

async function resetPassword(email) {
    try {
        const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const auth = window.getFirebaseAuth();

        await sendPasswordResetEmail(auth, email);
        showToast('Email de réinitialisation envoyé ! 📧', 'success');
        return true;
    } catch (error) {
        handleAuthError(error);
        return false;
    }
}

// ===== USER PROFILE =====

async function createUserProfile(user, additionalData = {}) {
    try {
        const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const db = window.getFirebaseDb();

        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: additionalData.displayName || user.displayName || 'Utilisateur',
            photoURL: user.photoURL || null,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            preferences: {
                favoriteRadios: [],
                theme: 'dark',
                notifications: true
            },
            stats: {
                totalListeningTime: 0,
                tracksListened: 0,
                lastRadio: null
            }
        }, { merge: true });

        console.log('User profile created/updated');
    } catch (error) {
        console.error('Error creating user profile:', error);
    }
}

async function getUserProfile() {
    try {
        const auth = window.getFirebaseAuth();
        if (!auth.currentUser) return null;

        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const db = window.getFirebaseDb();

        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            return userSnap.data();
        }
        return null;
    } catch (error) {
        console.error('Error getting user profile:', error);
        return null;
    }
}

async function updateUserProfile(updates) {
    try {
        const auth = window.getFirebaseAuth();
        if (!auth.currentUser) return false;

        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const db = window.getFirebaseDb();

        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });

        showToast('Profil mis à jour ! ✨', 'success');
        return true;
    } catch (error) {
        console.error('Error updating profile:', error);
        return false;
    }
}

// ===== AUTH STATE HANDLERS =====

function onUserLoggedIn(user) {
    currentUser = user;
    updateUIForLoggedInUser(user);
    loadUserPreferences();
}

function onUserLoggedOut() {
    currentUser = null;
    updateUIForLoggedOutUser();
}

function updateUIForLoggedInUser(user) {
    const authBtn = document.getElementById('authButton');
    const userMenu = document.getElementById('userMenu');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');

    if (authBtn) authBtn.classList.add('hidden');
    if (userMenu) userMenu.classList.remove('hidden');
    if (userAvatar) {
        userAvatar.src = user.photoURL || 'images/default-avatar.png';
    }
    if (userName) {
        userName.textContent = user.displayName || user.email.split('@')[0];
    }
}

function updateUIForLoggedOutUser() {
    const authBtn = document.getElementById('authButton');
    const userMenu = document.getElementById('userMenu');

    if (authBtn) authBtn.classList.remove('hidden');
    if (userMenu) userMenu.classList.add('hidden');
}

async function loadUserPreferences() {
    const profile = await getUserProfile();
    if (profile && profile.preferences) {
        // Apply user preferences
        window.userPreferences = profile.preferences;
        console.log('User preferences loaded:', profile.preferences);
    }
}

// ===== ERROR HANDLING =====

function handleAuthError(error) {
    console.error('Auth error:', error);

    const errorMessages = {
        'auth/email-already-in-use': 'Cet email est déjà utilisé',
        'auth/invalid-email': 'Email invalide',
        'auth/operation-not-allowed': 'Opération non autorisée',
        'auth/weak-password': 'Mot de passe trop faible (min. 6 caractères)',
        'auth/user-disabled': 'Ce compte a été désactivé',
        'auth/user-not-found': 'Aucun compte avec cet email',
        'auth/wrong-password': 'Mot de passe incorrect',
        'auth/popup-closed-by-user': 'Connexion annulée',
        'auth/cancelled-popup-request': 'Connexion annulée',
        'auth/network-request-failed': 'Erreur de connexion réseau'
    };

    const message = errorMessages[error.code] || 'Une erreur est survenue';
    showToast(message, 'error');
}

// ===== TOAST NOTIFICATIONS =====

function showToast(message, type = 'info') {
    // Remove existing toasts
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const colors = {
        success: 'from-green-500 to-emerald-500',
        error: 'from-red-500 to-rose-500',
        info: 'from-blue-500 to-cyan-500',
        warning: 'from-yellow-500 to-orange-500'
    };

    const toast = document.createElement('div');
    toast.className = `toast-notification fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full bg-gradient-to-r ${colors[type]} text-white font-medium shadow-lg transform transition-all duration-300 translate-y-10 opacity-0`;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== MODAL CONTROLS =====

function openAuthModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';

        // Switch to correct tab
        switchAuthTab(mode);
    }
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }
}

function switchAuthTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (tab === 'login') {
        loginTab?.classList.add('bg-white/10', 'text-white');
        loginTab?.classList.remove('text-gray-400');
        signupTab?.classList.remove('bg-white/10', 'text-white');
        signupTab?.classList.add('text-gray-400');
        loginForm?.classList.remove('hidden');
        signupForm?.classList.add('hidden');
    } else {
        signupTab?.classList.add('bg-white/10', 'text-white');
        signupTab?.classList.remove('text-gray-400');
        loginTab?.classList.remove('bg-white/10', 'text-white');
        loginTab?.classList.add('text-gray-400');
        signupForm?.classList.remove('hidden');
        loginForm?.classList.add('hidden');
    }
}

// ===== FORM HANDLERS =====

function handleLoginSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    signInWithEmail(email, password);
}

function handleSignupSubmit(event) {
    event.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    signUpWithEmail(email, password, name);
}

// Export functions
window.signUpWithEmail = signUpWithEmail;
window.signInWithEmail = signInWithEmail;
window.signInWithGoogle = signInWithGoogle;
window.signInWithFacebook = signInWithFacebook;
window.signOutUser = signOutUser;
window.resetPassword = resetPassword;
window.getUserProfile = getUserProfile;
window.updateUserProfile = updateUserProfile;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthTab = switchAuthTab;
window.handleLoginSubmit = handleLoginSubmit;
window.handleSignupSubmit = handleSignupSubmit;
window.showToast = showToast;
window.currentUser = () => currentUser;
