const state = { token: localStorage.getItem('framehouse_token'), user: localStorage.getItem('framehouse_user') || '', page: 1, limit: 8, totalPages: 1, images: [], selectedImage: null, registerMode: false, activeTab: 'library', originalPreviewIds: new Set() };

const $ = (selector) => document.querySelector(selector);
const authView = $('#authView');
const appView = $('#appView');
const toast = $('#toast');

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.className = `toast visible${isError ? ' error' : ''}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.className = 'toast'; }, 3500);
}

function errorMessage(error) {
  if (Array.isArray(error?.message)) return error.message.join(', ');
  return error?.message || 'Something went wrong. Try again.';
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(data));
  return data;
}

function setAuthenticated(token, username) {
  state.token = token;
  state.user = username;
  localStorage.setItem('framehouse_token', token);
  localStorage.setItem('framehouse_user', username);
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  $('#userName').textContent = username;
  loadImages();
}

function setAuthMode(register) {
  state.registerMode = register;
  $('#authTitle').textContent = register ? 'Make it yours.' : 'Welcome back.';
  $('#authSubtitle').textContent = register ? 'Create a private image workspace.' : 'Sign in to your image workspace.';
  $('#authSubmit').innerHTML = register ? 'Create workspace <span>↗</span>' : 'Sign in <span>↗</span>';
  $('#authToggle').innerHTML = register ? 'Already have a workspace? <strong>Sign in</strong>' : 'Need an account? <strong>Create one</strong>';
  $('#authError').textContent = '';
}

$('#authToggle').addEventListener('click', () => setAuthMode(!state.registerMode));
$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = $('#authUsername').value.trim();
  const password = $('#authPassword').value;
  const endpoint = state.registerMode ? '/auth/register' : '/auth/login';
  const submit = $('#authSubmit');
  submit.disabled = true;
  $('#authError').textContent = '';
  try {
    const result = await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    if (state.registerMode) {
      setAuthMode(false);
      $('#authUsername').value = username;
      $('#authPassword').value = password;
      showToast('Workspace created. Sign in to continue.');
    } else {
      setAuthenticated(result.access_token, username);
    }
  } catch (error) {
    $('#authError').textContent = error.message;
  } finally { submit.disabled = false; }
});

function imageCard(image) {
  const metadata = image.metadata || {};
  const transformedUrls = image.transformedUrls || [];
  const showingOriginal = state.originalPreviewIds.has(image.id);
  const previewUrl = showingOriginal ? image.url : (transformedUrls[transformedUrls.length - 1] || image.url);
  const versionLabel = showingOriginal || !transformedUrls.length ? 'original' : 'latest version';
  const favoriteLabel = image.isFavorite ? '★' : '☆';
  const favoriteClass = image.isFavorite ? ' favorite-active' : '';
  const previewToggle = transformedUrls.length
    ? (showingOriginal
      ? `<button class="card-button" data-preview-latest="${image.id}">Show latest</button>`
      : `<button class="card-button" data-preview-original="${image.id}">Revert to original</button>`)
    : '';
  return `<article class="image-card">
    <div class="image-visual"><a href="${previewUrl}" target="_blank" rel="noreferrer"><img class="image-preview" src="${previewUrl}" alt="Uploaded frame" loading="lazy" /></a><button class="favorite-button${favoriteClass}" data-favorite="${image.id}" title="Toggle favorite">${favoriteLabel}</button></div>
    <div class="image-meta"><h3>${metadata.format?.toUpperCase() || 'IMAGE'} ${versionLabel}</h3><p>${metadata.width || '—'} × ${metadata.height || '—'} px · ${formatBytes(metadata.size)}</p><div class="card-actions"><button class="card-button" data-transform="${image.id}">Transform</button>${previewToggle}<button class="card-button delete" data-delete="${image.id}">Delete</button></div></div>
  </article>`;
}

function setupRotationControl() {
  const select = $('#transformRotate');
  if (!select) return;

  const range = document.createElement('input');
  range.id = 'transformRotate';
  range.type = 'range';
  range.min = '0';
  range.max = '360';
  range.step = '1';
  range.value = '0';
  range.className = 'rotation-range';

  const label = document.createElement('span');
  label.className = 'rotation-value';
  label.id = 'rotationValue';
  label.textContent = '0°';

  const title = select.closest('.field')?.querySelector('span');
  if (title) {
    title.textContent = 'Rotate ';
    title.appendChild(label);
  }

  const presets = document.createElement('span');
  presets.className = 'rotation-presets';
  [0, 90, 180, 270].forEach((angle) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${angle}°`;
    button.addEventListener('click', () => {
      range.value = angle;
      label.textContent = `${angle}°`;
    });
    presets.appendChild(button);
  });

  range.addEventListener('input', () => { label.textContent = `${range.value}°`; });
  select.replaceWith(range);
  range.closest('.field')?.appendChild(presets);
}

setupRotationControl();

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function loadImages() {
  $('#gallery').classList.add('is-loading');
  try {
    const endpoint = state.activeTab === 'favorites' ? '/images/favorites' : '/images';
    const result = await request(`${endpoint}?page=${state.page}&limit=${state.limit}`);
    const loadedImages = result.data || [];
    state.images = loadedImages.map((image) => {
      const cachedImage = state.images.find((cached) => cached.id === image.id);
      return {
        ...image,
        transformedUrls: image.transformedUrls?.length
          ? image.transformedUrls
          : cachedImage?.transformedUrls || [],
      };
    });
    state.totalPages = result.meta?.totalPages || 1;
    $('#gallery').innerHTML = state.images.map(imageCard).join('');
    $('#imageCount').textContent = result.meta?.total ?? state.images.length;
    $('#resultLabel').textContent = `(${result.meta?.total ?? state.images.length})`;
    $('#pageLabel').textContent = `${state.page} / ${state.totalPages}`;
    $('#prevPage').disabled = state.page <= 1;
    $('#nextPage').disabled = state.page >= state.totalPages;
    $('#emptyState').classList.toggle('hidden', state.images.length > 0);
    $('#collectionTitle').firstChild.textContent = state.activeTab === 'favorites' ? 'Favorite frames ' : 'Recent frames ';
    $('#emptyState h3').textContent = state.activeTab === 'favorites' ? 'No favorites yet.' : 'Your library is waiting.';
    $('#emptyState p').textContent = state.activeTab === 'favorites' ? 'Star an image to keep it close.' : 'Upload your first image to start shaping the collection.';
    $('#latestFormat').textContent = state.images[0]?.metadata?.format?.toUpperCase() || '—';
  } catch (error) {
    showToast(error.message, true);
  } finally { $('#gallery').classList.remove('is-loading'); }
}

$('#gallery').addEventListener('click', async (event) => {
  const transformButton = event.target.closest('[data-transform]');
  const deleteButton = event.target.closest('[data-delete]');
  const favoriteButton = event.target.closest('[data-favorite]');
  const originalButton = event.target.closest('[data-preview-original]');
  const latestButton = event.target.closest('[data-preview-latest]');
  if (transformButton) openTransform(transformButton.dataset.transform);
  if (favoriteButton) {
    try { await request(`/images/${favoriteButton.dataset.favorite}/favorite`, { method: 'PATCH' }); showToast('Favorites updated.'); loadImages(); }
    catch (error) { showToast(error.message, true); }
  }
  if (originalButton) { state.originalPreviewIds.add(originalButton.dataset.previewOriginal); $('#gallery').innerHTML = state.images.map(imageCard).join(''); }
  if (latestButton) { state.originalPreviewIds.delete(latestButton.dataset.previewLatest); $('#gallery').innerHTML = state.images.map(imageCard).join(''); }
  if (deleteButton) {
    if (!window.confirm('Delete this image and all transformed versions?')) return;
    try { await request(`/images/${deleteButton.dataset.delete}`, { method: 'DELETE' }); showToast('Image removed from the library.'); loadImages(); }
    catch (error) { showToast(error.message, true); }
  }
});

function openTransform(id) { state.selectedImage = state.images.find((image) => image.id === id); $('#transformModal').classList.remove('hidden'); }
function closeTransform() { $('#transformModal').classList.add('hidden'); $('#transformForm').reset(); $('#transformQuality').value = 80; $('#qualityValue').textContent = '80'; $('#transformRotate').value = 0; $('#rotationValue').textContent = '0°'; }
$('#closeModal').addEventListener('click', closeTransform);
$('#transformModal').addEventListener('click', (event) => { if (event.target === $('#transformModal')) closeTransform(); });
$('#transformQuality').addEventListener('input', (event) => { $('#qualityValue').textContent = event.target.value; });
$('#transformForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedImage) return;
  const width = Number($('#transformWidth').value);
  const height = Number($('#transformHeight').value);
  const body = { filters: { grayscale: $('#filterGrayscale').checked, mirror: $('#filterMirror').checked, flip: $('#filterFlip').checked, sepia: $('#filterSepia').checked } };
  if (width && height) body.resize = { width, height };
  const rotate = Number($('#transformRotate').value);
  if (rotate) body.rotate = rotate;
  if ($('#transformFormat').value) body.format = $('#transformFormat').value;
  body.compress = { quality: Number($('#transformQuality').value) };
  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await request(`/images/${state.selectedImage.id}/transform`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const transformedImage = state.images.find((image) => image.id === state.selectedImage.id);
    if (transformedImage && result.url) {
      transformedImage.transformedUrls = [...(transformedImage.transformedUrls || []), result.url];
    }
    state.originalPreviewIds.delete(state.selectedImage.id);
    closeTransform();
    showToast('New version created.');
    loadImages();
  }
  catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
});

function openFilePicker() { $('#fileInput').click(); }
$('#chooseFileButton').addEventListener('click', openFilePicker);
$('#openUploadButton').addEventListener('click', () => { $('#uploadSection').scrollIntoView({ behavior: 'smooth' }); openFilePicker(); });
$('#newUploadNav').addEventListener('click', () => { $('#uploadSection').scrollIntoView({ behavior: 'smooth' }); openFilePicker(); });
$('#fileInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  try { await request('/images', { method: 'POST', body: formData }); showToast('Image added to your library.'); state.page = 1; loadImages(); }
  catch (error) { showToast(error.message, true); }
  event.target.value = '';
});
$('#refreshButton').addEventListener('click', loadImages);
function switchTab(tab) {
  state.activeTab = tab;
  state.page = 1;
  $('#libraryNav').classList.toggle('active', tab === 'library');
  $('#favoritesNav').classList.toggle('active', tab === 'favorites');
  loadImages();
}
$('#libraryNav').addEventListener('click', () => switchTab('library'));
$('#favoritesNav').addEventListener('click', () => switchTab('favorites'));
$('#prevPage').addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadImages(); } });
$('#nextPage').addEventListener('click', () => { if (state.page < state.totalPages) { state.page += 1; loadImages(); } });
$('#logoutButton').addEventListener('click', () => { localStorage.removeItem('framehouse_token'); localStorage.removeItem('framehouse_user'); window.location.reload(); });

if (state.token) { authView.classList.add('hidden'); appView.classList.remove('hidden'); $('#userName').textContent = state.user || 'creator'; loadImages(); }
