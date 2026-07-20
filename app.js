/* ── Jaji · App Logic ─────────────────────────── */
(function () {
  'use strict';

  // ── Firebase Init ──
  const firebaseConfig = {
    apiKey: "AIzaSyDdaeDjN6Rv5QEWOUGt5UOID6_w_ub9qjc",
    authDomain: "jaji-5a88d.firebaseapp.com",
    projectId: "jaji-5a88d",
    storageBucket: "jaji-5a88d.firebasestorage.app",
    messagingSenderId: "980657079623",
    appId: "1:980657079623:web:204d1d61df44069bf3b862"
  };
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const auth = firebase.auth();
  // ── DOM refs ──
  const overlay       = document.getElementById('signup-overlay');
  const signupForm    = document.getElementById('signup-form');
  const home          = document.getElementById('home');
  const toast         = document.getElementById('toast');

  const usernameIn    = document.getElementById('username');
  const realnameIn    = document.getElementById('realname');
  const contactIn     = document.getElementById('contact');
  const classSelectEl = document.getElementById('class-select');

  const navClassLabel = document.getElementById('nav-class-label');
  const userAvatar    = document.getElementById('user-avatar');
  const userDisplay   = document.getElementById('user-display-name');
  const searchInput   = document.getElementById('search-input');
  const feedEl        = document.getElementById('feed');
  const feedTitle     = document.getElementById('feed-title');
  const emptyState    = document.getElementById('empty-state');
  const subjectPills  = document.getElementById('subject-pills');
  const typePills     = document.getElementById('type-pills');

  // State
  let currentClass   = '8A';
  let currentSubject = 'all';
  let currentType    = 'all';
  let searchQuery    = '';

  // ── Helpers ──
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function setError(id, msg) {
    const el = document.getElementById(id + '-error');
    const wrap = document.getElementById(id)?.closest('.input-wrap') ||
                 document.getElementById(id + '-select')?.closest('.input-wrap');
    if (el) el.textContent = msg;
    if (wrap) wrap.classList.toggle('error', !!msg);
  }

  function clearErrors() {
    ['username', 'realname', 'contact', 'class'].forEach(id => setError(id, ''));
  }

  // ── Validation ──
  function validate() {
    clearErrors();
    let ok = true;
    const u = usernameIn.value.trim();
    const r = realnameIn.value.trim();
    const c = contactIn.value.trim();
    const cl = classSelectEl.value;

    if (!u) { setError('username', 'Username is required'); ok = false; }
    else if (u.length < 3) { setError('username', 'At least 3 characters'); ok = false; }

    if (!r) { setError('realname', 'Real name is required'); ok = false; }

    if (!c) { setError('contact', 'Email or phone is required'); ok = false; }
    else {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRe = /^\+?[\d\s\-()]{7,}$/;
      if (!emailRe.test(c) && !phoneRe.test(c)) {
        setError('contact', 'Enter a valid email or phone number');
        ok = false;
      }
    }

    if (!cl) { setError('class', 'Please select your class'); ok = false; }

    return ok ? { username: u, realname: r, contact: c, class: cl } : null;
  }

  // ── Star SVG builder ──
  function starSVG(type) {
    if (type === 'full') {
      return '<svg viewBox="0 0 24 24"><path class="star-filled" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    }
    if (type === 'half') {
      return '<svg viewBox="0 0 24 24"><defs><linearGradient id="hg"><stop offset="50%" stop-color="#f59e0b"/><stop offset="50%" stop-color="#d1d5db"/></linearGradient></defs><path fill="url(#hg)" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24"><path class="star-empty" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
  }

  function renderStars(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) html += starSVG('full');
      else if (i - rating === 0.5) html += starSVG('half');
      else html += starSVG('empty');
    }
    return html;
  }

  // ── Render a single card ──
  function cardHTML(a, delay) {
    const mainImg = (a.image_urls && a.image_urls.length > 0) ? a.image_urls[0] : (a.image_url || null);
    const thumbContent = mainImg
      ? `<img src="${mainImg}" alt="${a.title}" class="card-thumb-img" loading="lazy" />`
      : `<div class="thumb-lines">
            <div class="thumb-line"></div><div class="thumb-line"></div>
            <div class="thumb-line"></div><div class="thumb-line"></div>
            <div class="thumb-line"></div><div class="thumb-line"></div>
            <div class="thumb-line"></div>
          </div>`;

    const metaHTML = (a.stars != null)
      ? `<div class="card-stars">${renderStars(a.stars)}</div>
         <div class="card-purchases">
           <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z"/></svg>
           ${a.purchases} purchase${a.purchases !== 1 ? 's' : ''}
         </div>`
      : `<div class="card-date">${new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>`;

    return `
      <div class="assignment-card" data-id="${a.id}" style="animation-delay:${delay}ms">
        <div class="card-thumb">
          ${thumbContent}
          <div class="thumb-subject">${a.subject}</div>
          ${a.type ? `<div class="thumb-type">${a.type}</div>` : ''}
        </div>
        <div class="card-body">
          <div class="card-title">${a.title}</div>
          <div class="card-author">By: <strong>${a.author}</strong></div>
          ${metaHTML}
        </div>
      </div>`;
  }

  // ── Feed Render ──
  function renderFeed() {
    let results = [...dbAssignments];
    
    if (currentSubject !== 'all') {
      results = results.filter(a => a.subject === currentSubject);
    }
    if (currentType !== 'all') {
      results = results.filter(a => a.type === currentType);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        a.subject.toLowerCase().includes(q) ||
        (a.type && a.type.toLowerCase().includes(q))
      );
      feedTitle.textContent = `Results for "${searchQuery}"`;
    } else {
      feedTitle.textContent = 'Latest from your class';
    }

    if (results.length === 0) {
      feedEl.innerHTML = '';
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
      feedEl.innerHTML = results.map((a, i) => cardHTML(a, i * 60)).join('');
    }
  }

  // ── Fetch assignments (Firebase) ──
  let dbAssignments = [];
  let unsubscribeAssignments = null;

  function subscribeToAssignments() {
    if (unsubscribeAssignments) unsubscribeAssignments();
    
    unsubscribeAssignments = db.collection('assignments')
      .where('class', '==', currentClass)
      .onSnapshot((snapshot) => {
        dbAssignments = snapshot.docs.map(doc => ({ fb_id: doc.id, ...doc.data() }));
        // Sort by date descending locally
        dbAssignments.sort((a, b) => new Date(b.date) - new Date(a.date));
        renderFeed();
      }, (error) => {
        console.error("Firebase Snapshot Error:", error);
        showToast('Error syncing assignments ⚠️');
      });
  }

  // ── Sign-up submit (Firebase Auth) ──
  let confirmationResult = null;
  let recaptchaVerifier = null;

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Verify Phase
    if (confirmationResult) {
      const code = document.getElementById('verification-code').value;
      if (!code) return showToast('Please enter the 6-digit code');
      
      const submitBtnText = document.getElementById('signup-btn').querySelector('.btn-text');
      submitBtnText.textContent = 'Verifying...';
      
      try {
        const result = await confirmationResult.confirm(code);
        const data = validate();
        
        const userData = {
          username: data.username,
          realname: data.realname,
          class: data.class,
          contact: data.contact,
          created_at: new Date().toISOString()
        };
        
        await db.collection('users').doc(result.user.uid).set(userData);
        localStorage.setItem('jaji_user', JSON.stringify(userData));
        
        overlay.classList.add('hide');
        setTimeout(() => {
          overlay.classList.add('hidden');
          showHome(userData);
        }, 350);
        showToast(`Welcome, ${userData.username}! 🎉`);
      } catch (err) {
        console.error(err);
        showToast('Invalid verification code ⚠️');
        submitBtnText.textContent = 'Verify & Enter';
      }
      return;
    }

    // Send Phase
    const data = validate();
    if (!data) return;

    const contact = data.contact.trim();
    const submitBtnText = document.getElementById('signup-btn').querySelector('.btn-text');

    if (contact.includes('@')) {
      // Email Magic Link
      submitBtnText.textContent = 'Sending...';
      localStorage.setItem('pending_profile', JSON.stringify(data));
      localStorage.setItem('emailForSignIn', contact);
      
      const actionCodeSettings = {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: true
      };
      
      auth.sendSignInLinkToEmail(contact, actionCodeSettings)
        .then(() => {
          showToast('Magic link sent! Check your email to verify.');
          submitBtnText.textContent = 'Check your email!';
        })
        .catch(err => {
          console.error(err);
          showToast('Error sending email link ⚠️');
          submitBtnText.textContent = 'Get Started';
        });
    } else {
      // Phone OTP
      submitBtnText.textContent = 'Sending SMS...';
      
      if (!recaptchaVerifier) {
        recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
          'size': 'invisible'
        });
      }
      
      // Ensure phone format (basic attempt)
      let phone = contact;
      if (!phone.startsWith('+')) phone = '+' + phone; // assumes country code is included by user
      
      auth.signInWithPhoneNumber(phone, recaptchaVerifier)
        .then((result) => {
          confirmationResult = result;
          document.getElementById('verification-field').classList.remove('hidden');
          submitBtnText.textContent = 'Verify & Enter';
          showToast('6-digit code sent to your phone! 📱');
        })
        .catch((error) => {
          console.error(error);
          showToast('Error sending SMS. Check phone format. ⚠️');
          submitBtnText.textContent = 'Get Started';
          if (recaptchaVerifier) recaptchaVerifier.render().then(wId => grecaptcha.reset(wId));
        });
    }
  });

  // ── Live username availability check (Removed) ──
  usernameIn.addEventListener('input', () => {
    // No backend, always available
  });

  // ── Boot ──
  function boot() {
    // 1. Check for Magic Link return
    if (auth.isSignInWithEmailLink(window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) email = window.prompt('Please provide your email for confirmation');
      
      auth.signInWithEmailLink(email, window.location.href)
        .then(async (result) => {
          window.localStorage.removeItem('emailForSignIn');
          const pending = JSON.parse(localStorage.getItem('pending_profile') || '{}');
          
          if (pending.username) {
            const userData = { ...pending, created_at: new Date().toISOString() };
            await db.collection('users').doc(result.user.uid).set(userData);
            localStorage.setItem('jaji_user', JSON.stringify(userData));
            localStorage.removeItem('pending_profile');
          }
          
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          boot(); // Reload boot flow
        })
        .catch((error) => {
          console.error(error);
          showToast('Error signing in with link ⚠️');
        });
      return;
    }

    // 2. Normal Flow
    const saved = localStorage.getItem('jaji_user');
    
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        // User is logged into Firebase
        if (saved) {
          overlay.classList.add('hidden');
          showHome(JSON.parse(saved));
        } else {
          // Fetch from Firestore if localStorage is missing but Firebase is logged in
          const doc = await db.collection('users').doc(user.uid).get();
          if (doc.exists) {
            localStorage.setItem('jaji_user', JSON.stringify(doc.data()));
            overlay.classList.add('hidden');
            showHome(doc.data());
          }
        }
      } else {
        // Not logged in
        overlay.classList.remove('hidden');
        overlay.classList.remove('hide');
      }
    });
  }

  // ── Show home ──
  function showHome(user) {
    home.classList.remove('hidden');

    currentClass = user.class;
    navClassLabel.textContent = user.class;
    userAvatar.textContent = user.username.charAt(0).toUpperCase();
    userDisplay.textContent = user.username;

    document.querySelectorAll('#class-menu .dropdown-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.class === user.class);
    });

    renderFeed();
    subscribeToAssignments();
  }

  // ── Dropdowns ──
  function setupDropdowns() {
    document.querySelectorAll('.dropdown').forEach(dd => {
      const trigger = dd.querySelector('.dropdown-trigger, .class-pill-btn');
      if (!trigger) return;
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.dropdown.open').forEach(d => {
          if (d !== dd) d.classList.remove('open');
        });
        dd.classList.toggle('open');
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
    });

    // Class switch
    document.querySelectorAll('#class-menu .dropdown-item').forEach(btn => {
      btn.addEventListener('click', () => {
        currentClass = btn.dataset.class;
        navClassLabel.textContent = currentClass;

        document.querySelectorAll('#class-menu .dropdown-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const user = JSON.parse(localStorage.getItem('jaji_user') || '{}');
        user.class = currentClass;
        localStorage.setItem('jaji_user', JSON.stringify(user));

        renderFeed();
        subscribeToAssignments();
        showToast(`Switched to Class ${currentClass}`);
      });
    });
  }

  // ── Subject pills ──
  subjectPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.subject-pill');
    if (!pill) return;
    currentSubject = pill.dataset.subject;
    document.querySelectorAll('.subject-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    renderFeed();
  });

  // ── Type pills ──
  if (typePills) {
    typePills.addEventListener('click', (e) => {
      const pill = e.target.closest('.type-pill');
      if (!pill) return;
      currentType = pill.dataset.type;
      document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderFeed();
    });
  }

  // ── Search ──
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchInput.value.trim();
      renderFeed();
    }, 250);
  });



  // ── Support ──
  document.getElementById('feedback-btn')?.addEventListener('click', () => {
    showToast('Feedback form coming soon! 📝');
  });
  document.getElementById('donate-btn')?.addEventListener('click', () => {
    showToast('Donate page coming soon! 💙');
  });
  document.getElementById('signout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('jaji_user');
    location.reload();
  });

  // ── Request ──
  document.getElementById('request-btn')?.addEventListener('click', () => {
    showToast('Request feature coming soon! ✨');
  });

  // ── Input micro-interactions ──
  document.querySelectorAll('.input-wrap input, .input-wrap select').forEach(el => {
    el.addEventListener('focus', () => {
      const wrap = el.closest('.input-wrap');
      wrap.classList.remove('error');
      const errorSpan = wrap.parentElement.querySelector('.field-error');
      if (errorSpan) errorSpan.textContent = '';
    });
  });

  // ── Upload Modal (Supplier) ──
  const uploadOverlay = document.getElementById('upload-overlay');
  const newAssignmentBtn = document.getElementById('new-assignment-btn');
  const uploadCloseBtn = document.getElementById('upload-close-btn');
  const uploadForm = document.getElementById('upload-form');
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('upload-file-input');

  if (newAssignmentBtn) {
    newAssignmentBtn.addEventListener('click', () => {
      uploadOverlay.classList.remove('hidden');
    });
  }

  if (uploadCloseBtn) {
    uploadCloseBtn.addEventListener('click', () => {
      uploadOverlay.classList.add('hidden');
      resetUploadForm();
    });
  }

  if (uploadOverlay) {
    uploadOverlay.addEventListener('click', (e) => {
      if (e.target === uploadOverlay) {
        uploadOverlay.classList.add('hidden');
        resetUploadForm();
      }
    });
  }

  // ── Drag-and-drop & file preview ──
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', (e) => {
      if (e.target.closest('.file-remove')) return;
      fileInput.click();
    });

    ['dragenter', 'dragover'].forEach(evt =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); })
    );
    ['dragleave', 'drop'].forEach(evt =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); })
    );

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        showFilePreview(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) showFilePreview(fileInput.files);
    });
  }

  function showFilePreview(files) {
    const validFiles = Array.from(files).filter(f => {
      if (!['image/jpeg', 'image/png'].includes(f.type)) {
        showToast('Only PNG and JPG images are allowed ⚠️');
        return false;
      }
      if (f.size > 2 * 1024 * 1024) {
        showToast('Images must be under 2 MB ⚠️');
        return false;
      }
      return true;
    });

    if (!validFiles.length) {
      fileInput.value = '';
      return;
    }

    const old = dropzone.querySelector('.file-preview');
    if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.className = 'file-preview';

    validFiles.forEach(file => {
      const item = document.createElement('div');
      item.className = 'file-preview-item';
      
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      item.appendChild(img);
      
      wrap.appendChild(item);
    });

    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'file-remove';
    rmBtn.textContent = '×';
    rmBtn.style.position = 'relative';
    rmBtn.style.top = '0';
    rmBtn.style.right = '0';
    rmBtn.addEventListener('click', (e) => { e.stopPropagation(); clearFilePreview(); });
    
    wrap.appendChild(rmBtn);

    dropzone.querySelectorAll('.dropzone-icon, p, .dropzone-hint').forEach(el => el.style.display = 'none');
    dropzone.classList.add('has-file');
    dropzone.appendChild(wrap);
  }

  function clearFilePreview() {
    const p = dropzone.querySelector('.file-preview');
    if (p) p.remove();
    fileInput.value = '';
    dropzone.querySelectorAll('.dropzone-icon, p, .dropzone-hint').forEach(el => el.style.display = '');
    dropzone.classList.remove('has-file');
  }

  function resetUploadForm() {
    if (uploadForm) uploadForm.reset();
    if (dropzone) clearFilePreview();
  }

  // ── Upload submit (Cloudinary) ──
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saved = localStorage.getItem('jaji_user');
      if (!saved) return showToast('Please sign in first.');
      const user = JSON.parse(saved);

      const title = document.getElementById('upload-title').value.trim();
      const subject = document.getElementById('upload-subject').value;
      const type = document.getElementById('upload-type').value;
      const files = Array.from(fileInput.files);

      if (!title) return showToast('Enter a title for the assignment');
      if (title.length > 100) return showToast('Title must be 100 characters or fewer');
      if (!subject) return showToast('Select a subject');
      if (!type) return showToast('Select a type');
      if (!files.length) return showToast('Select at least one image to upload');

      const submitBtn = uploadForm.querySelector('button[type="submit"]');
      const btnText = submitBtn.querySelector('.btn-text');
      submitBtn.disabled = true;
      btnText.textContent = 'Uploading to Cloud...';

      try {
        const uploadPromises = files.map(file => {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('upload_preset', 't7eq6fqa');

          return fetch('https://api.cloudinary.com/v1_1/ohkgafay/image/upload', {
            method: 'POST',
            body: formData
          }).then(res => {
            if (!res.ok) throw new Error('Failed to upload image');
            return res.json();
          }).then(data => data.secure_url);
        });

        const uploadedUrls = await Promise.all(uploadPromises);

        const newUpload = {
          id: Date.now(),
          title: title,
          author: user.username,
          subject: subject,
          type: type,
          stars: 0,
          purchases: 0,
          class: user.class,
          date: new Date().toISOString(),
          image_urls: uploadedUrls
        };
        
        await db.collection('assignments').add(newUpload);

        showToast('Assignment uploaded to Cloud! ☁️');
        uploadOverlay.classList.add('hidden');
        resetUploadForm();
        renderFeed();
      } catch (error) {
        console.error('Upload Error:', error);
        showToast('Error uploading images ⚠️');
      } finally {
        submitBtn.disabled = false;
        btnText.textContent = 'Upload to Class Hub';
      }
    });
  }

  // ── Expanded View Modal Logic ──
  let currentExpandedAssignment = null;
  const expandedOverlay = document.getElementById('expanded-overlay');
  const expandedCloseBtn = document.getElementById('expanded-close-btn');

  if (feedEl && expandedOverlay) {
    feedEl.addEventListener('click', (e) => {
      const card = e.target.closest('.assignment-card');
      if (!card) return;
      const id = parseInt(card.dataset.id, 10);
      const assignment = dbAssignments.find(a => a.id === id);
      if (assignment) {
        currentExpandedAssignment = assignment;
        openExpandedModal(assignment);
      }
    });
  }

  function openExpandedModal(a) {
    document.getElementById('expanded-title').textContent = a.title;
    document.getElementById('expanded-author').textContent = a.author;
    document.getElementById('expanded-date').textContent = new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    document.getElementById('expanded-subject').textContent = a.subject;
    
    const typeEl = document.getElementById('expanded-type');
    if (a.type) {
      typeEl.textContent = a.type;
      typeEl.style.display = 'inline-block';
    } else {
      typeEl.style.display = 'none';
    }

    const urls = a.image_urls || (a.image_url ? [a.image_url] : []);
    
    document.getElementById('expanded-stars').innerHTML = renderStars(a.stars || 0);
    document.getElementById('expanded-purchases').textContent = a.purchases || 0;
    document.getElementById('expanded-pages').textContent = urls.length;
    
    const bgBlur = document.getElementById('expanded-bg-blur');
    if (urls.length > 0) {
      bgBlur.style.backgroundImage = `url(${urls[0]})`;
    } else {
      bgBlur.style.backgroundImage = 'none';
    }

    expandedOverlay.classList.remove('hidden');
  }

  if (expandedCloseBtn) {
    expandedCloseBtn.addEventListener('click', () => {
      expandedOverlay.classList.add('hidden');
    });
  }
  
  if (expandedOverlay) {
    expandedOverlay.addEventListener('click', (e) => {
      if (e.target === expandedOverlay) {
        expandedOverlay.classList.add('hidden');
      }
    });
  }

  // ── Download Logic ──
  const expandedDownloadBtn = document.getElementById('expanded-download-btn');
  if (expandedDownloadBtn) {
    expandedDownloadBtn.addEventListener('click', () => {
      if (!currentExpandedAssignment) return;
      
      const urls = currentExpandedAssignment.image_urls || (currentExpandedAssignment.image_url ? [currentExpandedAssignment.image_url] : []);
      
      if (urls.length === 0) {
        return showToast('No images available to download');
      }

      showToast('Downloading images... 📥');

      urls.forEach(url => {
        // Add fl_attachment to Cloudinary URL to force download
        const downloadUrl = url.replace('/upload/', '/upload/fl_attachment/');
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = '';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });

      // Increment purchases (downloads) in Firestore
      if (currentExpandedAssignment.fb_id) {
        db.collection('assignments').doc(currentExpandedAssignment.fb_id)
          .update({ purchases: firebase.firestore.FieldValue.increment(1) })
          .catch(err => console.error("Error updating download count", err));
      }
    });
  }

  // ── Logout Logic ──
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      auth.signOut().then(() => {
        localStorage.removeItem('jaji_user');
        window.location.reload();
      });
    });
  }

  // ── Init ──
  setupDropdowns();
  boot();

})();
