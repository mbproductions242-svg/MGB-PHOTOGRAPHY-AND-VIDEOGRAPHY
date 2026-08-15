// public/js/admin.js — small UX helpers for the admin dashboard (drag/drop upload, copy link)

function copyLink() {
  const el = document.getElementById('gallery-link');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent.trim()).then(() => {
    const btn = event.target;
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = original), 1500);
  });
}

(function setupDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const label = document.getElementById('dropzone-label');
  const form = document.getElementById('upload-form');
  const uploadBtn = document.getElementById('upload-btn');
  if (!dropzone || !fileInput) return;

  function updateLabel() {
    const n = fileInput.files.length;
    label.innerHTML = n
      ? `<strong>${n} photo${n === 1 ? '' : 's'} selected</strong><br /><small>Tap Upload to continue, or choose different files</small>`
      : 'Tap to choose photos, or drag &amp; drop here<br /><small>JPG/PNG · multiple files supported</small>';
  }

  fileInput.addEventListener('change', updateLabel);

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      updateLabel();
    }
  });

  if (form) {
    form.addEventListener('submit', () => {
      if (fileInput.files.length === 0) return;
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading…';
    });
  }
})();
