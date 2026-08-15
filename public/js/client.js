// public/js/client.js — client gallery interactions: favoriting, lightbox, comments, approval.

(function () {
  const body = document.body;
  const slug = body.dataset.slug;
  const downloadsEnabled = body.dataset.downloads === '1';
  const photos = window.GALLERY_PHOTOS || [];
  let currentIndex = -1;

  const favCountEl = document.getElementById('fav-count');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxFavBtn = document.getElementById('lightbox-fav');
  const lightboxDownload = document.getElementById('lightbox-download');
  const commentList = document.getElementById('lightbox-comments');
  const commentForm = document.getElementById('comment-form');
  const commentInput = document.getElementById('comment-input');

  function updateFavCount() {
    const count = photos.filter((p) => p.favorited).length;
    if (favCountEl) favCountEl.textContent = count;
  }

  function setTileFavState(photoId, favorited) {
    const tile = document.querySelector(`.photo-tile[data-photo-id="${photoId}"] .fav-btn`);
    if (tile) tile.classList.toggle('active', favorited);
    const p = photos.find((x) => x.id === photoId);
    if (p) p.favorited = favorited;
    updateFavCount();
    if (currentIndex >= 0 && photos[currentIndex] && photos[currentIndex].id === photoId) {
      lightboxFavBtn.classList.toggle('active', favorited);
      lightboxFavBtn.textContent = favorited ? '♥ Favorited' : '♥ Favorite';
    }
  }

  async function toggleFavorite(photoId) {
    try {
      const res = await fetch(`/gallery/${slug}/photos/${photoId}/favorite`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Could not update favorite.');
        return;
      }
      setTileFavState(photoId, data.favorited);
    } catch (e) {
      alert('Network error — please try again.');
    }
  }

  document.querySelectorAll('.fav-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(Number(btn.dataset.photoId));
    });
  });

  // ---------- Lightbox ----------

  function openLightbox(index) {
    currentIndex = index;
    const photo = photos[index];
    if (!photo) return;
    lightboxImg.src = `/gallery/${slug}/photos/${photo.id}/preview`;
    lightboxFavBtn.classList.toggle('active', photo.favorited);
    lightboxFavBtn.textContent = photo.favorited ? '♥ Favorited' : '♥ Favorite';
    if (downloadsEnabled && lightboxDownload) {
      lightboxDownload.href = `/gallery/${slug}/photos/${photo.id}/download`;
    }
    loadComments(photo.id);
    lightbox.classList.add('open');
    body.classList.add('lightbox-active');
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    body.classList.remove('lightbox-active');
    currentIndex = -1;
  }

  function navigate(delta) {
    if (currentIndex < 0) return;
    const next = (currentIndex + delta + photos.length) % photos.length;
    openLightbox(next);
  }

  document.querySelectorAll('.photo-tile .open-lightbox').forEach((img) => {
    img.addEventListener('click', () => {
      const tile = img.closest('.photo-tile');
      openLightbox(Number(tile.dataset.index));
    });
  });

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', () => navigate(-1));
  document.getElementById('lightbox-next').addEventListener('click', () => navigate(1));
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });

  lightboxFavBtn.addEventListener('click', () => {
    if (currentIndex < 0) return;
    toggleFavorite(photos[currentIndex].id);
  });

  // ---------- Comments ----------

  async function loadComments(photoId) {
    commentList.innerHTML = '<div>Loading…</div>';
    try {
      const res = await fetch(`/gallery/${slug}/photos/${photoId}/comments`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        commentList.innerHTML = '<div style="opacity:0.6;">No notes yet.</div>';
        return;
      }
      commentList.innerHTML = data
        .map((c) => `<div><strong>${c.author === 'admin' ? 'Photographer' : 'You'}:</strong> ${escapeHtml(c.body)}</div>`)
        .join('');
      commentList.scrollTop = commentList.scrollHeight;
    } catch (e) {
      commentList.innerHTML = '<div>Could not load notes.</div>';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentIndex < 0) return;
    const body = commentInput.value.trim();
    if (!body) return;
    const photoId = photos[currentIndex].id;
    try {
      const res = await fetch(`/gallery/${slug}/photos/${photoId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error('failed');
      commentInput.value = '';
      loadComments(photoId);
    } catch (e) {
      alert('Could not send your note — please try again.');
    }
  });

  // ---------- Approve ----------

  const approveBtn = document.getElementById('approve-btn');
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      const favCount = photos.filter((p) => p.favorited).length;
      const proceed = confirm(
        favCount > 0
          ? `Approve your ${favCount} favorited photo${favCount === 1 ? '' : 's'} as final? Your photographer will be notified.`
          : "You haven't favorited any photos yet. Approve anyway?"
      );
      if (!proceed) return;
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `/gallery/${slug}/approve`;
      document.body.appendChild(form);
      form.submit();
    });
  }
})();
